import React from 'react';
import { Shield } from 'lucide-react';
import './Header.css';

function Header() {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <Shield size={36} className="logo-icon" />
          <div>
            <h1 className="title">语音深度伪造检测取证系统</h1>
            <p className="subtitle">Voice Forgery Detection & Forensics System</p>
          </div>
        </div>
        <div className="version-badge">v1.0.0</div>
      </div>
    </header>
  );
}

export default Header;
