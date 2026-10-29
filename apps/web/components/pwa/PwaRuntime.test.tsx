import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaRuntime } from './PwaRuntime';

const mocks = vi.hoisted(() => ({
  auth: { firebaseUser: { uid: 'firebase-user-a' } as { uid: string } | null, loading: false },
  clearAccount: vi.fn(), clearAll: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../lib/offlineMessageQueue', () => ({
  clearQueueForOtherAccounts: mocks.clearAccount,
  clearQueuedMessages: mocks.clearAll,
}));

describe('PwaRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearAccount.mockResolvedValue(undefined);
    mocks.clearAll.mockResolvedValue(undefined);
    mocks.auth.firebaseUser = { uid: 'firebase-user-a' };
    mocks.auth.loading = false;
  });

  it('clears other accounts on account switch and clears all queued drafts on logout', async () => {
    const view = render(<PwaRuntime />);
    await waitFor(() => expect(mocks.clearAccount).toHaveBeenCalledWith('firebase-user-a'));
    mocks.auth.firebaseUser = { uid: 'firebase-user-b' };
    view.rerender(<PwaRuntime />);
    await waitFor(() => expect(mocks.clearAccount).toHaveBeenCalledWith('firebase-user-b'));
    mocks.auth.firebaseUser = null;
    view.rerender(<PwaRuntime />);
    await waitFor(() => expect(mocks.clearAll).toHaveBeenCalledOnce());
  });

  it('shows install guidance only after a supported browser emits its install event', async () => {
    render(<PwaRuntime />);
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    const prompt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    });
    fireEvent(window, prompt);
    expect(await screen.findByRole('button', { name: 'Install' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(prompt.prompt).toHaveBeenCalledOnce());
  });
});
