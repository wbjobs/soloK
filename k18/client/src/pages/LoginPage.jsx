import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import useRoomStore from '../store/roomStore';
import { Stethoscope, User, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('expert');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setUser = useRoomStore((s) => s.setUser);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.login(username, password, role);
      localStorage.setItem('token', data.token);
      setUser(data.user, data.token, data.user.role);

      if (data.user.role === 'device') {
        navigate('/device');
      } else {
        navigate('/expert');
      }
    } catch (err) {
      setError(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Stethoscope size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">远程超声实时会诊系统</h1>
          <p className="text-gray-400">请登录以继续</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-gray-300 text-sm mb-2">用户名</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                placeholder="输入用户名"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              placeholder="输入密码"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-2">角色</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('expert')}
                className={`py-3 px-4 rounded-lg border-2 transition-colors ${
                  role === 'expert'
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                会诊专家
              </button>
              <button
                type="button"
                onClick={() => setRole('device')}
                className={`py-3 px-4 rounded-lg border-2 transition-colors ${
                  role === 'device'
                    ? 'bg-green-600 border-green-500 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                }`}
              >
                超声设备
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn size={18} />
                登录
              </>
            )}
          </button>
        </form>

        <div className="mt-4 text-center text-gray-500 text-sm">
          <p>提示：专家端用于会诊，设备端用于推送超声视频流</p>
        </div>
      </div>
    </div>
  );
}
