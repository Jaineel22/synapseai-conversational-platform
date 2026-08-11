import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatWindow from '../ChatWindow.jsx';
import { MyContext } from '../MyContext.jsx';
import { ThemeContext } from '../ThemeContext.jsx';
import { ToastContext } from '../ToastContext.jsx';
import * as documentsApi from '../api/documents.js';

vi.mock('../api/documents.js');

// Builds a fake fetch Response whose body streams the given SSE events,
// matching exactly what Backend/routes/chat.js actually sends.
function sseResponse(events) {
  const encoder = new TextEncoder();
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return {
    ok: true,
    headers: { get: () => 'text/event-stream' },
    body: stream,
  };
}

function jsonResponse(status, data) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    json: async () => data,
  };
}

const mockShowToast = vi.fn();

function renderChatWindow(contextOverrides = {}) {
  const ctx = {
    prompt: 'Hello there',
    setPrompt: vi.fn(),
    reply: null,
    setReply: vi.fn(),
    currThreadId: 'test-thread',
    setPrevChats: vi.fn(),
    newChat: true,
    setNewChat: vi.fn(),
    user: { name: 'Test User', email: 'test@example.com' },
    handleLogout: vi.fn(),
    isSidebarOpen: false,
    setIsSidebarOpen: vi.fn(),
    fetchUserThreads: vi.fn(),
    ...contextOverrides,
  };
  render(
    <ToastContext.Provider value={{ showToast: mockShowToast, dismiss: vi.fn() }}>
      <ThemeContext.Provider value={{ theme: 'dark', toggleTheme: vi.fn() }}>
        <MyContext.Provider value={ctx}>
          <ChatWindow />
        </MyContext.Provider>
      </ThemeContext.Provider>
    </ToastContext.Provider>,
  );
  return ctx;
}

describe('ChatWindow — streaming chat consumption', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: no documents, so the "Ask my documents" toggle stays
    // disabled unless a specific test overrides this.
    documentsApi.listDocuments.mockResolvedValue([]);
  });

  it('sends the message, streams accumulating text into setReply, then commits the finished message', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      sseResponse([
        { event: 'chunk', data: { text: 'Hello ' } },
        { event: 'chunk', data: { text: 'world!' } },
        { event: 'done', data: {} },
      ]),
    );

    const ctx = renderChatWindow();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(ctx.setPrevChats).toHaveBeenCalled();
    });

    // setReply should have been called with progressively accumulating
    // text, ending with the full concatenation of both chunks — this is
    // the real-streaming behavior, as opposed to the old fake typewriter
    // that only ever received the already-complete string.
    const replyValues = ctx.setReply.mock.calls.map((call) => call[0]);
    expect(replyValues).toContain('');
    expect(replyValues).toContain('Hello ');
    expect(replyValues).toContain('Hello world!');
    expect(replyValues[replyValues.length - 1]).toBe(null); // cleared once committed

    // The finished assistant message is appended to persisted history via
    // a functional update — invoke it to check the resulting shape.
    const updaterCalls = ctx.setPrevChats.mock.calls.map((call) => call[0]);
    const appendUserCall = updaterCalls.find((fn) => {
      const result = fn([]);
      return result[0]?.role === 'user';
    });
    expect(appendUserCall([])).toEqual([{ role: 'user', content: 'Hello there' }]);

    const appendAssistantCall = updaterCalls.find((fn) => {
      const result = fn([{ role: 'user', content: 'Hello there' }]);
      return result.some((m) => m.role === 'assistant');
    });
    expect(appendAssistantCall([{ role: 'user', content: 'Hello there' }])).toEqual([
      { role: 'user', content: 'Hello there' },
      { role: 'assistant', content: 'Hello world!' },
    ]);

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ message: 'Hello there', threadId: 'test-thread' }),
      }),
    );
  });

  it('refreshes the sidebar thread list after a brand-new conversation\'s first message completes', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      sseResponse([{ event: 'chunk', data: { text: 'Hi!' } }, { event: 'done', data: {} }]),
    );

    const ctx = renderChatWindow({ newChat: true });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(ctx.fetchUserThreads).toHaveBeenCalled();
    });
  });

  it('does not re-fetch the thread list for a message sent into an already-existing thread', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      sseResponse([{ event: 'chunk', data: { text: 'Hi!' } }, { event: 'done', data: {} }]),
    );

    const ctx = renderChatWindow({ newChat: false });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(ctx.setPrevChats).toHaveBeenCalled();
    });
    expect(ctx.fetchUserThreads).not.toHaveBeenCalled();
  });

  it('on a pre-stream failure (e.g. validation error), restores the prompt and rolls back the optimistic message instead of keeping it', async () => {
    window.fetch = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'Missing required fields' }));
    mockShowToast.mockClear();

    const ctx = renderChatWindow();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Missing required fields', { type: 'error' });
    });

    expect(ctx.setPrompt).toHaveBeenCalledWith('Hello there'); // restored, not lost
    const rollback = ctx.setPrevChats.mock.calls.map((c) => c[0]).find((fn) => {
      const result = fn([{ role: 'user', content: 'Hello there' }]);
      return result.length === 0;
    });
    expect(rollback).toBeDefined();
  });

  it('shows a Stop button while streaming, which aborts the in-flight request', async () => {
    let capturedSignal;
    window.fetch = vi.fn((url, options) => {
      capturedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    renderChatWindow();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    const stopButton = await screen.findByRole('button', { name: /stop generating/i });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(capturedSignal.aborted).toBe(true);
    });
  });
});

describe('ChatWindow — "Ask my documents" (RAG) mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('disables the knowledge toggle when the user has no ready documents', async () => {
    documentsApi.listDocuments.mockResolvedValue([]);
    renderChatWindow();

    const toggle = await screen.findByRole('button', { name: /ask my documents/i });
    expect(toggle).toBeDisabled();
  });

  it('enables the knowledge toggle once at least one document is ready', async () => {
    documentsApi.listDocuments.mockResolvedValue([
      { id: '1', filename: 'handbook.pdf', status: 'ready' },
      { id: '2', filename: 'still-processing.txt', status: 'processing' },
    ]);
    renderChatWindow();

    const toggle = await screen.findByRole('button', { name: /ask my documents/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(screen.getByText('1 document available')).toBeInTheDocument();
  });

  it('includes useKnowledge:true in the chat request only once the toggle is turned on', async () => {
    documentsApi.listDocuments.mockResolvedValue([{ id: '1', filename: 'handbook.pdf', status: 'ready' }]);
    window.fetch = vi.fn().mockResolvedValue(
      sseResponse([{ event: 'chunk', data: { text: 'ok' } }, { event: 'done', data: { sources: [] } }]),
    );

    renderChatWindow();
    const toggle = await screen.findByRole('button', { name: /ask my documents/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    const [, options] = window.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ message: 'Hello there', threadId: 'test-thread', useKnowledge: true });
  });

  it('attaches returned source citations to the persisted assistant message', async () => {
    documentsApi.listDocuments.mockResolvedValue([{ id: '1', filename: 'handbook.pdf', status: 'ready' }]);
    const sources = [{ index: 1, documentId: 'd1', filename: 'handbook.pdf', page: 4, score: 0.9 }];
    window.fetch = vi.fn().mockResolvedValue(
      sseResponse([{ event: 'chunk', data: { text: 'answer' } }, { event: 'done', data: { sources } }]),
    );

    const ctx = renderChatWindow();
    const toggle = await screen.findByRole('button', { name: /ask my documents/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      const updaterCalls = ctx.setPrevChats.mock.calls.map((c) => c[0]);
      const withSources = updaterCalls.some((fn) => {
        const result = fn([]);
        return result.some((m) => m.role === 'assistant' && m.sources?.length === 1);
      });
      expect(withSources).toBe(true);
    });
  });
});
