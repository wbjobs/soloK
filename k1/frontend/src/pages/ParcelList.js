import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { parcelAPI } from '../services/api';

function ParcelList() {
  const [parcels, setParcels] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchParcels = useCallback(async () => {
    try {
      setLoading(true);
      const response = await parcelAPI.getParcels({
        page,
        limit,
        status: statusFilter || undefined
      });
      setParcels(response.data.parcels);
      setTotal(response.data.total);
    } catch (error) {
      console.error('获取包裹列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter]);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  const getStatusBadge = (status) => {
    const badges = {
      created: { class: 'badge-info', text: '已创建' },
      in_transit: { class: 'badge-warning', text: '运输中' },
      delivered: { class: 'badge-success', text: '已送达' }
    };
    const badge = badges[status] || { class: 'badge-info', text: status };
    return <span className={`badge ${badge.class}`}>{badge.text}</span>;
  };

  const getShippingMethod = (method) => {
    return method === 'air' ? '✈️ 航空' : '🚛 陆运';
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>包裹列表</h2>
          <Link to="/create-parcel" className="btn btn-primary">+ 创建包裹</Link>
        </div>

        <div className="search-bar">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ width: '200px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          >
            <option value="">全部状态</option>
            <option value="created">已创建</option>
            <option value="in_transit">运输中</option>
            <option value="delivered">已送达</option>
          </select>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>运单号</th>
                  <th>寄件人</th>
                  <th>收件人</th>
                  <th>重量</th>
                  <th>运输方式</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {parcels.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                      暂无包裹数据
                    </td>
                  </tr>
                ) : (
                  parcels.map((parcel) => (
                    <tr key={parcel.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>
                        {parcel.tracking_number}
                      </td>
                      <td>{parcel.sender_name}</td>
                      <td>{parcel.receiver_name}</td>
                      <td>{parcel.weight} kg</td>
                      <td>{getShippingMethod(parcel.shipping_method)}</td>
                      <td>{getStatusBadge(parcel.status)}</td>
                      <td>{new Date(parcel.created_at).toLocaleString('zh-CN')}</td>
                      <td>
                        <Link
                          to={`/trace/${parcel.tracking_number}`}
                          className="btn btn-sm btn-primary"
                          style={{ textDecoration: 'none' }}
                        >
                          查看轨迹
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  上一页
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={page === p ? 'active' : ''}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ParcelList;
