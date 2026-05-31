import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parcelAPI } from '../services/api';

function CreateParcel() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    sender_name: '',
    sender_phone: '',
    sender_address: '',
    sender_lat: 39.9042,
    sender_lng: 116.4074,
    receiver_name: '',
    receiver_phone: '',
    receiver_address: '',
    receiver_lat: 31.2304,
    receiver_lng: 121.4737,
    weight: '',
    shipping_method: 'land'
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await parcelAPI.createParcel({
        ...formData,
        weight: parseFloat(formData.weight)
      });
      
      setSuccess(`包裹创建成功！运单号：${response.data.tracking_number}`);
      
      setTimeout(() => {
        navigate(`/trace/${response.data.tracking_number}`);
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || '创建包裹失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <h2>创建新包裹</h2>

        {success && <div className="alert alert-success">{success}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <div>
              <h3 style={{ marginBottom: '16px', color: '#555' }}>寄件人信息</h3>
              
              <div className="form-group">
                <label>姓名 *</label>
                <input
                  type="text"
                  name="sender_name"
                  value={formData.sender_name}
                  onChange={handleChange}
                  placeholder="请输入寄件人姓名"
                  required
                />
              </div>

              <div className="form-group">
                <label>电话 *</label>
                <input
                  type="tel"
                  name="sender_phone"
                  value={formData.sender_phone}
                  onChange={handleChange}
                  placeholder="请输入联系电话"
                  required
                />
              </div>

              <div className="form-group">
                <label>地址 *</label>
                <textarea
                  name="sender_address"
                  value={formData.sender_address}
                  onChange={handleChange}
                  placeholder="请输入详细地址"
                  rows="3"
                  required
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>纬度</label>
                  <input
                    type="number"
                    step="0.000001"
                    name="sender_lat"
                    value={formData.sender_lat}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>经度</label>
                  <input
                    type="number"
                    step="0.000001"
                    name="sender_lng"
                    value={formData.sender_lng}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: '16px', color: '#555' }}>收件人信息</h3>
              
              <div className="form-group">
                <label>姓名 *</label>
                <input
                  type="text"
                  name="receiver_name"
                  value={formData.receiver_name}
                  onChange={handleChange}
                  placeholder="请输入收件人姓名"
                  required
                />
              </div>

              <div className="form-group">
                <label>电话 *</label>
                <input
                  type="tel"
                  name="receiver_phone"
                  value={formData.receiver_phone}
                  onChange={handleChange}
                  placeholder="请输入联系电话"
                  required
                />
              </div>

              <div className="form-group">
                <label>地址 *</label>
                <textarea
                  name="receiver_address"
                  value={formData.receiver_address}
                  onChange={handleChange}
                  placeholder="请输入详细地址"
                  rows="3"
                  required
                />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>纬度</label>
                  <input
                    type="number"
                    step="0.000001"
                    name="receiver_lat"
                    value={formData.receiver_lat}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>经度</label>
                  <input
                    type="number"
                    step="0.000001"
                    name="receiver_lng"
                    value={formData.receiver_lng}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #eee' }}>
            <h3 style={{ marginBottom: '16px', color: '#555' }}>包裹信息</h3>
            
            <div className="grid-2">
              <div className="form-group">
                <label>重量 (kg) *</label>
                <input
                  type="number"
                  step="0.01"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  placeholder="请输入包裹重量"
                  required
                />
              </div>

              <div className="form-group">
                <label>运输方式 *</label>
                <select
                  name="shipping_method"
                  value={formData.shipping_method}
                  onChange={handleChange}
                >
                  <option value="land">🚛 陆运 (标准时效8小时)</option>
                  <option value="air">✈️ 航空 (标准时效4小时)</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/parcels')}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '创建中...' : '创建包裹'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateParcel;
