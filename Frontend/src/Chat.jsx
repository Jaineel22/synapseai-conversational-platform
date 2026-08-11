import "./Chat.css";
import { useContext, useEffect, useRef, useState } from "react";
import { MyContext } from "./MyContext";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

const SUGGESTIONS = [
  {
    icon: "fa-lightbulb",
    title: "Explain a concept",
    desc: "Break down something complex into plain language",
    prompt: "Explain how ",
  },
  {
    icon: "fa-bug",
    title: "Debug my code",
    desc: "Find and fix an error in a snippet",
    prompt: "Help me debug this error:\n\n",
  },
  {
    icon: "fa-align-left",
    title: "Summarize something",
    desc: "Turn a long passage into key points",
    prompt: "Summarize the following in 3 bullet points:\n\n",
  },
  {
    icon: "fa-wand-magic-sparkles",
    title: "Brainstorm ideas",
    desc: "Generate options to get unstuck",
    prompt: "Brainstorm 5 ideas for ",
  },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context, etc.) — the
      // button simply won't flip to "Copied", no need for a toast over
      // something this low-stakes.
    }
  };

  return (
    <button
      className={`message-action ${copied ? 'message-action-done' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy message"}
    >
      <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true"></i>
    </button>
  );
}

// Structured citations for a RAG-grounded reply — kept visually distinct
// from the answer itself (a labeled strip below the message content, not
// interleaved with it) so it reads as "here's where this came from" rather
// than part of the model's own prose.
function SourcesList({ sources }) {
  return (
    <div className="message-sources">
      <span className="message-sources-label">
        <i className="fa-solid fa-book-open" aria-hidden="true"></i> Sources
      </span>
      <div className="message-sources-list">
        {sources.map((s) => (
          <span className="source-chip" key={`${s.documentId}-${s.index}`} title={`Similarity ${(s.score * 100).toFixed(0)}%`}>
            <span className="source-chip-name">{s.filename}</span>
            {s.page ? <span className="source-chip-page">p. {s.page}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function Chat() {
  const { newChat, prevChats, reply, setPrompt } = useContext(MyContext);
  const bottomRef = useRef(null);

  // Keep the latest message (including a message still streaming in)
  // visible as its content grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [prevChats, reply]);

  // Welcome / empty state
  if (newChat && (!prevChats || prevChats.length === 0)) {
    return (
      <div className="chats welcome-chats">
        <div className="welcome-state">
          <div className="welcome-orb" aria-hidden="true">
            <div className="welcome-orb-ring"></div>
            <div className="welcome-orb-core">
              <i className="fa-solid fa-brain"></i>
            </div>
            <div className="welcome-node welcome-node-1"></div>
            <div className="welcome-node welcome-node-2"></div>
            <div className="welcome-node welcome-node-3"></div>
          </div>
          <h2 className="welcome-title">How can I help?</h2>
          <p className="welcome-sub">Ask a question, paste in some code, or pick up where a past conversation left off.</p>

          <div className="suggested-prompts">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                className="suggestion-card"
                onClick={() => setPrompt(s.prompt)}
              >
                <i className={`fa-solid ${s.icon}`} aria-hidden="true"></i>
                <span className="suggestion-title">{s.title}</span>
                <span className="suggestion-desc">{s.desc}</span>
              </button>
            ))}
          </div>
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
            <div className="message-block">
              <div className="message-content">
                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                  {chat.content}
                </ReactMarkdown>
              </div>
              {chat.sources?.length > 0 && <SourcesList sources={chat.sources} />}
              <div className="message-actions">
                <CopyButton text={chat.content} />
              </div>
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
