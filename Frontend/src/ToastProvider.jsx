import { useCallback, useRef, useState } from "react";
import { ToastContext } from "./ToastContext.jsx";
import "./Toast.css";

let idCounter = 0;

const ICONS = {
  success: "fa-circle-check",
  error: "fa-circle-exclamation",
  info: "fa-circle-info",
};

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <i className={`fa-solid ${ICONS[t.type]}`} aria-hidden="true"></i>
          <span className="toast-message">{t.message}</span>
          <button
            className="toast-close"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});
  // Mirrors `toasts` outside React state so showToast can read the current
  // list synchronously without needing to depend on `toasts` (which would
  // change the callback's identity on every toast add/remove) or doing
  // side effects (setTimeout/clearTimeout) inside a setState updater.
  const toastsRef = useRef([]);
  toastsRef.current = toasts;

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback(
    (message, { type = "info", duration = 4500 } = {}) => {
      // Dedup identical (message, type) pairs instead of stacking a new
      // toast every call — without this, a repeated failure (e.g. the
      // Documents panel's status-polling loop hitting the same error on
      // every poll) piles up an unbounded stack of identical
      // notifications rather than just keeping the one already visible.
      const existing = toastsRef.current.find((t) => t.message === message && t.type === type);
      if (existing) {
        clearTimeout(timers.current[existing.id]);
        if (duration > 0) {
          timers.current[existing.id] = setTimeout(() => dismiss(existing.id), duration);
        }
        return existing.id;
      }

      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
