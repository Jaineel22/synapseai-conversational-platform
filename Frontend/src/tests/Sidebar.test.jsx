import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import Sidebar from '../Sidebar.jsx';
import { MyContext } from '../MyContext.jsx';
import { ToastContext } from '../ToastContext.jsx';

vi.mock('axios');

function renderSidebar(contextOverrides = {}) {
  const ctx = {
    allThreads: [{ threadId: 't1', title: 'First conversation' }],
    setAllThreads: vi.fn(),
    currThreadId: 't1',
    setNewChat: vi.fn(),
    setPrompt: vi.fn(),
    setReply: vi.fn(),
    setCurrThreadId: vi.fn(),
    setPrevChats: vi.fn(),
    fetchUserThreads: vi.fn(),
    user: { name: 'Test User' },
    isSidebarOpen: false,
    setIsSidebarOpen: vi.fn(),
    ...contextOverrides,
  };
  render(
    <ToastContext.Provider value={{ showToast: vi.fn(), dismiss: vi.fn() }}>
      <MyContext.Provider value={ctx}>
        <Sidebar />
      </MyContext.Provider>
    </ToastContext.Provider>,
  );
  return ctx;
}

describe('Sidebar — delete confirmation flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty state when there are no threads', () => {
    renderSidebar({ allThreads: [] });
    expect(screen.getByText(/no chats yet/i)).toBeInTheDocument();
  });

  it('deleting requires a two-step confirm — clicking the trash icon does not delete immediately', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /delete "first conversation"/i }));

    expect(screen.getByText(/delete this chat\?/i)).toBeInTheDocument();
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('clicking Cancel dismisses the confirmation without deleting', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /delete "first conversation"/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/delete this chat\?/i)).not.toBeInTheDocument();
    expect(axios.delete).not.toHaveBeenCalled();
  });

  it('clicking Delete on the confirmation calls the API and removes the thread from state', async () => {
    axios.delete.mockResolvedValue({ data: { success: 'Thread deleted successfully' } });
    const ctx = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /delete "first conversation"/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith('/api/thread/t1');
    });
    expect(ctx.setAllThreads).toHaveBeenCalled();
  });

  it('selecting a thread loads it and requests the sidebar drawer close (a no-op on desktop)', async () => {
    axios.get.mockResolvedValue({ data: [{ role: 'user', content: 'hi' }] });
    const ctx = renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'First conversation' }));

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith('/api/thread/t1');
    });
    expect(ctx.setIsSidebarOpen).toHaveBeenCalledWith(false);
  });
});
