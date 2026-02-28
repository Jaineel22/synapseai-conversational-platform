import "./Chat.css";
import React, { useContext, useState, useEffect } from "react";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function Chat() {
  const { newChat, prevChats, reply } = useContext(MyContext);
  const [latestReply, setLatestReply] = useState(null);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (reply === null) {
      setLatestReply(null);
      setIsTyping(false);
      return;
    }

    if (typeof reply === 'string' && reply.length > 0) {
      setIsTyping(true);
      const words = reply.split(" ");
      if (words.length === 0) return;

      let idx = 0;
      const interval = setInterval(() => {
        setLatestReply(words.slice(0, idx + 1).join(" "));
        idx++;
        if (idx >= words.length) {
          clearInterval(interval);
          setIsTyping(false);
        }
      }, 35);

      return () => clearInterval(interval);
    }
  }, [reply]);

  // Welcome / empty state
  if (newChat && (!prevChats || prevChats.length === 0)) {
    return (
      <div className="chats" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div className="welcome-state">
          <div className="welcome-icon">
            <i className="fa-solid fa-brain" style={{ color: 'white' }}></i>
          </div>
          <div className="welcome-title">SynapseAI</div>
          <div className="welcome-sub">// neural pathways ready</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chats">
      {/* Previous messages (all except last assistant) */}
      {prevChats?.slice(0, -1).map((chat, idx) => (
        <div
          className={chat.role === "user" ? "userDiv" : "gptDiv"}
          key={`chat-${idx}-${chat.role}`}
        >
          {chat.role === "user" ? (
            <p className="userMessage">{chat.content}</p>
          ) : (
            <div>
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {chat.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      ))}

      {/* Latest AI message with typing animation */}
      {prevChats && prevChats.length > 0 && (
        <div className="gptDiv" key="latest-message">
          {isTyping ? (
            <div>
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {latestReply || ''}
              </ReactMarkdown>
            </div>
          ) : (
            <div>
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {prevChats[prevChats.length - 1].content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Chat;
