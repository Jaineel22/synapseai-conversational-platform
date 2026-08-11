import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider } from '../ToastProvider.jsx';
import { useToast } from '../useToast.js';

function TestConsumer() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Something went wrong', { type: 'error' })}>fire-error</button>
      <button onClick={() => showToast('Saved successfully', { type: 'success' })}>fire-success</button>
      <button onClick={() => showToast('Something went wrong', { type: 'info' })}>fire-info-same-text</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast when showToast is called', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not stack duplicate (message, type) toasts — repeated identical failures stay a single toast', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    act(() => fireEvent.click(screen.getByText('fire-error')));
    act(() => fireEvent.click(screen.getByText('fire-error')));

    expect(screen.getAllByText('Something went wrong')).toHaveLength(1);
  });

  it('treats the same message with a different type as a distinct toast', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    act(() => fireEvent.click(screen.getByText('fire-info-same-text')));

    const toasts = screen.getAllByText('Something went wrong');
    expect(toasts).toHaveLength(2);
  });

  it('shows independent toasts for different messages', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    act(() => fireEvent.click(screen.getByText('fire-success')));

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('dismisses a toast via its close button', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    act(() => fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i })));

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('auto-dismisses after its duration elapses', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4500));
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('re-triggering a duplicate toast refreshes its dismiss timer instead of dismissing early', () => {
    renderWithProvider();
    act(() => fireEvent.click(screen.getByText('fire-error')));
    act(() => vi.advanceTimersByTime(3000)); // most of the way to the original 4500ms timeout
    act(() => fireEvent.click(screen.getByText('fire-error'))); // duplicate — should push the timer back out

    act(() => vi.advanceTimersByTime(3000)); // 6000ms since first fire, but only 3000ms since the refresh
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500)); // now 4500ms since the refresh
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
