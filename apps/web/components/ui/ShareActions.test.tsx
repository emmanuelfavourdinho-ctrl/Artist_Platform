import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareActions } from './ShareActions';

describe('ShareActions', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('copies a public URL and confirms only after clipboard succeeds', async () => {
    render(<ShareActions url="https://finearts.example/artists/ari" title="Ari" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://finearts.example/artists/ari'));
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied.');
  });

  it('uses native sharing when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ShareActions url="https://finearts.example/artwork/quiet-tide" title="Quiet Tide" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Quiet Tide', url: 'https://finearts.example/artwork/quiet-tide' }));
  });
});
