import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), replace: vi.fn(), useSearchParams: vi.fn(),
  firebaseUser: { uid: 'firebase-user-a', getIdToken: vi.fn() },
  io: vi.fn(), handlers: new Map<string, (payload: any) => void>(),
  socket: { connected: true, on: vi.fn(), off: vi.fn(), timeout: vi.fn(), emit: vi.fn(), disconnect: vi.fn() },
  queueItems: [] as Array<{ id: string; accountId: string; conversationId: string; body: string; createdAt: string; state: 'waiting' | 'sending' | 'failed'; retryOnReconnect: boolean; failureReason: string | null }>,
  queueList: vi.fn(), queueSave: vi.fn(), queueAcknowledge: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: mocks.useSearchParams }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));
vi.mock('../../components/auth/ProtectedRoute', () => ({ ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ firebaseUser: mocks.firebaseUser, appUser: { id: 'buyer-1', firstName: 'Bea', lastName: 'Buyer' } }) }));
vi.mock('../../lib/marketplaceApi', () => ({ marketplaceFetch: mocks.fetch }));
vi.mock('../../lib/offlineMessageQueue', () => ({
  listQueuedMessages: mocks.queueList,
  saveQueuedMessage: mocks.queueSave,
  acknowledgeQueuedMessage: mocks.queueAcknowledge,
}));

import Page from './page';

const thread = {
  id: 'conversation-1', participant: { name: 'Ada Artist', imageUrl: null, role: 'ARTIST' },
  artist: { id: 'artist-1', displayName: 'Ada Artist', slug: 'ada', profileImageUrl: null },
  buyer: { firstName: 'Bea', lastName: 'Buyer' },
  artwork: { id: 'work-1', title: 'Blue Study', slug: 'blue-study' }, commissionRequest: null, order: null,
  messages: [], unreadCount: 1,
};
const jsonResponse = (data: unknown, ok = true, status = 200) => ({ ok, status, json: async () => ({ data, message: ok ? undefined : 'Request failed' }), blob: async () => new Blob() });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.handlers = new Map();
  mocks.socket.on.mockImplementation((event: string, callback: (payload: any) => void) => { mocks.handlers.set(event, callback); return mocks.socket; });
  mocks.io.mockReturnValue(mocks.socket);
  mocks.firebaseUser.getIdToken.mockResolvedValue('firebase-token');
  mocks.queueItems = [];
  mocks.queueList.mockImplementation(async (accountId: string) => mocks.queueItems.filter((item) => item.accountId === accountId));
  mocks.queueSave.mockImplementation(async (item) => {
    mocks.queueItems = [...mocks.queueItems.filter((current) => current.id !== item.id), item];
  });
  mocks.queueAcknowledge.mockImplementation(async (id: string) => {
    mocks.queueItems = mocks.queueItems.filter((item) => item.id !== id);
  });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  mocks.useSearchParams.mockReturnValue({ get: () => null });
  mocks.fetch.mockImplementation(async (_user, path: string, init?: RequestInit) => {
    if (path === '/messages' && !init) return jsonResponse([thread]);
    if (path === '/messages/conversation-1') return jsonResponse({ ...thread, messages: [] });
    if (path === '/messages/conversation-1/messages') return jsonResponse({ id: 'message-1', body: 'Hello there', sender: { id: 'buyer-1', firstName: 'Bea', lastName: 'Buyer' }, createdAt: new Date().toISOString() }, true, 201);
    return jsonResponse([], true);
  });
});

describe('Messages page', () => {
  it('shows a loading state, then an honest empty inbox', async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse([]));
    render(<Page />);
    expect(screen.getByRole('status', { name: 'Loading conversations' })).toBeTruthy();
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
  });

  it('shows inbox failures and retries the server request', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Inbox unavailable')).mockResolvedValueOnce(jsonResponse([]));
    render(<Page />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Inbox unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
  });

  it('shows context and unread count, persists a message, and displays Sent until acknowledged', async () => {
    render(<Page />);
    const conversationButton = await screen.findByRole('button', { name: /Ada Artist/ });
    expect(screen.getByLabelText('1 unread messages')).toBeTruthy();
    fireEvent.click(conversationButton);
    expect(await screen.findByText('About this artwork')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Write a message'), { target: { value: 'Hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Hello there')).toBeTruthy();
    expect(await screen.findByLabelText('Message status: Sent')).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.anything(), '/messages/conversation-1/messages', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(mocks.socket.emit).toHaveBeenCalledWith('conversation:join', { conversationId: 'conversation-1' }));
  });

  it('shows Delivered only after a real-time acknowledgement event', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    fireEvent.change(await screen.findByLabelText('Write a message'), { target: { value: 'Hello there' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByLabelText('Message status: Sent');
    mocks.handlers.get('message:delivered')?.({ messageId: 'message-1' });
    expect(await screen.findByLabelText('Message status: Delivered')).toBeTruthy();
  });

  it('shows Sending until the message API acknowledges the request', async () => {
    let resolvePost!: (value: ReturnType<typeof jsonResponse>) => void;
    const pendingPost = new Promise<ReturnType<typeof jsonResponse>>((resolve) => { resolvePost = resolve; });
    mocks.fetch.mockImplementation(async (_user, path: string, init?: RequestInit) => {
      if (path === '/messages' && !init) return jsonResponse([thread]);
      if (path === '/messages/conversation-1') return jsonResponse({ ...thread, messages: [] });
      if (path === '/messages/conversation-1/messages') return pendingPost;
      return jsonResponse([]);
    });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    fireEvent.change(await screen.findByLabelText('Write a message'), { target: { value: 'Still sending' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByLabelText('Message status: Sending…')).toBeTruthy();
    resolvePost(jsonResponse({ id: 'message-pending', body: 'Still sending', sender: { id: 'buyer-1', firstName: 'Bea', lastName: 'Buyer' }, createdAt: new Date().toISOString() }, true, 201));
    expect(await screen.findByLabelText('Message status: Sent')).toBeTruthy();
  });

  it('does not queue attachment uploads while offline and explains the limitation', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    const fileInput = screen.getByLabelText('Attach image, audio, or PDF') as HTMLInputElement;
    fireEvent.change(fileInput.querySelector('input')!, { target: { files: [new File(['art'], 'art.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('File and voice uploads need a connection. This upload has not been queued.');
    expect(mocks.fetch).not.toHaveBeenCalledWith(expect.anything(), '/messages/conversation-1/uploads/signature', expect.anything());
    expect(mocks.queueSave).not.toHaveBeenCalled();
  });

  it('queues text offline and retries the same UUID once connectivity returns', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    fireEvent.change(await screen.findByLabelText('Write a message'), { target: { value: 'Save this until I reconnect' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue text message' }));

    expect(await screen.findByLabelText('Message status: Waiting for network')).toBeTruthy();
    expect(mocks.queueSave).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'firebase-user-a', conversationId: 'conversation-1', body: 'Save this until I reconnect',
      state: 'waiting', retryOnReconnect: true,
    }));
    expect(mocks.fetch).not.toHaveBeenCalledWith(expect.anything(), '/messages/conversation-1/messages', expect.anything());

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    fireEvent(window, new Event('online'));
    expect(await screen.findByLabelText('Message status: Sent')).toBeTruthy();
    const request = mocks.fetch.mock.calls.find((call) => call[1] === '/messages/conversation-1/messages')?.[2];
    expect(JSON.parse(request.body).id).toBe(mocks.queueSave.mock.calls[0][0].id);
    expect(mocks.queueAcknowledge).toHaveBeenCalledWith(mocks.queueSave.mock.calls[0][0].id);
  });

  it('keeps an unauthorized queued conversation as a visible failed item for this account', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    fireEvent.change(await screen.findByLabelText('Write a message'), { target: { value: 'Do not move this to another chat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue text message' }));
    await screen.findByLabelText('Message status: Waiting for network');

    mocks.fetch.mockImplementation(async (_user, path: string, init?: RequestInit) => {
      if (path === '/messages') return jsonResponse([thread]);
      if (path === '/messages/conversation-1') return jsonResponse({ ...thread, messages: [] });
      if (path === '/messages/conversation-1/messages' && init?.method === 'POST') return jsonResponse(null, false, 403);
      return jsonResponse([]);
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    fireEvent(window, new Event('online'));

    expect(await screen.findByLabelText('Message status: Failed to send')).toBeTruthy();
    expect(mocks.queueItems).toEqual([expect.objectContaining({
      accountId: 'firebase-user-a', conversationId: 'conversation-1', body: 'Do not move this to another chat',
      state: 'failed', retryOnReconnect: false,
    })]);
    expect(screen.getByRole('button', { name: 'Retry message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(mocks.fetch.mock.calls.some((call) => String(call[1]).includes('conversation-2'))).toBe(false);
  });

  it('submits participant reports to the existing safety report workflow', async () => {
    mocks.fetch.mockImplementation(async (_user, path: string, init?: RequestInit) => {
      if (path === '/messages') return jsonResponse([thread]);
      if (path === '/messages/conversation-1') return jsonResponse({ ...thread, messages: [] });
      if (path === '/messages/conversation-1/report' && init?.method === 'POST') return jsonResponse({ id: 'report-1', status: 'PENDING' }, true, 201);
      return jsonResponse([]);
    });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    fireEvent.click(screen.getByLabelText('Conversation options'));
    fireEvent.click(screen.getByRole('button', { name: 'Report participant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit report' }));
    expect(await screen.findByText(/Report submitted to the Fine Arts safety team/)).toBeTruthy();
  });

  it('has a searchable, keyboard-operable emoji picker', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Ada Artist/ }));
    await screen.findByLabelText('Write a message');
    fireEvent.click(screen.getByRole('button', { name: 'Add emoji' }));
    fireEvent.change(screen.getByLabelText('Search emoji'), { target: { value: 'heart' } });
    fireEvent.click(screen.getByRole('button', { name: 'heart emoji' }));
    expect(screen.getByLabelText('Write a message')).toHaveValue('❤️');
  });
});
