import "./DocumentsPanel.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { useToast } from "./useToast.js";
import { listDocuments, uploadDocument, deleteDocument } from "./api/documents.js";

const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md,.docx";

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_META = {
  processing: { icon: "fa-circle-notch fa-spin", label: "Processing", className: "status-processing" },
  ready: { icon: "fa-circle-check", label: "Ready", className: "status-ready" },
  failed: { icon: "fa-circle-exclamation", label: "Failed", className: "status-failed" },
};

const FILE_TYPE_ICON = { pdf: "fa-file-pdf", txt: "fa-file-lines", md: "fa-file-lines", docx: "fa-file-word" };

/**
 * Document/knowledge management modal — upload, status, delete. Shares the
 * app's Modal shell (same one Settings/Upgrade use) rather than
 * introducing a new dialog pattern. Polls the document list while
 * anything is still "processing" so status updates land without the user
 * needing to reopen the panel.
 */
function DocumentsPanel({ onClose, onDocumentsChanged }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const data = await listDocuments();
      setDocuments(data);
      onDocumentsChanged?.(data);
    } catch {
      showToast("Couldn't load your documents. Please try again.", { type: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast, onDocumentsChanged]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while anything is still processing, so status flips to
  // ready/failed live without the user manually refreshing.
  useEffect(() => {
    if (!documents.some((d) => d.status === "processing")) return;
    const interval = setInterval(refresh, 2500);
    return () => clearInterval(interval);
  }, [documents, refresh]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    try {
      const doc = await uploadDocument(file);
      setDocuments((prev) => [doc, ...prev]);
      showToast(`"${doc.filename}" uploaded — processing started.`, { type: "success" });
    } catch (err) {
      const message = err.response?.data?.error || "Failed to upload document.";
      showToast(message, { type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    try {
      await deleteDocument(doc.id);
      setDocuments((prev) => {
        const next = prev.filter((d) => d.id !== doc.id);
        onDocumentsChanged?.(next);
        return next;
      });
      showToast("Document deleted", { type: "success", duration: 2500 });
    } catch {
      showToast("Failed to delete document. Please try again.", { type: "error" });
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="documents-modal-title" className="documents-modal">
      <h3 id="documents-modal-title">
        <i className="fa-solid fa-book" aria-hidden="true" style={{ marginRight: "8px" }}></i>
        Your Documents
      </h3>
      <p className="documents-modal-subtitle">
        Upload PDF, TXT, Markdown, or Word documents to ask questions grounded in their content.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-hidden="true"
      />
      <button
        className="documents-upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <><i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Uploading…</>
        ) : (
          <><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Upload a document</>
        )}
      </button>

      <div className="documents-list" role="list">
        {loading && <p className="documents-empty-hint">Loading…</p>}

        {!loading && documents.length === 0 && (
          <div className="documents-empty">
            <i className="fa-solid fa-folder-open" aria-hidden="true"></i>
            <span>No documents yet</span>
            <span className="documents-empty-sub">Upload one to start asking questions about it</span>
          </div>
        )}

        {documents.map((doc) => {
          const status = STATUS_META[doc.status] || STATUS_META.processing;
          return (
            <div className="document-row" role="listitem" key={doc.id}>
              <i className={`fa-solid ${FILE_TYPE_ICON[doc.fileType] || "fa-file"} document-row-icon`} aria-hidden="true"></i>
              <div className="document-row-info">
                <span className="document-row-name" title={doc.filename}>{doc.filename}</span>
                <span className="document-row-meta">
                  {formatFileSize(doc.fileSize)}
                  {doc.status === "ready" && doc.chunkCount ? ` · ${doc.chunkCount} chunks` : ""}
                </span>
                {doc.status === "failed" && doc.error && (
                  <span className="document-row-error">{doc.error}</span>
                )}
              </div>
              <span className={`document-status ${status.className}`} title={doc.error || status.label}>
                <i className={`fa-solid ${status.icon}`} aria-hidden="true"></i>
                {status.label}
              </span>
              <button
                className="document-delete-btn"
                aria-label={`Delete "${doc.filename}"`}
                onClick={() => handleDelete(doc)}
              >
                <i className="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          );
        })}
      </div>

      <button className="close-modal" onClick={onClose}>Done</button>
    </Modal>
  );
}

export default DocumentsPanel;
