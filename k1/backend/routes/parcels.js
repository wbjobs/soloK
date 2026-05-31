const express = require('express');
const pool = require('../config/db');
const { generateTrackingNumber, validateTrackingNumber } = require('../utils/trackingGenerator');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      sender_name, sender_phone, sender_address, sender_lat, sender_lng,
      receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
      weight, shipping_method
    } = req.body;

    let trackingNumber;
    let isUnique = false;

    while (!isUnique) {
      trackingNumber = generateTrackingNumber();
      const [existing] = await pool.execute(
        'SELECT id FROM parcels WHERE tracking_number = ?',
        [trackingNumber]
      );
      if (existing.length === 0) {
        isUnique = true;
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO parcels (
        tracking_number, sender_name, sender_phone, sender_address, sender_lat, sender_lng,
        receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
        weight, shipping_method, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trackingNumber, sender_name, sender_phone, sender_address, sender_lat || null, sender_lng || null,
        receiver_name, receiver_phone, receiver_address, receiver_lat || null, receiver_lng || null,
        weight, shipping_method, req.user.id
      ]
    );

    res.status(201).json({
      id: result.insertId,
      tracking_number: trackingNumber,
      message: '包裹创建成功'
    });
  } catch (error) {
    console.error('创建包裹错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM parcels';
    let params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.execute(query, params);

    const [countResult] = await pool.execute(
      status ? 'SELECT COUNT(*) as total FROM parcels WHERE status = ?' : 'SELECT COUNT(*) as total FROM parcels',
      status ? [status] : []
    );

    res.json({
      parcels: rows,
      total: countResult[0].total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('获取包裹列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:trackingNumber', authenticateToken, async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!validateTrackingNumber(trackingNumber)) {
      return res.status(400).json({ error: '无效的运单号格式' });
    }

    const [rows] = await pool.execute(
      'SELECT * FROM parcels WHERE tracking_number = ?',
      [trackingNumber]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: '包裹不存在' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('获取包裹详情错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
