import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({
  archiveStudioArtwork: vi.fn(),
  createStudioArtwork: vi.fn(),
  fetchStudioArtworks: vi.fn(),
  publishStudioArtwork: vi.fn(),
  submitStudioArtwork: vi.fn(),
  updateStudioArtwork: vi.fn(),
}));
const uploaded = {
  publicId: 'artists/artist-1/artworks/cover',
  secureUrl: 'https://res.cloudinary.com/finearts/image/upload/cover.jpg',
  resourceType: 'image' as const,
  format: 'jpg',
  width: 1200,
  height: 800,
  bytes: 1000,
  version: 1,
  signature: 'a'.repeat(40),
};

vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/studio/StudioShell', () => ({
  StudioShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/CloudinaryImageUpload', () => ({
  CloudinaryImageUpload: ({ value, onChange }: { value: typeof uploaded[]; onChange: (images: typeof uploaded[]) => void }) => (
    <div><p>{value.length} images selected</p><button type="button" onClick={() => onChange([...value, uploaded])}>Mock image upload</button></div>
  ),
}));
vi.mock('@/lib/studioApi', () => api);

import Page from './page';

const artwork = (overrides: Record<string, unknown> = {}) => ({
  id: 'art-1',
  title: 'Evening Tide',
  description: 'Blue and gold study.',
  price: '125.00',
  currency: 'USD',
  status: 'DRAFT',
  visibility: 'PRIVATE',
  imageUrl: '',
  images: [],
  available: true,
  priceReconciliationRequired: false,
  materials: 'Oil on canvas',
  yearCreated: 2025,
  width: '40',
  height: '50',
  depth: null,
  moderationHistory: [],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchStudioArtworks.mockResolvedValue({
    artworks: [artwork()],
    artist: { id: 'artist-1', displayName: 'Artist', slug: 'artist', biography: null, location: null, verificationStatus: 'VERIFIED' },
  });
  api.createStudioArtwork.mockResolvedValue({ id: 'created-1' });
  api.updateStudioArtwork.mockResolvedValue(artwork());
  api.submitStudioArtwork.mockResolvedValue(undefined);
  api.publishStudioArtwork.mockResolvedValue(undefined);
  api.archiveStudioArtwork.mockResolvedValue(undefined);
});

describe('Studio artwork management', () => {
  it('searches and filters the real artwork collection and previews current state', async () => {
    api.fetchStudioArtworks.mockResolvedValue({
      artworks: [
        artwork(),
        artwork({ id: 'art-2', title: 'Returned work', status: 'REJECTED', moderationHistory: [{ reason: 'Add a clearer cover.' }] }),
      ],
      artist: { id: 'artist-1', displayName: 'Artist', slug: 'artist', biography: null, location: null, verificationStatus: 'VERIFIED' },
    });
    render(<Page />);
    expect(await screen.findByText('Evening Tide')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search artworks'), { target: { value: 'returned' } });
    expect(screen.getByText('Returned work')).toBeTruthy();
    expect(screen.queryByText('Evening Tide')).toBeNull();
    fireEvent.change(screen.getByLabelText('Listing status'), { target: { value: 'REJECTED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('dialog', { name: 'Artwork preview' })).toBeTruthy();
    expect(screen.getByText(/Studio preview, not a public listing/)).toBeTruthy();
  });

  it('walks through the four-step create flow and submits a draft for moderation', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create artwork' }));
    fireEvent.change(screen.getByLabelText('Artwork title'), { target: { value: 'New Light' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A work in warm light.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock image upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Price (USD)'), { target: { value: '75.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/not published/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for moderation' }));

    await waitFor(() => expect(api.createStudioArtwork).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New Light',
      currency: 'USD',
      price: '75.25',
      images: [uploaded],
    })));
    expect(api.submitStudioArtwork).toHaveBeenCalledWith('created-1');
    expect(await screen.findByRole('status')).toHaveTextContent(/submitted for moderation/i);
  });

  it('keeps form data after an API failure and reports the error', async () => {
    api.createStudioArtwork.mockRejectedValueOnce(new Error('Studio save unavailable'));
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create artwork' }));
    fireEvent.change(screen.getByLabelText('Artwork title'), { target: { value: 'Still Here' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock image upload' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Price (USD)'), { target: { value: '50.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Studio save unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Price (USD)')).toHaveValue('50.00');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('1 images selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Artwork title')).toHaveValue('Still Here');
  });

  it('never presents a legacy non-USD listing as USD in the editor', async () => {
    api.fetchStudioArtworks.mockResolvedValue({
      artworks: [artwork({ currency: 'EUR', price: '80.00', priceReconciliationRequired: true })],
      artist: { id: 'artist-1', displayName: 'Artist', slug: 'artist', biography: null, location: null, verificationStatus: 'VERIFIED' },
    });
    render(<Page />);
    await screen.findByText('Evening Tide');
    expect(screen.getByText(/Legacy EUR amount is not converted/)).toBeTruthy();
  });
});
