import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioShell } from './StudioShell';

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  fetchArtistOrderFulfillments: vi.fn(),
  fetchStudioDisputes: vi.fn(),
  fetchStudioArtworks: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: mocks.usePathname }));
vi.mock('../../lib/studioOrdersApi', () => ({ fetchArtistOrderFulfillments: mocks.fetchArtistOrderFulfillments }));
vi.mock('../../lib/studioApi', () => ({
  fetchStudioDisputes: mocks.fetchStudioDisputes,
  fetchStudioArtworks: mocks.fetchStudioArtworks,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.usePathname.mockReturnValue('/studio/orders');
  mocks.fetchArtistOrderFulfillments.mockResolvedValue([
    { shippedAt: null, order: { status: 'PROCESSING' } },
    { shippedAt: '2026-10-20T12:00:00Z', order: { status: 'SHIPPED' } },
  ]);
  mocks.fetchStudioDisputes.mockResolvedValue([
    { status: 'OPEN', artistRespondedAt: null },
    { status: 'OPEN', artistRespondedAt: '2026-10-20T12:00:00Z' },
  ]);
  mocks.fetchStudioArtworks.mockResolvedValue({ artist: { slug: 'studio-artist' }, artworks: [] });
});

describe('Artist Studio navigation shell', () => {
  it('renders role-specific destinations, active state, genuine badges, and public profile link', async () => {
    render(<StudioShell><p>Page content</p></StudioShell>);
    expect(await screen.findByRole('link', { name: /view public profile/i })).toHaveProperty('href', expect.stringContaining('/artists/studio-artist'));
    expect(screen.getByRole('navigation', { name: 'Mobile artist navigation' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /orders & delivery/i }).length).toBeGreaterThan(0);
    expect(screen.getByText('Page content')).toBeTruthy();
    const active = screen.getAllByRole('link', { name: /orders & delivery/i }).find((link) => link.getAttribute('aria-current') === 'page');
    expect(active).toBeTruthy();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps verification status reachable from the responsive Studio navigation', () => {
    mocks.usePathname.mockReturnValue('/studio/verification');
    render(<StudioShell><p>Verification</p></StudioShell>);
    const links = screen.getAllByRole('link', { name: 'Verification' });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.every((link) => link.getAttribute('href') === '/studio/verification')).toBe(true);
    expect(links.every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });
});
