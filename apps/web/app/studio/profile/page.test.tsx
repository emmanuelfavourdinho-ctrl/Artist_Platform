import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({
  fetchStudioArtistProfile: vi.fn(),
  updateStudioArtistProfile: vi.fn(),
}));
const uploaded = {
  publicId: 'artists/user-1/profile/portrait',
  secureUrl: 'https://res.cloudinary.com/fine-arts/image/upload/artists/user-1/profile/portrait.jpg',
  resourceType: 'image' as const,
  format: 'jpg', width: 640, height: 640, bytes: 100_000,
  version: 1, signature: 'a'.repeat(40),
};

vi.mock('@/components/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/studio/StudioShell', () => ({ StudioShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/ui/CloudinaryImageUpload', () => ({
  CloudinaryImageUpload: ({ label, value, onChange }: { label: string; value: typeof uploaded[]; onChange: (images: typeof uploaded[]) => void }) => (
    <div><span>{label}</span><button type="button" onClick={() => onChange([uploaded])}>Mock upload {label}</button>{value[0] && <span>New image ready</span>}</div>
  ),
}));
vi.mock('@/lib/studioApi', () => api);

import Page from './page';

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchStudioArtistProfile.mockResolvedValue({
    id: 'artist-1', displayName: 'Ari Artist', slug: 'ari-artist', biography: 'A biography with enough words for this profile.', artisticStatement: null, mission: null, website: null, location: 'Lagos', profileImageUrl: null, coverImageUrl: null, verificationStatus: 'VERIFIED',
  });
  api.updateStudioArtistProfile.mockResolvedValue({
    id: 'artist-1', displayName: 'Ari Artist', slug: 'ari-artist', biography: 'A biography with enough words for this profile.', artisticStatement: null, mission: null, website: null, location: 'Lagos', profileImageUrl: null, coverImageUrl: null, verificationStatus: 'VERIFIED',
  });
});

describe('artist profile page', () => {
  it('updates supported public profile fields and links to the public page', async () => {
    render(<Page />);
    fireEvent.change(await screen.findByLabelText('Public artist name'), { target: { value: 'Ari A.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(api.updateStudioArtistProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Ari A.' })));
    expect(await screen.findByRole('status')).toHaveTextContent('public artist profile has been saved');
    expect(screen.getByRole('link', { name: /Preview public profile/ })).toHaveAttribute('href', '/artists/ari-artist');
  });

  it('sends the uploaded Cloudinary reference only with the profile save', async () => {
    render(<Page />);
    await screen.findByLabelText('Public artist name');
    fireEvent.click(screen.getByRole('button', { name: 'Mock upload Choose profile picture' }));
    expect(screen.getByText('New image ready')).toBeInTheDocument();
    expect(api.updateStudioArtistProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(api.updateStudioArtistProfile).toHaveBeenCalledWith(expect.objectContaining({ profileImage: uploaded })));
  });

  it('keeps edited values and uploaded replacements after a failed save', async () => {
    api.updateStudioArtistProfile.mockRejectedValueOnce(new Error('Profile save failed'));
    render(<Page />);
    fireEvent.change(await screen.findByLabelText('Public artist name'), { target: { value: 'Ari New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mock upload Choose cover image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Profile save failed');
    expect(screen.getByLabelText('Public artist name')).toHaveValue('Ari New');
    expect(screen.getByText('New image ready')).toBeInTheDocument();
  });
});
