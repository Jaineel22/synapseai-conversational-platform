import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatWindow from '../ChatWindow.jsx';
import { MyContext } from '../MyContext.jsx';
import { ThemeContext } from '../ThemeContext.jsx';
import { ToastContext } from '../ToastContext.jsx';

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
    setNewChat: vi.fn(),
    user: { name: 'Test User', email: 'test@example.com' },
    handleLogout: vi.fn(),
    isSidebarOpen: false,
    setIsSidebarOpen: vi.fn(),
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
