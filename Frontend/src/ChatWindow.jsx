import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import Modal from "./Modal.jsx";
import DocumentsPanel from "./DocumentsPanel.jsx";
import { MyContext } from "./MyContext.jsx";
import { ThemeContext } from "./ThemeContext.jsx";
import { useToast } from "./useToast.js";
import { useContext, useState, useEffect, useRef } from "react";
import { listDocuments } from "./api/documents.js";

// Same base URL logic as axios.defaults.baseURL in App.jsx — kept separate
// because fetch (needed for reading a streaming response body) doesn't go
// through axios.
const API_BASE = import.meta.env.VITE_API_URL || '';

// Parses one SSE frame ("event: x\ndata: y") into its two fields.
function parseSSEFrame(frame) {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data = line.slice(5).trim();
  }
  return { event, data };
}

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

const MAX_TEXTAREA_HEIGHT = 200; // px — beyond this the composer scrolls instead of growing further

function ChatWindow() {
  const {
    prompt, setPrompt,
    reply, setReply,
    currThreadId,
    setPrevChats,
    setNewChat,
    user,
    handleLogout,
    isSidebarOpen, setIsSidebarOpen,
  } = useContext(MyContext);

  const { theme, toggleTheme } = useContext(ThemeContext);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [readyDocCount, setReadyDocCount] = useState(0);
  const [useKnowledge, setUseKnowledge] = useState(false);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Auto-resize the composer as the user types, up to a capped height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [prompt]);

  // Known on mount (and refreshed whenever the Documents panel closes) so
  // the "Ask my documents" toggle can be disabled until at least one
  // document has actually finished processing — no point offering
  // knowledge mode against zero searchable documents.
  useEffect(() => {
    if (!user) return;
    listDocuments()
      .then((docs) => setReadyDocCount(docs.filter((d) => d.status === 'ready').length))
      .catch((err) => console.error('Failed to fetch document count:', err)); // non-critical — toggle just stays disabled
  }, [user]);

  const handleDocumentsChanged = (docs) => {
    setReadyDocCount(docs.filter((d) => d.status === 'ready').length);
  };

  const getReply = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setNewChat(false);

    // Capture prompt before clearing
    const currentPrompt = prompt;
    setPrompt("");

    // Optimistic: show the user's message immediately. The backend saves
    // it before it starts generating a reply, so this always matches what
    // ends up persisted unless the request never reaches the server at all.
    setPrevChats(prev => [...prev, { role: "user", content: currentPrompt }]);
    setReply(""); // "" (not null) signals "streaming in progress, no text yet"

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let streamStarted = false;

    // Only sent when the user actually turned "Ask my documents" on — keeps
    // the request body identical to before for every normal (non-RAG) turn.
    const requestBody = { message: currentPrompt, threadId: currThreadId };
    if (useKnowledge) requestBody.useKnowledge = true;

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const isStream = (response.headers.get("content-type") || "").includes("text/event-stream");

      if (!isStream) {
        // Validation/auth/db failures before generation starts are a plain
        // JSON error response, same shape the app always used.
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to get response");
      }

      streamStarted = true; // the user message is now known to be saved server-side

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let streamError = null;
      let sources = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let frameEnd;
        while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
          const { event, data } = parseSSEFrame(buffer.slice(0, frameEnd));
          buffer = buffer.slice(frameEnd + 2);
          if (!data) continue;

          const payload = JSON.parse(data);
          if (event === "chunk") {
            accumulated += payload.text;
            setReply(accumulated);
          } else if (event === "error") {
            streamError = payload.error || "Something went wrong";
          } else if (event === "done") {
            sources = payload.sources || [];
          }
        }
      }

      if (streamError) throw new Error(streamError);
      if (!accumulated) throw new Error("Empty response received");

      // Move the finished reply into persisted history — citations travel
      // with the message itself (only present when the turn was grounded).
      const assistantMessage = { role: "assistant", content: accumulated };
      if (sources.length > 0) assistantMessage.sources = sources;
      setPrevChats(prev => [...prev, assistantMessage]);
      setReply(null);
    } catch (err) {
      if (err.name === "AbortError") {
        // User clicked Stop. Nothing was persisted server-side for the
        // reply, so just clear the in-progress bubble — not an error.
        setReply(null);
      } else {
        console.log(err);
        setReply(null);
        if (streamStarted) {
          // The user's message was already saved — keep it visible and
          // just surface that the reply failed.
          showToast(err.message || "Failed to get response", { type: "error" });
        } else {
          // Nothing was saved — restore the prompt and remove the
          // optimistic bubble so the UI matches server state.
          setPrompt(currentPrompt);
          setPrevChats(prev => prev.slice(0, -1));
          showToast(err.message || "Failed to get response", { type: "error" });
        }
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
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

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => setIsOpen(false);
    const handleKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const hasPrompt = prompt.trim().length > 0;

  return (
    <div className="chatWindow">
      {/* Navbar */}
      <div className="navbar">
        <div className="navbar-left">
          <button
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={isSidebarOpen}
          >
            <i className="fa-solid fa-bars" aria-hidden="true"></i>
          </button>
          <div className="navbar-brand">
            <div className="navbar-brand-icon" aria-hidden="true">
              <i className="fa-solid fa-brain" style={{ color: 'white', fontSize: '16px' }}></i>
            </div>
            <span className="navbar-brand-name">SYNAPSE AI</span>
            <span className="navbar-model-tag">v2.0</span>
          </div>
        </div>

        <div className="nav-right">
          <button className="theme-toggle" onClick={() => setShowDocuments(true)} aria-label="Manage your documents" title="Your documents">
            <i className="fa-solid fa-book" aria-hidden="true"></i>
          </button>
          <button className="theme-toggle" onClick={handleThemeToggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme">
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true"></i>
          </button>
          <button
            className="userIconDiv"
            onClick={(e) => { e.stopPropagation(); handleProfileClick(); }}
            aria-label={`Account menu for ${user?.name || 'your account'}`}
            aria-haspopup="menu"
            aria-expanded={isOpen}
          >
            <div className="userIcon" aria-hidden="true">
              {user?.name?.charAt(0).toUpperCase() || <i className="fa-solid fa-user"></i>}
            </div>
          </button>
        </div>
      </div>

      {/* Profile Dropdown */}
      {isOpen && (
        <div className="dropDown" role="menu" onClick={e => e.stopPropagation()}>
          <div className="dropdown-user-header">
            <div className="dropdown-avatar" aria-hidden="true">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="dropdown-name">{user?.name}</div>
              <div className="dropdown-email">{user?.email}</div>
            </div>
          </div>
          <div className="dropdown-divider"></div>
          <button className="dropDownItem" role="menuitem" onClick={handleSettings}>
            <i className="fa-solid fa-gear" aria-hidden="true"></i> Settings
          </button>
          <button className="dropDownItem" role="menuitem" onClick={handleUpgrade}>
            <i className="fa-solid fa-bolt" aria-hidden="true"></i> Upgrade
          </button>
          <div className="dropdown-divider"></div>
          <button className="dropDownItem logout-item" role="menuitem" onClick={handleLogoutClick}>
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Log out
          </button>
        </div>
      )}

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showDocuments && (
        <DocumentsPanel onClose={() => setShowDocuments(false)} onDocumentsChanged={handleDocumentsChanged} />
      )}

      {/* Chat messages */}
      <div className="chat-area-wrapper">
        <Chat />
      </div>

      {/* Loader — only while waiting for the first chunk; once real text
          starts streaming in, the growing message itself is the indicator */}
      {loading && reply === "" && <NeuralLoader />}

      {/* Input */}
      <div className="chatInput">
        <div className="knowledge-bar">
          <button
            type="button"
            className={`knowledge-toggle-btn ${useKnowledge ? 'active' : ''}`}
            onClick={() => setUseKnowledge((v) => !v)}
            disabled={readyDocCount === 0}
            aria-pressed={useKnowledge}
            title={readyDocCount === 0 ? 'Upload a document to enable this' : 'Ground the reply in your uploaded documents'}
          >
            <i className="fa-solid fa-book" aria-hidden="true"></i>
            Ask my documents
          </button>
          {readyDocCount === 0 ? (
            <button type="button" className="knowledge-bar-hint" onClick={() => setShowDocuments(true)}>
              Upload a document to get started
            </button>
          ) : (
            <span className="knowledge-bar-hint">{readyDocCount} document{readyDocCount !== 1 ? 's' : ''} available</span>
          )}
        </div>
        <div className={`inputBox ${hasPrompt ? 'has-content' : ''} ${loading ? 'is-loading' : ''}`}>
          <textarea
            ref={inputRef}
            placeholder="Send a neural signal..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            aria-label="Message"
          />
          {/* Send/Stop button — becomes a Stop control while a reply is streaming */}
          <button
            id="submit"
            onClick={loading ? stopGeneration : getReply}
            disabled={!loading && !hasPrompt}
            className={hasPrompt || loading ? 'active' : ''}
            title={loading ? "Stop generating" : "Send message (or press Enter)"}
            aria-label={loading ? "Stop generating" : "Send message"}
          >
            {loading ? (
              <i className="fa-solid fa-stop" aria-hidden="true"></i>
            ) : (
              <i className="fa-solid fa-paper-plane" aria-hidden="true"></i>
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
    <Modal onClose={onClose} labelledBy="settings-modal-title">
      <h3 id="settings-modal-title"><i className="fa-solid fa-gear" aria-hidden="true" style={{ marginRight: '8px' }}></i>Settings</h3>
      <div className="settings-item">
        <span>Appearance</span>
        <button onClick={toggleTheme} className="settings-btn">
          <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" style={{ marginRight: '6px' }}></i>
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
    </Modal>
  );
}

// ─── Upgrade Modal ─────────────────────────────────────────────────────────────
function UpgradeModal({ onClose }) {
  return (
    <Modal onClose={onClose} labelledBy="upgrade-modal-title">
      <h3 id="upgrade-modal-title"><i className="fa-solid fa-bolt" aria-hidden="true" style={{ marginRight: '8px' }}></i>Upgrade Neural Link</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
        Unlock full synaptic potential:
      </p>
      <div className="plan-card">
        <div className="plan-header">
          <h4>Free</h4>
          <span className="plan-price">$0<span>/mo</span></span>
        </div>
        <ul>
          <li><i className="fa-solid fa-check" aria-hidden="true"></i> Basic neural processing</li>
          <li><i className="fa-solid fa-check" aria-hidden="true"></i> Limited requests/day</li>
        </ul>
      </div>
      <div className="plan-card plan-pro">
        <div className="plan-header">
          <h4>Pro <span className="plan-badge">Popular</span></h4>
          <span className="plan-price">$10<span>/mo</span></span>
        </div>
        <ul>
          <li><i className="fa-solid fa-check" aria-hidden="true"></i> Full neural bandwidth</li>
          <li><i className="fa-solid fa-check" aria-hidden="true"></i> Unlimited requests</li>
          <li><i className="fa-solid fa-check" aria-hidden="true"></i> Priority synapse routing</li>
        </ul>
        <button className="upgrade-cta">Upgrade to Pro</button>
      </div>
      <button className="close-modal" onClick={onClose}>Maybe later</button>
    </Modal>
  );
}

export default ChatWindow;
