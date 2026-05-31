import { useState, useEffect } from 'react';
import './SecurityConfirmation.css';

function SecurityConfirmation({ socket }) {
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [currentConfirmation, setCurrentConfirmation] = useState(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!socket) return;

    fetchPendingConfirmations();

    socket.on('security-confirmation-required', (data) => {
      console.log('Security confirmation required:', data);
      setCurrentConfirmation(data);
      setShowModal(true);
      setCountdown(60);
    });

    socket.on('security-pending', (data) => {
      fetchPendingConfirmations();
    });

    socket.on('security-approved', (data) => {
      console.log('Event approved:', data);
      setShowModal(false);
      setCurrentConfirmation(null);
    });

    socket.on('security-rejected', (data) => {
      console.log('Event rejected:', data);
      setShowModal(false);
      setCurrentConfirmation(null);
    });

    return () => {
      socket.off('security-confirmation-required');
      socket.off('security-pending');
      socket.off('security-approved');
      socket.off('security-rejected');
    };
  }, [socket]);

  useEffect(() => {
    if (countdown > 0 && showModal) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && showModal) {
      setShowModal(false);
      setCurrentConfirmation(null);
    }
  }, [countdown, showModal]);

  const fetchPendingConfirmations = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/security/confirmations/pending');
      const data = await response.json();
      setPendingConfirmations(data.confirmations || []);
    } catch (error) {
      console.error('Failed to fetch pending confirmations:', error);
    }
  };

  const handleApprove = async () => {
    if (!currentConfirmation) return;
    
    try {
      await fetch(`http://localhost:3001/api/security/confirmations/${currentConfirmation.confirmationId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: 'admin' })
      });
      setShowModal(false);
      setCurrentConfirmation(null);
      fetchPendingConfirmations();
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleReject = async () => {
    if (!currentConfirmation) return;
    
    try {
      await fetch(`http://localhost:3001/api/security/confirmations/${currentConfirmation.confirmationId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: 'admin' })
      });
      setShowModal(false);
      setCurrentConfirmation(null);
      fetchPendingConfirmations();
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  };

  const decodeQR = (base64) => {
    try {
      return JSON.parse(atob(base64));
    } catch {
      return null;
    }
  };

  if (!showModal && pendingConfirmations.length === 0) {
    return null;
  }

  return (
    <>
      {showModal && currentConfirmation && (
        <div className="security-modal-overlay">
          <div className="security-modal">
            <div className="security-modal-header">
              <span className="security-icon">⚠️</span>
              <h3>Security Confirmation Required</h3>
            </div>
            
            <div className="security-modal-body">
              <div className="critical-key-warning">
                <p>You are trying to execute a critical key combination:</p>
                <div className="key-combination">
                  {currentConfirmation.criticalKey}
                </div>
              </div>

              <div className="qr-section">
                <p className="qr-label">Scan QR code for admin approval:</p>
                <div className="qr-placeholder">
                  <div className="qr-code">
                    {currentConfirmation.qrCode && (
                      <div className="qr-data">
                        <small>Confirmation ID:</small>
                        <code>{currentConfirmation.confirmationId}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="countdown">
                <span>Expires in: </span>
                <span className={`countdown-value ${countdown <= 10 ? 'warning' : ''}`}>
                  {countdown}s
                </span>
              </div>
            </div>

            <div className="security-modal-footer">
              <button className="btn-reject" onClick={handleReject}>
                ✕ Reject
              </button>
              <button className="btn-approve" onClick={handleApprove}>
                ✓ Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingConfirmations.length > 0 && (
        <div className="pending-confirmations-badge">
          <span className="badge-icon">🔒</span>
          <span className="badge-count">{pendingConfirmations.length}</span>
          <span className="badge-label">pending approval</span>
        </div>
      )}
    </>
  );
}

export default SecurityConfirmation;
