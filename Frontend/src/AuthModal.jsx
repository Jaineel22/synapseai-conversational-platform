import './AuthModal.css';
import { useState } from 'react';

function AuthModal({ mode, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>

        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-modal-logo">
            <i className="fa-solid fa-brain" style={{ color: 'white' }}></i>
          </div>
          <h2>{mode === 'login' ? 'NEURAL LOGIN' : 'CREATE ACCOUNT'}</h2>
          <p className="auth-modal-subtitle">
            {mode === 'login' ? '// authenticate to access SynapseAI' : '// initialize new neural profile'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Identifier</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Neural Address</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Access Key</label>
            <input
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              required
            />
          </div>

          <button type="submit" className="submit-btn">
            <i className={`fa-solid ${mode === 'login' ? 'fa-bolt' : 'fa-user-plus'}`} style={{ marginRight: '8px' }}></i>
            {mode === 'login' ? 'Connect to SynapseAI' : 'Initialize Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
