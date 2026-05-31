import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useDeviceStore } from '../store/deviceStore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setCurrentUser = useDeviceStore((s) => s.setCurrentUser);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authApi.login(username, password);
      const { token, user_id, username: uname, role } = res.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ id: user_id, username: uname, role }));

      setCurrentUser({ id: user_id, username: uname, role, created_at: '' });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>数字孪生调试台</h1>
        <p>Industrial Digital Twin Debug Platform</p>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 12px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              borderRadius: 4,
              fontSize: 13,
              color: '#fca5a5',
              marginBottom: 16
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: 14 }}
            disabled={loading}
          >
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#64748b' }}>
            默认账号: admin / engineer / maintainer
          </p>
          <p style={{ fontSize: 12, color: '#64748b' }}>
            密码: 123456
          </p>
        </div>
      </div>
    </div>
  );
}
