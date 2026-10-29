import { createHmac, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { config } from '../config/index.js';
import { prisma } from '../lib/prisma.js';

export type CallMediaMode = 'audio' | 'video';
export type ActiveCallState = 'ringing' | 'connecting' | 'connected' | 'reconnecting';
type TerminalCallState = 'declined' | 'cancelled' | 'missed' | 'failed' | 'ended';
type SignalKind = 'offer' | 'answer' | 'ice-candidate';

interface CallSession {
  id: string;
  requestId: string;
  conversationId: string;
  callerId: string;
  recipientId: string;
  callerName: string;
  recipientName: string;
  mediaMode: CallMediaMode;
  state: ActiveCallState | TerminalCallState;
  createdAt: number;
  connectedAt?: number;
  ringTimer?: ReturnType<typeof setTimeout>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  setupTimer?: ReturnType<typeof setTimeout>;
  tombstoneTimer?: ReturnType<typeof setTimeout>;
}

type Ack = (result: Record<string, unknown>) => void;
const calls = new Map<string, CallSession>();
const activeByUser = new Map<string, string>();
const requestCalls = new Map<string, string>();
const initiationTimes = new Map<string, number[]>();
const initiatingUsers = new Set<string>();
const CALL_RING_MS = 45_000;
const CALL_SETUP_MS = 30_000;
const CALL_RECONNECT_MS = 20_000;
const TOMBSTONE_MS = 120_000;
const MAX_INITIATIONS_PER_MINUTE = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(io: Server, userId: string, event: string, payload: unknown) {
  io.to(`user:${userId}`).emit(event, payload);
}

function activeCallForUser(userId: string) {
  const id = activeByUser.get(userId);
  const call = id ? calls.get(id) : undefined;
  return call && !isTerminal(call.state) ? call : undefined;
}

function isTerminal(state: CallSession['state']): state is TerminalCallState {
  return ['declined', 'cancelled', 'missed', 'failed', 'ended'].includes(state);
}

function ackError(ack: Ack | undefined, code: string, message: string) {
  ack?.({ ok: false, code, message });
}

function getCallForActor(callId: unknown, userId: string, ack?: Ack): CallSession | null {
  if (typeof callId !== 'string' || !UUID.test(callId)) {
    ackError(ack, 'INVALID_CALL_ID', 'This call is no longer available.');
    return null;
  }
  const call = calls.get(callId);
  if (!call) {
    ackError(ack, 'CALL_NOT_FOUND', 'This call is no longer available.');
    return null;
  }
  if (call.callerId !== userId && call.recipientId !== userId) {
    ackError(ack, 'CALL_FORBIDDEN', 'You are not a participant in this call.');
    return null;
  }
  return call;
}

async function recheckConversationAccess(io: Server, call: CallSession, userId: string, ack?: Ack) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: call.conversationId },
      select: { status: true, buyerId: true, artist: { select: { userId: true } } },
    });
    if (conversation?.status === 'OPEN' && (conversation.buyerId === userId || conversation.artist.userId === userId)) return true;
  } catch { /* Fail closed if membership cannot be confirmed. */ }
  finishCall(io, call, 'failed');
  ackError(ack, 'CALL_FORBIDDEN', 'This conversation is no longer available for calling.');
  return false;
}

function clearCallTimers(call: CallSession) {
  if (call.ringTimer) clearTimeout(call.ringTimer);
  if (call.reconnectTimer) clearTimeout(call.reconnectTimer);
  if (call.tombstoneTimer) clearTimeout(call.tombstoneTimer);
  if (call.setupTimer) clearTimeout(call.setupTimer);
  call.ringTimer = undefined;
  call.reconnectTimer = undefined;
  call.setupTimer = undefined;
}

function finishCall(io: Server, call: CallSession, state: TerminalCallState, endedBy?: string) {
  if (isTerminal(call.state)) return;
  clearCallTimers(call);
  call.state = state;
  activeByUser.delete(call.callerId);
  activeByUser.delete(call.recipientId);
  const payload = { callId: call.id, conversationId: call.conversationId, state, endedBy: endedBy ?? null };
  send(io, call.callerId, `call:${state}`, payload);
  send(io, call.recipientId, `call:${state}`, payload);
  call.tombstoneTimer = setTimeout(() => {
    calls.delete(call.id);
    requestCalls.delete(`${call.callerId}:${call.requestId}`);
  }, TOMBSTONE_MS);
  call.tombstoneTimer.unref?.();
}

function ephemeralIceServers(userId: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = [];
  if (config.webrtc.stunUrls.length) iceServers.push({ urls: config.webrtc.stunUrls });
  const hasTurn = config.webrtc.turnUrls.length > 0 && Boolean(config.webrtc.turnSharedSecret);
  if (hasTurn) {
    const username = `${nowSeconds + config.webrtc.turnCredentialTtlSeconds}:${userId}`;
    const credential = createHmac('sha1', config.webrtc.turnSharedSecret!).update(username).digest('base64');
    iceServers.push({ urls: config.webrtc.turnUrls, username, credential });
  }
  return {
    iceServers,
    turnAvailable: hasTurn,
    networkNotice: hasTurn ? null : 'TURN is not configured. Calls may fail on restrictive networks.',
  };
}

function signalPayloadIsValid(kind: SignalKind, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  const text = JSON.stringify(data);
  if (text.length > (kind === 'ice-candidate' ? 16_000 : 100_000)) return false;
  if (kind === 'ice-candidate') return typeof record.candidate === 'string' && record.candidate.length <= 12_000;
  return record.type === kind && typeof record.sdp === 'string' && record.sdp.length > 0;
}

async function initiate(io: Server, userId: string, userStatus: string, payload: unknown, ack?: Ack) {
  const input = payload as { conversationId?: unknown; requestId?: unknown; mediaMode?: unknown } | null;
  if (userStatus !== 'ACTIVE') return ackError(ack, 'CALL_NOT_ALLOWED', 'Your account cannot start calls right now.');
  if (!input || typeof input.conversationId !== 'string' || !UUID.test(input.conversationId) ||
      typeof input.requestId !== 'string' || !UUID.test(input.requestId) ||
      (input.mediaMode !== 'audio' && input.mediaMode !== 'video')) {
    return ackError(ack, 'INVALID_CALL_REQUEST', 'Choose a valid conversation and call type.');
  }

  const requestKey = `${userId}:${input.requestId}`;
  const previousId = requestCalls.get(requestKey);
  const previous = previousId ? calls.get(previousId) : undefined;
  if (previous) {
    if (previous.conversationId !== input.conversationId || previous.mediaMode !== input.mediaMode) {
      return ackError(ack, 'CALL_REQUEST_CONFLICT', 'This call request id was already used.');
    }
    ack?.({ ok: true, call: publicCall(previous) });
    return;
  }
  if (initiatingUsers.has(userId)) return ackError(ack, 'CALL_ALREADY_ACTIVE', 'Finish your current call before starting another.');

  const now = Date.now();
  const recent = (initiationTimes.get(userId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= MAX_INITIATIONS_PER_MINUTE) return ackError(ack, 'CALL_RATE_LIMITED', 'Please wait before starting another call.');
  if (activeCallForUser(userId)) return ackError(ack, 'CALL_ALREADY_ACTIVE', 'Finish your current call before starting another.');
  recent.push(now);
  initiationTimes.set(userId, recent);

  initiatingUsers.add(userId);
  let conversation;
  try {
    conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true, status: true, buyerId: true,
      buyer: { select: { firstName: true, lastName: true } },
      artist: { select: { userId: true, displayName: true } },
    },
    });
  } finally { initiatingUsers.delete(userId); }
  if (!conversation) return ackError(ack, 'CONVERSATION_NOT_FOUND', 'This conversation could not be found.');
  if (conversation.status !== 'OPEN') return ackError(ack, 'CONVERSATION_CLOSED', 'Calls are unavailable in a closed conversation.');

  const isBuyer = conversation.buyerId === userId;
  const isArtist = conversation.artist.userId === userId;
  if (!isBuyer && !isArtist) return ackError(ack, 'CALL_FORBIDDEN', 'You are not a participant in this conversation.');
  const recipientId = isBuyer ? conversation.artist.userId : conversation.buyerId;
  if (recipientId === userId || activeCallForUser(recipientId)) return ackError(ack, 'RECIPIENT_UNAVAILABLE', 'The other participant is unavailable for a call.');

  const callerName = isBuyer
    ? `${conversation.buyer.firstName} ${conversation.buyer.lastName}`.trim()
    : conversation.artist.displayName;
  const recipientName = isBuyer
    ? conversation.artist.displayName
    : `${conversation.buyer.firstName} ${conversation.buyer.lastName}`.trim();
  const call: CallSession = {
    id: randomUUID(), requestId: input.requestId, conversationId: conversation.id,
    callerId: userId, recipientId, callerName, recipientName,
    mediaMode: input.mediaMode, state: 'ringing', createdAt: now,
  };
  calls.set(call.id, call);
  activeByUser.set(userId, call.id);
  activeByUser.set(recipientId, call.id);
  requestCalls.set(requestKey, call.id);
  call.ringTimer = setTimeout(() => {
    if (call.state === 'ringing') finishCall(io, call, 'missed');
  }, CALL_RING_MS);
  call.ringTimer.unref?.();

  send(io, recipientId, 'call:incoming', {
    callId: call.id, conversationId: call.conversationId,
    callerName, mediaMode: call.mediaMode, direction: 'incoming', createdAt: new Date(now).toISOString(),
  });
  ack?.({ ok: true, call: publicCall(call) });
}

function publicCall(call: CallSession) {
  return {
    callId: call.id, conversationId: call.conversationId,
    mediaMode: call.mediaMode, state: call.state,
    participantName: call.recipientName, direction: 'outgoing',
    createdAt: new Date(call.createdAt).toISOString(),
  };
}

export function registerCallSignaling(io: Server, socket: Socket, userId: string, userStatus: string) {
  socket.on('call:initiate', (payload: unknown, ack?: Ack) => {
    void initiate(io, userId, userStatus, payload, ack).catch(() => ackError(ack, 'CALL_FAILED', 'The call could not be started.'));
  });

  socket.on('call:ice-config', async (payload: { callId?: unknown }, ack?: Ack) => {
    const call = getCallForActor(payload?.callId, userId, ack);
    if (!call) return;
    if (!await recheckConversationAccess(io, call, userId, ack)) return;
    if (isTerminal(call.state)) return ackError(ack, 'CALL_ENDED', 'This call has ended.');
    ack?.({ ok: true, ...ephemeralIceServers(userId) });
  });

  socket.on('call:accept', async (payload: { callId?: unknown }, ack?: Ack) => {
    const call = getCallForActor(payload?.callId, userId, ack);
    if (!call) return;
    if (!await recheckConversationAccess(io, call, userId, ack)) return;
    if (call.recipientId !== userId) return ackError(ack, 'CALL_FORBIDDEN', 'Only the invited participant can accept this call.');
    if (call.state === 'connecting' || call.state === 'connected' || call.state === 'reconnecting') return ack?.({ ok: true, state: call.state });
    if (call.state !== 'ringing') return ackError(ack, 'INVALID_CALL_STATE', `This call is ${call.state}.`);
    if (call.ringTimer) clearTimeout(call.ringTimer);
    call.ringTimer = undefined;
    call.state = 'connecting';
    call.setupTimer = setTimeout(() => {
      if (call.state === 'connecting') finishCall(io, call, 'failed');
    }, CALL_SETUP_MS);
    call.setupTimer.unref?.();
    send(io, call.callerId, 'call:accepted', { callId: call.id, conversationId: call.conversationId, mediaMode: call.mediaMode });
    ack?.({ ok: true, state: call.state, callId: call.id });
  });

  socket.on('call:decline', async (payload: { callId?: unknown }, ack?: Ack) => {
    const call = getCallForActor(payload?.callId, userId, ack);
    if (!call) return;
    if (!await recheckConversationAccess(io, call, userId, ack)) return;
    if (call.recipientId !== userId) return ackError(ack, 'CALL_FORBIDDEN', 'Only the invited participant can decline this call.');
    if (call.state === 'declined') return ack?.({ ok: true, state: 'declined' });
    if (call.state !== 'ringing') return ackError(ack, 'INVALID_CALL_STATE', `This call is ${call.state}.`);
    finishCall(io, call, 'declined', userId);
    ack?.({ ok: true, state: 'declined' });
  });

  socket.on('call:cancel', async (payload: { callId?: unknown }, ack?: Ack) => {
    const call = getCallForActor(payload?.callId, userId, ack);
    if (!call) return;
    if (!await recheckConversationAccess(io, call, userId, ack)) return;
    if (call.callerId !== userId) return ackError(ack, 'CALL_FORBIDDEN', 'Only the caller can cancel a ringing call.');
    if (call.state === 'cancelled') return ack?.({ ok: true, state: 'cancelled' });
    if (call.state !== 'ringing') return ackError(ack, 'INVALID_CALL_STATE', `This call is ${call.state}.`);
    finishCall(io, call, 'cancelled', userId);
    ack?.({ ok: true, state: 'cancelled' });
  });

  socket.on('call:end', async (payload: { callId?: unknown }, ack?: Ack) => {
    const call = getCallForActor(payload?.callId, userId, ack);
    if (!call) return;
    if (!await recheckConversationAccess(io, call, userId, ack)) return;
    if (isTerminal(call.state)) return ack?.({ ok: true, state: call.state });
    finishCall(io, call, 'ended', userId);
    ack?.({ ok: true, state: 'ended' });
  });

  socket.on('call:signal', async (payload: { callId?: unknown; kind?: unknown; data?: unknown }) => {
    const call = getCallForActor(payload?.callId, userId);
    if (!call || !['connecting', 'connected', 'reconnecting'].includes(call.state)) return;
    if (!await recheckConversationAccess(io, call, userId)) return;
    const kind = payload?.kind;
    if (kind !== 'offer' && kind !== 'answer' && kind !== 'ice-candidate') return;
    if ((kind === 'offer' && call.callerId !== userId) || (kind === 'answer' && call.recipientId !== userId)) return;
    if (!signalPayloadIsValid(kind, payload.data)) return;
    const recipientId = call.callerId === userId ? call.recipientId : call.callerId;
    send(io, recipientId, 'call:signal', { callId: call.id, kind, data: payload.data });
  });

  socket.on('call:network-state', async (payload: { callId?: unknown; state?: unknown }) => {
    const call = getCallForActor(payload?.callId, userId);
    if (!call || isTerminal(call.state)) return;
    if (!await recheckConversationAccess(io, call, userId)) return;
    const peerId = call.callerId === userId ? call.recipientId : call.callerId;
    if (payload.state === 'connected') {
      if (!['connecting', 'connected', 'reconnecting'].includes(call.state)) return;
      if (call.reconnectTimer) clearTimeout(call.reconnectTimer);
      call.reconnectTimer = undefined;
      if (call.setupTimer) clearTimeout(call.setupTimer);
      call.setupTimer = undefined;
      call.state = 'connected';
      call.connectedAt ??= Date.now();
      send(io, peerId, 'call:network-state', { callId: call.id, state: 'connected' });
    } else if (payload.state === 'reconnecting' && ['connecting', 'connected', 'reconnecting'].includes(call.state)) {
      call.state = 'reconnecting';
      send(io, peerId, 'call:network-state', { callId: call.id, state: 'reconnecting' });
      if (!call.reconnectTimer) {
        call.reconnectTimer = setTimeout(() => {
          if (call.state === 'reconnecting') finishCall(io, call, 'failed');
        }, CALL_RECONNECT_MS);
        call.reconnectTimer.unref?.();
      }
    }
  });

  socket.on('call:resume', async (payload: { callId?: unknown }, ack?: Ack) => {
    const call = getCallForActor(payload?.callId, userId, ack);
    if (!call) return;
    if (!await recheckConversationAccess(io, call, userId, ack)) return;
    if (isTerminal(call.state)) return ack?.({ ok: false, code: 'CALL_ENDED', state: call.state });
    if (call.state === 'ringing') return ackError(ack, 'INVALID_CALL_STATE', 'A ringing call must be accepted before it can resume.');
    if (call.reconnectTimer) clearTimeout(call.reconnectTimer);
    call.reconnectTimer = undefined;
    call.state = 'connecting';
    const peerId = call.callerId === userId ? call.recipientId : call.callerId;
    send(io, peerId, 'call:reconnected', { callId: call.id, conversationId: call.conversationId });
    ack?.({ ok: true, state: call.state });
  });

  socket.on('disconnect', () => {
    setTimeout(() => { void handleParticipantDisconnect(io, userId); }, 150).unref?.();
  });
}

async function handleParticipantDisconnect(io: Server, userId: string) {
  try {
    const stillConnected = await io.in(`user:${userId}`).fetchSockets();
    if (stillConnected.length) return;
  } catch {
    // Continue to the bounded reconnect state when the adapter cannot query presence.
  }
  const call = activeCallForUser(userId);
  if (!call) return;
  const peerId = call.callerId === userId ? call.recipientId : call.callerId;
  if (call.state === 'ringing' && call.callerId === userId) {
    finishCall(io, call, 'cancelled', userId);
    return;
  }
  if (call.state === 'ringing') return;
  call.state = 'reconnecting';
  send(io, peerId, 'call:network-state', { callId: call.id, state: 'reconnecting' });
  if (!call.reconnectTimer) {
    call.reconnectTimer = setTimeout(() => {
      if (call.state === 'reconnecting') finishCall(io, call, 'failed');
    }, CALL_RECONNECT_MS);
    call.reconnectTimer.unref?.();
  }
}

export function clearCallSignalingForTests() {
  for (const call of calls.values()) clearCallTimers(call);
  calls.clear();
  activeByUser.clear();
  requestCalls.clear();
  initiationTimes.clear();
  initiatingUsers.clear();
}

export function callStateForTests(callId: string) {
  const call = calls.get(callId);
  return call ? { ...call, ringTimer: undefined, reconnectTimer: undefined, tombstoneTimer: undefined } : null;
}
