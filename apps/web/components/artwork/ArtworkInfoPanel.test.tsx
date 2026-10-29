import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArtworkDetail } from '../../types/artwork';

vi.mock('./ArtworkActions', () => ({
  ArtworkActions: ({ available }: { available: boolean }) => <button disabled={!available}>{available ? 'Buy Artwork' : 'Sold'}</button>,
}));
vi.mock('../ui/ShareActions', () => ({ ShareActions: () => <button>Copy link</button> }));

import { ArtworkInfoPanel } from './ArtworkInfoPanel';

const artwork = (available = true) => ({
  id: 'piece-id', slug: 'quiet-tide', title: 'Quiet Tide', description: 'An original oil painting.', price: '120.00', currency: 'USD',
  yearCreated: null, dimensions: { width: null, height: null, depth: null, weight: null }, materials: null, publishedAt: null,
  images: [], categories: [], styles: [], themes: [], mediums: [], available,
  artist: { id: 'artist-id', slug: 'ari-artist', name: 'Ari Artist', verified: true, biography: null, profileImageUrl: null },
} as ArtworkDetail);

describe('public artwork buyer actions', () => {
  it('links to the artist, messages, commission request, and exposes purchase for available work', () => {
    render(<ArtworkInfoPanel artwork={artwork()} />);
    expect(screen.getByRole('link', { name: 'Message Artist' })).toHaveAttribute('href', expect.stringContaining('/messages?'));
    expect(screen.getByRole('link', { name: 'Request a Commission' })).toHaveAttribute('href', expect.stringContaining('/commissions/request?'));
    expect(screen.getByRole('link', { name: /Ari Artist/ })).toHaveAttribute('href', '/artists/ari-artist');
    expect(screen.getByRole('button', { name: 'Buy Artwork' })).toBeEnabled();
  });

  it('does not offer purchase for unavailable work', () => {
    render(<ArtworkInfoPanel artwork={artwork(false)} />);
    expect(screen.getByRole('button', { name: 'Sold' })).toBeDisabled();
  });
});
