import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { ConversationCallManager } from './ConversationCallManager';

const handlers = new Map<string, (...args: any[]) => void>();
const socket = {
  connected: true,
  on: vi.fn((event: string, callback: (...args: any[]) => void) => { handlers.set(event, callback); }),
  off: vi.fn((event: string) => { handlers.delete(event); }),
  emit: vi.fn((event: string, _payload: unknown, callback?: (err: null, result: unknown) => void) => {
    callback?.(null, { ok: true, state: 'ended' }); return socket;
  }),
  timeout: vi.fn(() => ({ emit: (event: string, _payload: unknown, callback: (err: null, result: unknown) => void) => callback(null, { ok: true, state: 'ended' }) })),
};

beforeEach(() => { vi.clearAllMocks(); handlers.clear(); });

describe('ConversationCallManager', () => {
  it('shows incoming caller, supports decline, and clears the call UI', async () => {
    render(<ConversationCallManager socket={socket as unknown as Socket} conversationId="conversation-1" participantName="Ada Artist" />);
    handlers.get('call:incoming')?.({ callId: 'call-1', conversationId: 'conversation-1', mediaMode: 'audio', state: 'ringing', callerName: 'Bea Buyer' });
    expect(await screen.findByRole('dialog', { name: 'Audio and video call' })).toBeTruthy();
    expect(screen.getByText('Bea Buyer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Decline call' }));
    await waitFor(() => expect(socket.timeout).toHaveBeenCalled());
    expect(socket.timeout).toHaveBeenCalledWith(8000);
    expect(await screen.queryByRole('dialog', { name: 'Audio and video call' })).toBeNull();
  });

  it('explains denied microphone access and does not send an initiation request', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')) } });
    render(<ConversationCallManager socket={socket as unknown as Socket} conversationId="conversation-1" participantName="Ada Artist" />);
    fireEvent.click(screen.getByRole('button', { name: 'Audio call' }));
    expect(await screen.findByText('Allow microphone or camera access in your browser settings, then try again.')).toBeTruthy();
    expect(socket.timeout).not.toHaveBeenCalled();
  });

  it('keeps audio and video call controls unavailable while offline', () => {
    render(<ConversationCallManager socket={socket as unknown as Socket} conversationId="conversation-1" participantName="Ada Artist" online={false} />);
    expect(screen.getByRole('button', { name: 'Audio call' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Video call' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Audio call' }));
    expect(socket.timeout).not.toHaveBeenCalled();
  });
});
