import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuthPanel from '../AuthPanel.jsx';

describe('AuthPanel', () => {
  it('login mode shows only email/password, and submits them', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthPanel mode="login" onModeChange={vi.fn()} onSubmit={onSubmit} pending={false} />);

    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: '',
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('register mode includes the name field, enforces the 8-char password minimum, and submits when valid', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthPanel mode="register" onModeChange={vi.fn()} onSubmit={onSubmit} pending={false} />);

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    // Too short — blocked client-side before onSubmit is ever called.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 8 characters/i)).toHaveClass('form-hint-error');

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenough123' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'longenough123',
    });
  });

  it('password visibility toggle switches the input type', () => {
    render(<AuthPanel mode="login" onModeChange={vi.fn()} onSubmit={vi.fn()} pending={false} />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('calls onModeChange when the switch-mode link is clicked', () => {
    const onModeChange = vi.fn();
    render(<AuthPanel mode="login" onModeChange={onModeChange} onSubmit={vi.fn()} pending={false} />);

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(onModeChange).toHaveBeenCalledWith('register');
  });

  it('disables the submit button while pending', () => {
    render(<AuthPanel mode="login" onModeChange={vi.fn()} onSubmit={vi.fn()} pending={true} />);
    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
  });
});
