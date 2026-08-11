import './AuthPanel.css';
import { useState } from 'react';

const COPY = {
  login: {
    title: 'Welcome back',
    subtitle: 'Log in to continue your conversations.',
    submitIcon: 'fa-bolt',
    submitLabel: 'Log in',
    submitPendingLabel: 'Logging in…',
    switchPrompt: "Don't have an account?",
    switchAction: 'Sign up',
  },
  register: {
    title: 'Create your account',
    subtitle: 'Set up a private space for your conversations.',
    submitIcon: 'fa-user-plus',
    submitLabel: 'Create account',
    submitPendingLabel: 'Creating account…',
    switchPrompt: 'Already have an account?',
    switchAction: 'Log in',
  },
};

function AuthPanel({ mode, onModeChange, onSubmit, pending }) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const copy = COPY[mode];

  const passwordTooShort = mode === 'register' && formData.password.length > 0 && formData.password.length < 8;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwordTooShort) {
      setPasswordTouched(true);
      return;
    }
    try {
      await onSubmit(formData);
    } catch {
      // App.jsx already surfaced the error via a toast; nothing further
      // to do here besides leaving the form filled in so the user can fix
      // and resubmit without retyping everything.
    }
  };

  const switchMode = () => {
    onModeChange(mode === 'login' ? 'register' : 'login');
    setFormData({ name: '', email: '', password: '' });
    setPasswordTouched(false);
  };

  return (
    <div className="auth-panel">
      <div className="auth-panel-header">
        <h2>{copy.title}</h2>
        <p className="auth-panel-subtitle">{copy.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {mode === 'register' && (
          <div className="form-group">
            <label htmlFor="auth-name">Name</label>
            <input
              id="auth-name"
              type="text"
              placeholder="Ada Lovelace"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              autoComplete="name"
              required
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            autoComplete="email"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="auth-password">Password</label>
          <div className="password-field">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              onBlur={() => setPasswordTouched(true)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-describedby={mode === 'register' ? 'auth-password-hint' : undefined}
              aria-invalid={passwordTouched && passwordTooShort}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
            </button>
          </div>
          {mode === 'register' && (
            <span
              id="auth-password-hint"
              className={`form-hint ${passwordTouched && passwordTooShort ? 'form-hint-error' : ''}`}
            >
              At least 8 characters
            </span>
          )}
        </div>

        <button type="submit" className="submit-btn" disabled={pending}>
          {pending ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
              {copy.submitPendingLabel}
            </>
          ) : (
            <>
              <i className={`fa-solid ${copy.submitIcon}`} aria-hidden="true"></i>
              {copy.submitLabel}
            </>
          )}
        </button>
      </form>

      <p className="auth-switch">
        {copy.switchPrompt}{' '}
        <button type="button" className="auth-switch-btn" onClick={switchMode}>
          {copy.switchAction}
        </button>
      </p>
    </div>
  );
}

export default AuthPanel;
