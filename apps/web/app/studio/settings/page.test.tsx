import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const api = vi.hoisted(() => ({ fetchMyProfile: vi.fn(), updateMyProfile: vi.fn() }));

vi.mock('@/components/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/studio/StudioShell', () => ({ StudioShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/lib/userApi', () => api);

import Page from './page';

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchMyProfile.mockResolvedValue({ firstName: 'Ari', lastName: 'Artist', email: 'ari@example.test', phone: null });
  api.updateMyProfile.mockResolvedValue({ firstName: 'Arielle', lastName: 'Artist', email: 'ari@example.test', phone: '123' });
});

describe('artist settings page', () => {
  it('updates existing account details and shows feedback', async () => {
    render(<Page />);
    fireEvent.change(await screen.findByLabelText('First name'), { target: { value: 'Arielle' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save account details' }));
    await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalledWith({
      firstName: 'Arielle', lastName: 'Artist', phone: '123',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Account details saved');
  });
});
