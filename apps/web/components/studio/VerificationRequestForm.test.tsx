import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArtistRequest } from '../../lib/verificationTypes';
import { VerificationRequestForm } from './VerificationRequestForm';

const request: ArtistRequest = {
  id: 'r1',
  round: 2,
  status: 'AWAITING_ARTIST_INPUT',
  message: null,
  createdAt: '2026-10-01T00:00:00Z',
  completedAt: null,
  cancelledAt: null,
  submission: null,
  fields: [
    { id: 'PORTFOLIO_URL', type: 'PORTFOLIO_URL', label: 'Your gallery page', instructions: 'Link to the page that shows your work', required: true },
    { id: 'ADDITIONAL_DETAILS', type: 'ADDITIONAL_DETAILS', label: 'About your process', instructions: 'Tell us how you work', required: false },
  ],
};

describe('VerificationRequestForm', () => {
  it('is generated from the stored request, with its own labels, instructions and required flags', () => {
    render(<VerificationRequestForm request={request} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/Your gallery page/)).toBeTruthy();
    expect(screen.getByText('Link to the page that shows your work')).toBeTruthy();
    expect(screen.getByText('(required)')).toBeTruthy();
    expect(screen.getByText('(optional)')).toBeTruthy();
    // URL field vs text field
    expect((screen.getByLabelText(/Your gallery page/) as HTMLInputElement).type).toBe('url');
    expect(screen.getByLabelText(/About your process/).tagName).toBe('TEXTAREA');
  });

  it('renders only the fields this round asked for, and never a file control', () => {
    render(<VerificationRequestForm request={{ ...request, fields: [request.fields[1]!] }} onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/Your gallery page/)).toBeNull();
    expect(screen.getByLabelText(/About your process/)).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/upload|attach/i)).toBeNull();
  });

  it('flags a missing required field accessibly and does not submit', async () => {
    const onSubmit = vi.fn();
    render(<VerificationRequestForm request={request} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Submit response'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Your gallery page is required/);
    expect(screen.getByLabelText(/Your gallery page/).getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits answers keyed by field id', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<VerificationRequestForm request={request} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Your gallery page/), { target: { value: 'https://me.example/work' } });
    fireEvent.click(screen.getByText('Submit response'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith([
      { fieldId: 'PORTFOLIO_URL', value: 'https://me.example/work' },
      { fieldId: 'ADDITIONAL_DETAILS', value: '' },
    ]);
  });

  it.each([
    ['http://me.example/work', 'Only HTTPS links are accepted. Enter a full URL beginning with https://'],
    ['https://user:pass@me.example/work', 'HTTPS links must not contain a username or password'],
    ['https:///work', 'Enter a valid HTTPS URL, for example https://example.com/portfolio'],
  ])('rejects unsafe portfolio URL %s before submitting', async (value, message) => {
    const onSubmit = vi.fn();
    render(<VerificationRequestForm request={request} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Your gallery page/), { target: { value } });
    fireEvent.click(screen.getByText('Submit response'));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows field-level errors returned by the server next to the right field', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      PORTFOLIO_URL: 'Only HTTPS links are accepted. Enter a full URL beginning with https://',
    });
    render(<VerificationRequestForm request={request} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Your gallery page/), { target: { value: 'ftp://x' } });
    fireEvent.click(screen.getByText('Submit response'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Only HTTPS links are accepted. Enter a full URL beginning with https://',
    );
    expect(screen.getByLabelText(/Your gallery page/).getAttribute('aria-describedby')).toContain('PORTFOLIO_URL-error');
  });

  it('disables the button while submitting to prevent double submits', async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<VerificationRequestForm request={request} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Your gallery page/), { target: { value: 'https://a.example' } });
    fireEvent.click(screen.getByText('Submit response'));
    const busy = (await screen.findByText('Submitting…')) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
  });
});
