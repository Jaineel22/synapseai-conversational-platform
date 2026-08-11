import "./AuthScreen.css";
import AuthPanel from "./AuthPanel.jsx";

/**
 * Split-screen authentication experience: branding + a CSS-only layered
 * "depth" visual on the left, the actual login/register form on the
 * right. Collapses to a single column below the tablet breakpoint (see
 * AuthScreen.css) — the brand visual shrinks to a compact header instead
 * of disappearing, so small screens still read as "an AI product" rather
 * than a bare form.
 */
function AuthScreen({ mode, onModeChange, onSubmit, pending }) {
  return (
    <div className="auth-screen">
      <div className="auth-screen-brand" aria-hidden="true">
        <div className="brand-scene">
          <div className="brand-grid"></div>
          <div className="brand-orb brand-orb-core"></div>
          <div className="brand-orb brand-orb-ring-1"></div>
          <div className="brand-orb brand-orb-ring-2"></div>
          <div className="brand-node brand-node-1"></div>
          <div className="brand-node brand-node-2"></div>
          <div className="brand-node brand-node-3"></div>
        </div>
        <div className="brand-copy">
          <div className="brand-logo">
            <i className="fa-solid fa-brain"></i>
          </div>
          <h1>SynapseAI</h1>
          <p>A conversational AI workspace with real memory — every reply is generated live, and grounded in what you've actually discussed.</p>
        </div>
      </div>

      <div className="auth-screen-panel">
        <AuthPanel mode={mode} onModeChange={onModeChange} onSubmit={onSubmit} pending={pending} />
      </div>
    </div>
  );
}

export default AuthScreen;
