import "./Sidebar.css";
import { useContext, useEffect, useState } from "react";
import { MyContext } from "./MyContext.jsx";
import { v1 as uuidv1 } from "uuid";
import axios from 'axios';

function Sidebar() {
  const { 
    allThreads, setAllThreads, 
    currThreadId, setNewChat, 
    setPrompt, setReply, 
    setCurrThreadId, setPrevChats,
    fetchUserThreads,
    user
  } = useContext(MyContext);

  // Track which thread is pending delete confirmation
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    if (user) fetchUserThreads();
  }, [currThreadId, user]);

  // Close pending delete if user clicks elsewhere
  useEffect(() => {
    const handler = () => setPendingDelete(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const createNewChat = () => {
    setNewChat(true);
    setPrompt("");
    setReply(null);
    setCurrThreadId(uuidv1());
    setPrevChats([]);
    setPendingDelete(null);
  };

  const changeThread = async (newThreadId) => {
    if (pendingDelete) return; // don't switch threads while confirming delete
    setCurrThreadId(newThreadId);
    try {
      const response = await axios.get(`/api/thread/${newThreadId}`);
      setPrevChats(response.data);
      setNewChat(false);
      setReply(null);
    } catch(err) {
      console.log(err);
    }
  };

  const deleteThread = async (threadId) => {
    try {
      await axios.delete(`/api/thread/${threadId}`);
      setAllThreads(prev => prev.filter(t => t.threadId !== threadId));
      if (threadId === currThreadId) createNewChat();
      setPendingDelete(null);
    } catch(err) {
      console.error("Delete error:", err);
      alert("Failed to delete thread. Please try again.");
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
    <section className="sidebar">
      {/* New Chat Button */}
      <button className="new-chat-btn" onClick={createNewChat}>
        <div className="logo-wrapper">
          <img src="src/assets/SynapseAI logo.png" alt="SynapseAI logo" className="logo" />
          <span className="logo-text">SYNAPSE</span>
        </div>
        <i className="fa-solid fa-pen-to-square new-chat-icon" title="New chat"></i>
      </button>

      {/* Section Label */}
      {allThreads?.length > 0 && (
        <div className="sidebar-section-label">Neural Threads</div>
      )}

      {/* Empty state */}
      {allThreads?.length === 0 && (
        <div className="sidebar-empty">
          <i className="fa-solid fa-comment-dots"></i>
          <span>No chats yet</span>
          <span className="sidebar-empty-sub">Start a new conversation</span>
        </div>
      )}

      {/* Thread History */}
      <ul className="history">
        {allThreads?.map((thread, idx) => (
          <li
            key={idx}
            onClick={() => changeThread(thread.threadId)}
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
                <span className="thread-title">{thread.title}</span>
                <i
                  className="fa-solid fa-trash delete-icon"
                  onClick={(e) => handleDeleteClick(e, thread.threadId)}
                  title="Delete chat"
                ></i>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Synapse Activity Indicator */}
      <div className="synapse-activity">
        <div className="activity-dots">
          <div className="activity-dot"></div>
          <div className="activity-dot"></div>
          <div className="activity-dot"></div>
        </div>
        <span>Neural link active</span>
      </div>

      {/* User Footer */}
      <div className="sign">
        <div className="sign-user">
          <div className="sign-avatar">{userInitial}</div>
          <span className="sign-name">{user?.name}</span>
        </div>
        <div className="sign-tag">
          Connected from India ♥
        </div>
      </div>
    </section>
  );
}

export default Sidebar;
