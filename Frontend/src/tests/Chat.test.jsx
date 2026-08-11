import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Chat from '../Chat.jsx';
import { MyContext } from '../MyContext.jsx';

function renderChat(contextOverrides = {}) {
  const ctx = {
    newChat: false,
    prevChats: [],
    reply: null,
    setPrompt: vi.fn(),
    ...contextOverrides,
  };
  render(
    <MyContext.Provider value={ctx}>
      <Chat />
    </MyContext.Provider>,
  );
}

describe('Chat — citation rendering', () => {
  it('renders no Sources block for a plain (non-RAG) assistant message', () => {
    renderChat({
      prevChats: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello there' },
      ],
    });
    expect(screen.queryByText(/sources/i)).not.toBeInTheDocument();
  });

  it('renders a Sources block with filename and page for a grounded reply', () => {
    renderChat({
      prevChats: [
        { role: 'user', content: 'How many remote days are allowed?' },
        {
          role: 'assistant',
          content: 'Up to three days per week.',
          sources: [
            { index: 1, documentId: 'd1', filename: 'handbook.pdf', page: 4, score: 0.91 },
            { index: 2, documentId: 'd1', filename: 'handbook.pdf', page: 7, score: 0.77 },
          ],
        },
      ],
    });

    expect(screen.getByText(/sources/i)).toBeInTheDocument();
    expect(screen.getAllByText('handbook.pdf')).toHaveLength(2);
    expect(screen.getByText('p. 4')).toBeInTheDocument();
    expect(screen.getByText('p. 7')).toBeInTheDocument();
  });

  it('does not render a page chip when a source has no page (e.g. a .txt document)', () => {
    renderChat({
      prevChats: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: 'answer',
          sources: [{ index: 1, documentId: 'd1', filename: 'notes.txt', page: null, score: 0.8 }],
        },
      ],
    });

    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.queryByText(/^p\. /)).not.toBeInTheDocument();
  });
});
