import "./Sidebar.css";
import { useContext, useEffect, useState } from "react";
import { MyContext } from "./MyContext.jsx";
import { useToast } from "./useToast.js";
import { v1 as uuidv1 } from "uuid";
import axios from 'axios';

function Sidebar() {
  const {
    allThreads, setAllThreads,
    currThreadId, setNewChat,
    setPrompt, setReply,
    setCurrThreadId, setPrevChats,
    fetchUserThreads,
    user,
    isSidebarOpen, setIsSidebarOpen,
  } = useContext(MyContext);

  const { showToast } = useToast();

  // Track which thread is pending delete confirmation
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    if (user) fetchUserThreads();
  }, [currThreadId, user, fetchUserThreads]);

  // Close pending delete if user clicks elsewhere
  useEffect(() => {
    const handler = () => setPendingDelete(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // On mobile the sidebar is an off-canvas drawer — Escape closes it, same
  // as any other dismissible overlay in the app.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, setIsSidebarOpen]);

  const createNewChat = () => {
    setNewChat(true);
    setPrompt("");
    setReply(null);
    setCurrThreadId(uuidv1());
    setPrevChats([]);
    setPendingDelete(null);
    setIsSidebarOpen(false); // no-op on desktop, closes the drawer on mobile
  };

  const changeThread = async (newThreadId) => {
    if (pendingDelete) return; // don't switch threads while confirming delete
    setCurrThreadId(newThreadId);
    setIsSidebarOpen(false);
    try {
      const response = await axios.get(`/api/thread/${newThreadId}`);
      setPrevChats(response.data);
      setNewChat(false);
      setReply(null);
    } catch (err) {
      console.error(err);
      showToast("Couldn't load that conversation. Please try again.", { type: "error" });
    }
  };

  const deleteThread = async (threadId) => {
    try {
      await axios.delete(`/api/thread/${threadId}`);
      setAllThreads(prev => prev.filter(t => t.threadId !== threadId));
      if (threadId === currThreadId) createNewChat();
      setPendingDelete(null);
      showToast("Conversation deleted", { type: "success", duration: 2500 });
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Failed to delete thread. Please try again.", { type: "error" });
    }
  };

  const handleDeleteClick = (e, threadId) => {
    e.stopPropagation();
    setPendingDelete(threadId); // show inline confirm
  };

  const handleConfirmDelete = (e, threadId) => {
    e.stopPropagation();
    deleteThread(threadId);
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setPendingDelete(null);
  };

  const userInitial = user?.name?.charAt(0).toUpperCase() || '?';

  return (
    <>
      {/* Mobile-only scrim behind the drawer; clicking it closes the sidebar */}
      {isSidebarOpen && (
        <div className="sidebar-scrim" onClick={() => setIsSidebarOpen(false)} aria-hidden="true"></div>
      )}

      <section className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`} aria-label="Conversation history">
        <div className="sidebar-top">
          {/* New Chat Button */}
          <button className="new-chat-btn" onClick={createNewChat}>
            <div className="logo-wrapper">
              <img src="src/assets/SynapseAI logo.png" alt="" className="logo" />
              <span className="logo-text">SYNAPSE</span>
            </div>
            <i className="fa-solid fa-pen-to-square new-chat-icon" aria-hidden="true" title="New chat"></i>
          </button>

          {/* Mobile close button */}
          <button
            className="sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {/* Section Label */}
        {allThreads?.length > 0 && (
          <div className="sidebar-section-label">Neural Threads</div>
        )}

        {/* Empty state */}
        {allThreads?.length === 0 && (
          <div className="sidebar-empty">
            <i className="fa-solid fa-comment-dots" aria-hidden="true"></i>
            <span>No chats yet</span>
            <span className="sidebar-empty-sub">Start a new conversation</span>
          </div>
        )}

        {/* Thread History */}
        <ul className="history">
          {allThreads?.map((thread, idx) => (
            <li
              key={idx}
              className={[
                thread.threadId === currThreadId ? "highlighted" : "",
                pendingDelete === thread.threadId ? "pending-delete" : ""
              ].join(" ")}
            >
              {pendingDelete === thread.threadId ? (
                /* Inline delete confirmation */
                <div className="delete-confirm" onClick={e => e.stopPropagation()}>
                  <span className="delete-confirm-text">Delete this chat?</span>
                  <div className="delete-confirm-actions">
                    <button
                      className="delete-confirm-yes"
                      onClick={(e) => handleConfirmDelete(e, thread.threadId)}
                    >
                      Delete
                    </button>
                    <button
                      className="delete-confirm-no"
                      onClick={handleCancelDelete}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Two independent sibling buttons rather than nesting the
                      delete control inside the row control — a <button>
                      can't validly contain another interactive element. */}
                  <button
                    className="thread-row"
                    onClick={() => changeThread(thread.threadId)}
                    aria-current={thread.threadId === currThreadId ? "true" : undefined}
                  >
                    <span className="thread-title">{thread.title}</span>
                  </button>
                  <button
                    className="delete-icon"
                    aria-label={`Delete "${thread.title}"`}
                    onClick={(e) => handleDeleteClick(e, thread.threadId)}
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true"></i>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        {/* Synapse Activity Indicator */}
        <div className="synapse-activity">
          <div className="activity-dots" aria-hidden="true">
            <div className="activity-dot"></div>
            <div className="activity-dot"></div>
            <div className="activity-dot"></div>
          </div>
          <span>Neural link active</span>
        </div>

        {/* User Footer */}
        <div className="sign">
          <div className="sign-user">
            <div className="sign-avatar" aria-hidden="true">{userInitial}</div>
            <span className="sign-name">{user?.name}</span>
          </div>
        </div>
      </section>
    </>
  );
}

export default Sidebar;
