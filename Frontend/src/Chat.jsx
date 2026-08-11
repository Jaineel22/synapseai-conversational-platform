import "./Chat.css";
import { useContext, useEffect, useRef } from "react";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function Chat() {
  const { newChat, prevChats, reply } = useContext(MyContext);
  const bottomRef = useRef(null);

  // Keep the latest message (including a message still streaming in)
  // visible as its content grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [prevChats, reply]);

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
      {/* Completed messages, persisted or optimistically shown */}
      {prevChats?.map((chat, idx) => (
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

      {/* The reply currently streaming in, rendered directly from live
          chunks — not a client-side animation over an already-complete
          response. Hidden until the first chunk actually arrives. */}
      {reply && (
        <div className="gptDiv" key="streaming-message">
          {/* .gptDiv is a flex row container — ReactMarkdown renders its
              output as sibling block elements (h1/p/h2/...) with no
              wrapper of its own, so without this div they'd become
              individual flex items laid out side by side instead of
              stacking. This wrapper is what makes them one flex child. */}
          <div>
            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
              {reply}
            </ReactMarkdown>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

export default Chat;
