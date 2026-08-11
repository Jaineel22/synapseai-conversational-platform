import { useEffect, useRef } from "react";
import "./Modal.css";

/**
 * Shared modal shell: overlay click-to-close, Escape-to-close, and focus
 * moved onto the dialog on open (so keyboard/screen-reader users land
 * somewhere sensible instead of focus staying on whatever triggered it).
 */
function Modal({ onClose, children, labelledBy, className = "" }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default Modal;
