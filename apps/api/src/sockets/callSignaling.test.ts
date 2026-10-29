import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: { conversation: { findUnique: vi.fn() } } }));
vi.mock('../config/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../config/index.js')>();
  return { ...original, config: { ...original.config, webrtc: { stunUrls: ['stun:configured.example:3478'], turnUrls: [], turnSharedSecret: undefined, turnCredentialTtlSeconds: 3600 } } };
});

import { callStateForTests, clearCallSignalingForTests, registerCallSignaling } from './callSignaling.js';
import { prisma } from '../lib/prisma.js';

const BUYER = '11111111-1111-4111-8111-111111111111';
const ARTIST = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const THREAD = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';

function fixture() {
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }) };
  const client = (userId: string, status = 'ACTIVE') => {
    const handlers = new Map<string, (...args: any[]) => any>();
    const socket = { on: vi.fn((name: string, handler: (...args: any[]) => any) => { handlers.set(name, handler); }) };
    registerCallSignaling(io as never, socket as never, userId, status);
    const send = async (event: string, payload?: unknown) => {
      let result: any;
      await handlers.get(event)?.(payload, (value: any) => { result = value; });
      return result;
    };
    return Object.assign(send, { handle: (event: string) => handlers.get(event) });
  };
  return { emitted, client };
}

const openConversation = () => ({ id: THREAD, status: 'OPEN', buyerId: BUYER, buyer: { firstName: 'Bea', lastName: 'Buyer' }, artist: { userId: ARTIST, displayName: 'Ada Artist' } });

beforeEach(() => {
  clearCallSignalingForTests(); vi.resetAllMocks();
  vi.mocked(prisma.conversation.findUnique).mockResolvedValue(openConversation() as never);
});

describe('call signaling authorization and state', () => {
  it('derives recipient identity from the conversation and rejects non-members', async () => {
    const { emitted, client } = fixture();
    const buyer = client(BUYER);
    const created = await buyer('call:initiate', { conversationId: THREAD, requestId: REQUEST, mediaMode: 'audio' });
    expect(created.ok).toBe(true);
    expect(emitted).toContainEqual(expect.objectContaining({ room: `user:${ARTIST}`, event: 'call:incoming', payload: expect.objectContaining({ callerName: 'Bea Buyer', direction: 'incoming' }) }));

    const outsider = client(OTHER);
    expect(await outsider('call:ice-config', { callId: created.call.callId })).toMatchObject({ ok: false, code: 'CALL_FORBIDDEN' });
  });

  it('rejects inactive callers and closed conversations', async () => {
    const { client } = fixture();
    expect(await client(BUYER, 'RESTRICTED')('call:initiate', { conversationId: THREAD, requestId: REQUEST, mediaMode: 'video' })).toMatchObject({ ok: false, code: 'CALL_NOT_ALLOWED' });
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ ...openConversation(), status: 'CLOSED' } as never);
    expect(await client(BUYER)('call:initiate', { conversationId: THREAD, requestId: REQUEST, mediaMode: 'video' })).toMatchObject({ ok: false, code: 'CONVERSATION_CLOSED' });
  });

  it('makes duplicate requests idempotent, permits only invitee acceptance and records terminal decisions', async () => {
    const { emitted, client } = fixture();
    const buyer = client(BUYER); const artist = client(ARTIST);
    const payload = { conversationId: THREAD, requestId: REQUEST, mediaMode: 'video' };
    const first = await buyer('call:initiate', payload);
    const second = await buyer('call:initiate', payload);
    expect(second.call.callId).toBe(first.call.callId);
    expect(await buyer('call:accept', { callId: first.call.callId })).toMatchObject({ ok: false, code: 'CALL_FORBIDDEN' });
    expect(await artist('call:accept', { callId: first.call.callId })).toMatchObject({ ok: true, state: 'connecting' });
    expect(callStateForTests(first.call.callId)?.state).toBe('connecting');
    expect(await artist('call:decline', { callId: first.call.callId })).toMatchObject({ ok: false, code: 'INVALID_CALL_STATE' });
    expect(await buyer('call:end', { callId: first.call.callId })).toMatchObject({ ok: true, state: 'ended' });
    expect(emitted.some((event) => event.event === 'call:ended')).toBe(true);
  });

  it('returns configured ICE data only to active participants and fails closed if the conversation closes', async () => {
    const { client } = fixture(); const buyer = client(BUYER);
    const created = await buyer('call:initiate', { conversationId: THREAD, requestId: REQUEST, mediaMode: 'audio' });
    const result = await buyer('call:ice-config', { callId: created.call.callId });
    expect(result.iceServers).toEqual([{ urls: ['stun:configured.example:3478'] }]);
    expect(result).not.toHaveProperty('credential');
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ ...openConversation(), status: 'CLOSED' } as never);
    expect(await buyer('call:ice-config', { callId: created.call.callId })).toMatchObject({ ok: false, code: 'CALL_FORBIDDEN' });
  });

  it('allows only role-correct SDP signals and rechecks conversation membership for each signal', async () => {
    const { emitted, client } = fixture();
    const buyer = client(BUYER); const artist = client(ARTIST);
    const created = await buyer('call:initiate', { conversationId: THREAD, requestId: REQUEST, mediaMode: 'audio' });
    await artist('call:accept', { callId: created.call.callId });
    const offer = { type: 'offer', sdp: 'v=0\r\n' };
    const answer = { type: 'answer', sdp: 'v=0\r\n' };
    await buyer.handle('call:signal')?.({ callId: created.call.callId, kind: 'answer', data: answer });
    await artist.handle('call:signal')?.({ callId: created.call.callId, kind: 'offer', data: offer });
    expect(emitted.filter((event) => event.event === 'call:signal')).toHaveLength(0);
    await buyer.handle('call:signal')?.({ callId: created.call.callId, kind: 'offer', data: offer });
    expect(emitted.filter((event) => event.event === 'call:signal')).toHaveLength(1);
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ ...openConversation(), status: 'CLOSED' } as never);
    await buyer.handle('call:signal')?.({ callId: created.call.callId, kind: 'offer', data: offer });
    expect(emitted.filter((event) => event.event === 'call:signal')).toHaveLength(1);
  });
});
