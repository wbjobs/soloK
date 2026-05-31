const express = require('express');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const STANDARD_DURATION = {
  air: 4 * 60 * 60 * 1000,
  land: 8 * 60 * 60 * 1000
};

function checkTimeout(node, shippingMethod) {
  if (!node.arrived_at || !node.departed_at) {
    return false;
  }
  
  const arrival = new Date(node.arrived_at).getTime();
  const departure = new Date(node.departed_at).getTime();
  const duration = departure - arrival;
  
  return duration > STANDARD_DURATION[shippingMethod];
}

function calculateDuration(node) {
  if (!node.arrived_at || !node.departed_at) {
    return null;
  }
  
  const arrival = new Date(node.arrived_at).getTime();
  const departure = new Date(node.departed_at).getTime();
  return departure - arrival;
}

router.post('/scan', authenticateToken, async (req, res) => {
  try {
    const {
      parcel_id, node_type, node_name,
      latitude, longitude, scan_type
    } = req.body;

    if (scan_type === 'arrival') {
      const [result] = await pool.execute(
        `INSERT INTO tracking_nodes (
          parcel_id, node_type, node_name, latitude, longitude, arrived_at, scanned_by
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
        [parcel_id, node_type, node_name, latitude, longitude, req.user.id]
      );

      await pool.execute(
        'UPDATE parcels SET status = ? WHERE id = ?',
        ['in_transit', parcel_id]
      );

      res.json({
        id: result.insertId,
        message: '到达扫描成功'
      });
    } else if (scan_type === 'departure') {
      const [nodes] = await pool.execute(
        'SELECT id FROM tracking_nodes WHERE parcel_id = ? AND departed_at IS NULL ORDER BY arrived_at DESC LIMIT 1',
        [parcel_id]
      );

      if (nodes.length === 0) {
        return res.status(400).json({ error: '没有待出发的节点记录' });
      }

      await pool.execute(
        'UPDATE tracking_nodes SET departed_at = NOW() WHERE id = ?',
        [nodes[0].id]
      );

      res.json({
        id: nodes[0].id,
        message: '出发扫描成功'
      });
    } else {
      res.status(400).json({ error: '无效的扫描类型' });
    }
  } catch (error) {
    console.error('扫描节点错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

async function getPrediction(parcel, currentNodes) {
  try {
    if (!parcel.sender_address || !parcel.receiver_address) {
      return null;
    }

    const [historicalParcels] = await pool.execute(
      `SELECT DISTINCT p.id 
       FROM parcels p
       WHERE p.id != ? 
         AND p.shipping_method = ?
         AND p.status = 'delivered'
         AND p.sender_address LIKE ?
         AND p.receiver_address LIKE ?
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [
        parcel.id,
        parcel.shipping_method,
        `%${parcel.sender_address.substring(0, 10)}%`,
        `%${parcel.receiver_address.substring(0, 10)}%`
      ]
    );

    if (historicalParcels.length === 0) {
      return null;
    }

    const parcelIds = historicalParcels.map(p => p.id);
    const placeholders = parcelIds.map(() => '?').join(',');

    const [allHistoricalNodes] = await pool.execute(
      `SELECT parcel_id, node_type, node_name, latitude, longitude, arrived_at, departed_at
       FROM tracking_nodes
       WHERE parcel_id IN (${placeholders})
       ORDER BY parcel_id, arrived_at ASC`,
      parcelIds
    );

    const routes = {};
    allHistoricalNodes.forEach(node => {
      if (!routes[node.parcel_id]) {
        routes[node.parcel_id] = [];
      }
      routes[node.parcel_id].push(node);
    });

    const segmentDurations = {};
    Object.values(routes).forEach(route => {
      for (let i = 0; i < route.length - 1; i++) {
        const from = route[i];
        const to = route[i + 1];
        const key = `${from.node_name}->${to.node_name}`;
        
        if (from.departed_at && to.arrived_at) {
          const transportTime = new Date(to.arrived_at).getTime() - new Date(from.departed_at).getTime();
          const stayDuration = from.departed_at && from.arrived_at 
            ? new Date(from.departed_at).getTime() - new Date(from.arrived_at).getTime()
            : 0;
          
          if (!segmentDurations[key]) {
            segmentDurations[key] = { transport: [], stay: [] };
          }
          if (transportTime > 0 && transportTime < 7 * 24 * 60 * 60 * 1000) {
            segmentDurations[key].transport.push(transportTime);
          }
          if (stayDuration > 0) {
            segmentDurations[key].stay.push(stayDuration);
          }
        }
      }
    });

    const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    if (currentNodes.length === 0) {
      const firstSegments = Object.values(routes)
        .filter(r => r.length > 0)
        .map(r => r[0]);
      
      if (firstSegments.length > 0) {
        const firstNode = firstSegments[0];
        const firstArrivalTimes = firstSegments.map(s => {
          if (s.arrived_at) {
            return new Date(s.arrived_at).getTime() - new Date(s.arrived_at).getTime() + 2 * 60 * 60 * 1000;
          }
          return 2 * 60 * 60 * 1000;
        });
        
        return {
          next_node: {
            node_type: firstNode.node_type,
            node_name: firstNode.node_name,
            latitude: parseFloat(firstNode.latitude),
            longitude: parseFloat(firstNode.longitude)
          },
          estimated_arrival: new Date(Date.now() + avg(firstArrivalTimes)).toISOString(),
          confidence: Math.min(historicalParcels.length * 10, 100),
          historical_sample_count: historicalParcels.length
        };
      }
      return null;
    }

    const lastNode = currentNodes[currentNodes.length - 1];
    const lastNodeName = lastNode.node_name;

    let foundNext = null;
    let minTransportTime = null;

    for (const [key, data] of Object.entries(segmentDurations)) {
      const [from, to] = key.split('->');
      if (from === lastNodeName && data.transport.length > 0) {
        const avgTransport = avg(data.transport);
        if (!minTransportTime || avgTransport < minTransportTime) {
          minTransportTime = avgTransport;
          
          const targetNodes = allHistoricalNodes.filter(n => n.node_name === to);
          if (targetNodes.length > 0) {
            foundNext = {
              node_type: targetNodes[0].node_type,
              node_name: to,
              latitude: parseFloat(targetNodes[0].latitude),
              longitude: parseFloat(targetNodes[0].longitude)
            };
          }
        }
      }
    }

    if (foundNext && minTransportTime) {
      const baseTime = lastNode.departed_at ? new Date(lastNode.departed_at).getTime() : Date.now();
      
      return {
        next_node: foundNext,
        estimated_arrival: new Date(baseTime + minTransportTime).toISOString(),
        confidence: Math.min(historicalParcels.length * 10, 100),
        historical_sample_count: historicalParcels.length,
        estimated_transport_duration_ms: minTransportTime
      };
    }

    return null;
  } catch (error) {
    console.error('预测计算错误:', error);
    return null;
  }
}

router.get('/:trackingNumber/trace', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const [parcels] = await pool.execute(
      'SELECT * FROM parcels WHERE tracking_number = ?',
      [trackingNumber]
    );

    if (parcels.length === 0) {
      return res.status(404).json({ error: '包裹不存在' });
    }

    const parcel = parcels[0];

    const [nodes] = await pool.execute(
      `SELECT tn.*, u.name as scanner_name
       FROM tracking_nodes tn
       LEFT JOIN users u ON tn.scanned_by = u.id
       WHERE tn.parcel_id = ?
       ORDER BY tn.arrived_at ASC, tn.created_at ASC`,
      [parcel.id]
    );

    const tracePath = nodes.map(node => {
      const isTimeout = checkTimeout(node, parcel.shipping_method);
      const duration = calculateDuration(node);

      return {
        id: node.id,
        node_type: node.node_type,
        node_name: node.node_name,
        latitude: parseFloat(node.latitude),
        longitude: parseFloat(node.longitude),
        arrived_at: node.arrived_at,
        departed_at: node.departed_at,
        duration_ms: duration,
        scanner_name: node.scanner_name,
        is_timeout: isTimeout
      };
    });

    const prediction = parcel.status !== 'delivered' 
      ? await getPrediction(parcel, tracePath) 
      : null;

    res.json({
      tracking_number: parcel.tracking_number,
      shipping_method: parcel.shipping_method,
      status: parcel.status,
      sender: {
        name: parcel.sender_name,
        address: parcel.sender_address,
        latitude: parcel.sender_lat ? parseFloat(parcel.sender_lat) : null,
        longitude: parcel.sender_lng ? parseFloat(parcel.sender_lng) : null
      },
      receiver: {
        name: parcel.receiver_name,
        address: parcel.receiver_address,
        latitude: parcel.receiver_lat ? parseFloat(parcel.receiver_lat) : null,
        longitude: parcel.receiver_lng ? parseFloat(parcel.receiver_lng) : null
      },
      trace_path: tracePath,
      prediction
    });
  } catch (error) {
    console.error('获取路径追溯错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:trackingNumber/prediction', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const [parcels] = await pool.execute(
      'SELECT * FROM parcels WHERE tracking_number = ?',
      [trackingNumber]
    );

    if (parcels.length === 0) {
      return res.status(404).json({ error: '包裹不存在' });
    }

    const parcel = parcels[0];

    if (parcel.status === 'delivered') {
      return res.json({ prediction: null, message: '包裹已送达' });
    }

    const [nodes] = await pool.execute(
      `SELECT * FROM tracking_nodes
       WHERE parcel_id = ?
       ORDER BY arrived_at ASC, created_at ASC`,
      [parcel.id]
    );

    const prediction = await getPrediction(parcel, nodes);

    res.json({
      tracking_number: trackingNumber,
      prediction
    });
  } catch (error) {
    console.error('获取预测错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
