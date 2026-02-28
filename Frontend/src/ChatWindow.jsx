import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { MyContext } from "./MyContext.jsx";
import { ThemeContext } from "./ThemeContext.jsx";
import { useContext, useState, useEffect, useRef } from "react";
import axios from 'axios';

// Neural network loader — three colored synapse dots
function NeuralLoader() {
  return (
    <div className="loader-container">
      <div className="neural-loader">
        <div className="neural-dot" style={{ background: '#0066FF', animationDelay: '0s' }}></div>
        <div className="neural-dot" style={{ background: '#7C3AED', animationDelay: '0.2s' }}></div>
        <div className="neural-dot" style={{ background: '#14B8A6', animationDelay: '0.4s' }}></div>
        <span>SynapseAI is thinking</span>
      </div>
    </div>
  );
}

function ChatWindow() {
  const { 
    prompt, setPrompt, 
    reply, setReply, 
    currThreadId, 
    setPrevChats, 
    setNewChat,
    user,
    handleLogout
  } = useContext(MyContext);

  const { theme, toggleTheme } = useContext(ThemeContext);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const inputRef = useRef(null);

  const getReply = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setNewChat(false);

    // Capture prompt before clearing
    const currentPrompt = prompt;
    setPrompt("");

    try {
      const response = await axios.post("/api/chat", {
        message: currentPrompt,
        threadId: currThreadId
      });
      setReply(response.data.reply);

      // Store the sent message alongside reply
      setPrevChats(prev => ([
        ...prev,
        { role: "user", content: currentPrompt },
        { role: "assistant", content: response.data.reply }
      ]));
    } catch(err) {
      console.log(err);
      // Restore prompt on error so user doesn't lose their message
      setPrompt(currentPrompt);
      alert(err.response?.data?.error || "Failed to get response");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      getReply();
    }
  };

  const handleProfileClick = () => setIsOpen(!isOpen);
  const handleSettings = () => { setIsOpen(false); setShowSettings(true); };
  const handleUpgrade = () => { setIsOpen(false); setShowUpgrade(true); };
  const handleThemeToggle = () => { toggleTheme(); setIsOpen(false); };
  const handleLogoutClick = () => { setIsOpen(false); handleLogout(); };

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = () => setIsOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isOpen]);

  const hasPrompt = prompt.trim().length > 0;

  return (
    <div className="chatWindow">
      {/* Navbar */}
      <div className="navbar">
        <div className="navbar-brand">
          <div className="navbar-brand-icon">
            <i className="fa-solid fa-brain" style={{ color: 'white', fontSize: '16px' }}></i>
          </div>
          <span className="navbar-brand-name">SYNAPSE AI</span>
          <span className="navbar-model-tag">v2.0</span>
        </div>

        <div className="nav-right">
          <button className="theme-toggle" onClick={handleThemeToggle} title="Toggle theme">
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
          <div
            className="userIconDiv"
            onClick={(e) => { e.stopPropagation(); handleProfileClick(); }}
            title={user?.name}
          >
            <div className="userIcon">
              {user?.name?.charAt(0).toUpperCase() || <i className="fa-solid fa-user"></i>}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Dropdown */}
      {isOpen && (
        <div className="dropDown" onClick={e => e.stopPropagation()}>
          <div className="dropdown-user-header">
            <div className="dropdown-avatar">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="dropdown-name">{user?.name}</div>
              <div className="dropdown-email">{user?.email}</div>
            </div>
          </div>
          <div className="dropdown-divider"></div>
          <div className="dropDownItem" onClick={handleSettings}>
            <i className="fa-solid fa-gear"></i> Settings
          </div>
          <div className="dropDownItem" onClick={handleUpgrade}>
            <i className="fa-solid fa-bolt"></i> Upgrade
          </div>
          <div className="dropdown-divider"></div>
          <div className="dropDownItem logout-item" onClick={handleLogoutClick}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i> Log out
          </div>
        </div>
      )}

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {/* Chat messages */}
      <div className="chat-area-wrapper">
        <Chat />
      </div>

      {/* Loader */}
      {loading && <NeuralLoader />}

      {/* Input */}
      <div className="chatInput">
        <div className={`inputBox ${hasPrompt ? 'has-content' : ''} ${loading ? 'is-loading' : ''}`}>
          <input
            ref={inputRef}
            placeholder="Send a neural signal..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          {/* Send button — always visible, active state when prompt has content */}
          <button
            id="submit"
            onClick={getReply}
            disabled={!hasPrompt || loading}
            className={hasPrompt && !loading ? 'active' : ''}
            title="Send message (or press Enter)"
            aria-label="Send message"
          >
            {loading ? (
              <i className="fa-solid fa-spinner fa-spin"></i>
            ) : (
              <i className="fa-solid fa-paper-plane"></i>
            )}
          </button>
        </div>
        <p className="info">
          <i className="fa-solid fa-keyboard" style={{ marginRight: '6px', opacity: 0.5 }}></i>
          Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}

// ─── Settings Modal ────────────────────────────────────────────────────────────
function SettingsModal({ onClose }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { user } = useContext(MyContext);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3><i className="fa-solid fa-gear" style={{ marginRight: '8px' }}></i>Settings</h3>
        <div className="settings-item">
          <span>Appearance</span>
          <button onClick={toggleTheme} className="settings-btn">
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} style={{ marginRight: '6px' }}></i>
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
        <div className="settings-item">
          <span>Account</span>
          <span className="settings-value">{user?.email}</span>
        </div>
        <div className="settings-item">
          <span>Neural Engine</span>
          <span className="settings-badge">v2.0 active</span>
        </div>
        <button className="close-modal" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ─── Upgrade Modal ─────────────────────────────────────────────────────────────
function UpgradeModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3><i className="fa-solid fa-bolt" style={{ marginRight: '8px' }}></i>Upgrade Neural Link</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
          Unlock full synaptic potential:
        </p>
        <div className="plan-card">
          <div className="plan-header">
            <h4>Free</h4>
            <span className="plan-price">$0<span>/mo</span></span>
          </div>
          <ul>
            <li><i className="fa-solid fa-check"></i> Basic neural processing</li>
            <li><i className="fa-solid fa-check"></i> Limited requests/day</li>
          </ul>
        </div>
        <div className="plan-card plan-pro">
          <div className="plan-header">
            <h4>Pro <span className="plan-badge">Popular</span></h4>
            <span className="plan-price">$10<span>/mo</span></span>
          </div>
          <ul>
            <li><i className="fa-solid fa-check"></i> Full neural bandwidth</li>
            <li><i className="fa-solid fa-check"></i> Unlimited requests</li>
            <li><i className="fa-solid fa-check"></i> Priority synapse routing</li>
          </ul>
          <button className="upgrade-cta">Upgrade to Pro</button>
        </div>
        <button className="close-modal" onClick={onClose}>Maybe later</button>
      </div>
    </div>
  );
}

export default ChatWindow;
