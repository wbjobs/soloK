import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (location.pathname === '/login') {
    return null;
  }

  return (
    <nav className="navbar">
      <h1>📦 邮政包裹路径追溯系统</h1>
      <ul>
        {isAuthenticated ? (
          <>
            <li><Link to="/parcels">包裹列表</Link></li>
            <li><Link to="/create-parcel">创建包裹</Link></li>
            <li><Link to="/trace">路径追溯</Link></li>
            <li style={{ marginLeft: '1rem', opacity: 0.9 }}>
              {user?.name} ({user?.role === 'admin' ? '管理员' : '快递员'})
            </li>
            <li><button onClick={handleLogout}>退出</button></li>
          </>
        ) : (
          <li><Link to="/login">登录</Link></li>
        )}
      </ul>
    </nav>
  );
}

export default Navbar;
