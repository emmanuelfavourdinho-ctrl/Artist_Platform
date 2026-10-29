'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { marketplaceFetch } from '../../lib/marketplaceApi';
import { getCommissionStatusMeta } from '../../lib/commissionStatus';
import { ConversationCallManager } from '../../components/messages/ConversationCallManager';
import { acknowledgeQueuedMessage, listQueuedMessages, saveQueuedMessage, type QueuedTextMessage } from '../../lib/offlineMessageQueue';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const MAX_ATTACHMENT_BYTES = 20_000_000;
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/opus'];
const MAX_VOICE_NOTE_SECONDS = 120;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const EMOJI = [
  { emoji: '😊', name: 'smile' }, { emoji: '❤️', name: 'heart' }, { emoji: '✨', name: 'sparkles' },
  { emoji: '👏', name: 'clap' }, { emoji: '🙏', name: 'thanks' }, { emoji: '🎨', name: 'art' },
  { emoji: '👍', name: 'thumbs up' }, { emoji: '🌟', name: 'star' }, { emoji: '🙂', name: 'slight smile' },
  { emoji: '💛', name: 'yellow heart' }, { emoji: '🎉', name: 'celebration' }, { emoji: '🤝', name: 'deal' },
];

interface Participant { name: string; imageUrl: string | null; role: 'ARTIST' | 'BUYER' }
interface Conversation {
  id: string;
  participant: Participant;
  buyer: { firstName: string; lastName: string };
  artist: { id: string; displayName: string; slug: string; profileImageUrl: string | null };
  commissionRequest: { id: string; title: string; status: string } | null;
  artwork: { id: string; title: string; slug: string } | null;
  order: { id: string; orderNumber: string; status: string } | null;
  messages: Message[];
  unreadCount?: number;
}
interface UploadAsset {
  publicId: string; secureUrl: string; resourceType: 'image' | 'video'; format: string;
  mimeType: string; bytes: number; version: number; signature: string; name: string;
}
type MessageStatus = 'sending' | 'waiting' | 'sent' | 'delivered' | 'failed';
interface Message {
  id: string; body: string; sender: { id: string; firstName: string; lastName: string } | null;
  createdAt: string; readAt?: string | null; editedAt?: string | null; deletedAt?: string | null;
  pinnedAt?: string | null; pinnedById?: string | null; hasAttachment?: boolean; attachmentType?: string | null;
  attachmentName?: string | null; attachmentSize?: number | null; status?: MessageStatus;
  offlineQueued?: boolean;
  retryPayload?: { body: string; attachment?: UploadAsset };
}

function ConversationContext({ conversation }: { conversation: Conversation }) {
  if (conversation.commissionRequest) {
    const { label, tone } = getCommissionStatusMeta(conversation.commissionRequest.status);
    return <div className="border-b border-border/10 bg-surface px-4 py-3 sm:px-5"><p className="text-[10px] uppercase tracking-[.16em] text-muted">Commission request</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-sm">{conversation.commissionRequest.title}</p><StatusBadge tone={tone} label={label} /></div></div>;
  }
  if (conversation.artwork) return <div className="border-b border-border/10 bg-surface px-4 py-3 sm:px-5"><p className="text-[10px] uppercase tracking-[.16em] text-muted">About this artwork</p><p className="mt-1 text-sm">{conversation.artwork.title}</p></div>;
  if (conversation.order) return <div className="border-b border-border/10 bg-surface px-4 py-3 sm:px-5"><p className="text-[10px] uppercase tracking-[.16em] text-muted">Order discussion</p><p className="mt-1 text-sm">Order #{conversation.order.orderNumber}</p></div>;
  return <div className="border-b border-border/10 bg-surface px-4 py-3 sm:px-5"><p className="text-xs text-muted">General marketplace conversation</p></div>;
}

function formatPreview(message?: Message) {
  if (!message) return 'No messages yet';
  if (message.deletedAt) return 'This message was deleted';
  return message.hasAttachment ? `Attachment · ${message.attachmentName ?? 'File'}` : message.body || 'Attachment';
}

function Avatar({ name, imageUrl, size = 'md' }: { name: string; imageUrl?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-10 w-10 text-xs' : 'h-11 w-11 text-sm';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FA';
  return <div role="img" aria-label={name} className={`${sizeClass} grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-surface-raised to-accent/50 font-semibold text-white ring-1 ring-white/10`} style={imageUrl ? { backgroundImage: `url("${imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>{imageUrl ? <span className="sr-only">{initials}</span> : initials}</div>;
}

function MessagesContent() {
  const { firebaseUser, appUser } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationIdParam = searchParams.get('conversationId');
  const artistIdParam = searchParams.get('artistId');
  const artistSlugParam = searchParams.get('artistSlug');
  const artworkIdParam = searchParams.get('artworkId');
  const startAttempt = useRef('');
  const openedDeepLink = useRef('');
  const conversationRequestRef = useRef(0);
  const flushQueueRef = useRef<() => Promise<void>>(async () => {});
  const queueFlushBusyRef = useRef(false);
  const selectedRef = useRef<Conversation | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [messagingSocket, setMessagingSocket] = useState<Socket | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [attachment, setAttachment] = useState<UploadAsset | null>(null);
  const [voiceNote, setVoiceNote] = useState<{ file: File; previewUrl: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  const [loadingVoiceIds, setLoadingVoiceIds] = useState<string[]>([]);
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Harassment or abusive messages');
  const [reportDescription, setReportDescription] = useState('');
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread'>('all');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [messageActionBusy, setMessageActionBusy] = useState(false);
  const [messageActionStatus, setMessageActionStatus] = useState('');
  const [messageActionError, setMessageActionError] = useState('');
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingLimitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (recordingLimitRef.current) clearTimeout(recordingLimitRef.current);
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const loadConversations = useCallback(async () => {
    if (!firebaseUser) return;
    const requestId = ++conversationRequestRef.current;
    setLoadingList(true);
    try {
      const response = await marketplaceFetch(firebaseUser, '/messages');
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'Unable to load your conversations.');
      if (requestId !== conversationRequestRef.current) return;
      setConversations(result.data ?? []);
      setError(null);
    } catch (err) {
      if (requestId === conversationRequestRef.current) setError(err instanceof Error ? err.message : 'Unable to load your conversations.');
    } finally {
      if (requestId === conversationRequestRef.current) setLoadingList(false);
    }
  }, [firebaseUser]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    const reconnect = () => {
      update();
      void flushQueueRef.current();
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', update);
    if (navigator.onLine) void flushQueueRef.current();
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    let live = true;
    let socket: Socket | null = null;
    void firebaseUser.getIdToken().then((token) => {
      if (!live) return;
      socket = io(API_URL, { auth: (callback) => callback({ token }), reconnection: true, reconnectionAttempts: Infinity });
      socketRef.current = socket;
      setMessagingSocket(socket);
      socket.on('connect', () => {
        setRealtimeConnected(true);
        const current = selectedRef.current;
        if (current) socket?.emit('conversation:join', { conversationId: current.id });
        void loadConversations();
      });
      socket.on('disconnect', () => setRealtimeConnected(false));
      socket.on('connect_error', () => setRealtimeConnected(false));
      socket.on('message:new', (incoming: Message & { conversationId?: string }) => {
        const current = selectedRef.current;
        if (!current || incoming.conversationId !== current.id) { void loadConversations(); return; }
        if (incoming.sender?.id === appUser?.id && firebaseUser) {
          void acknowledgeQueuedMessage(incoming.id).catch(() => {});
        }
        setMessages((existing) => {
          const found = existing.some((message) => message.id === incoming.id);
          return found
            ? existing.map((message) => message.id === incoming.id ? incoming : message)
            : [...existing, incoming];
        });
        if (incoming.sender?.id !== appUser?.id) socket?.emit('message:received', { conversationId: current.id, messageId: incoming.id });
        void loadConversations();
      });
      socket.on('message:update', (updated: Message & { conversationId?: string }) => {
        if (selectedRef.current?.id === updated.conversationId) setMessages((all) => all.map((message) => message.id === updated.id ? updated : message));
        void loadConversations();
      });
      socket.on('message:delivered', ({ messageId }: { messageId: string }) => setMessages((all) => all.map((message) => message.id === messageId && !message.readAt ? { ...message, status: 'delivered' } : message)));
      socket.on('message:inbox-update', () => { void loadConversations(); });
      socket.on('message:read', ({ userId }: { userId: string }) => {
        if (userId !== appUser?.id) setMessages((all) => all.map((message) => message.sender?.id === appUser?.id ? { ...message, readAt: new Date().toISOString(), status: 'sent' } : message));
      });
    }).catch(() => setRealtimeConnected(false));
    return () => { live = false; socket?.disconnect(); socketRef.current = null; setMessagingSocket(null); setRealtimeConnected(false); };
  }, [firebaseUser, appUser?.id, loadConversations]);

  const openConversation = useCallback(async (conversation: Conversation) => {
    if (!firebaseUser) return;
    if (mediaRecorderRef.current) cancelVoiceRecording();
    setError(null);
    if (voiceNote) { URL.revokeObjectURL(voiceNote.previewUrl); objectUrlsRef.current.delete(voiceNote.previewUrl); }
    Object.values(voiceUrls).forEach((url) => { URL.revokeObjectURL(url); objectUrlsRef.current.delete(url); });
    setVoiceUrls({});
    setVoiceNote(null); setAttachment(null); setRecordingSeconds(0); setUploadError(null);
    setEditingMessageId(null); setEditDraft(''); setDeleteMessageId(null); setMessageActionError(''); setMessageActionStatus('');
    setSelected(conversation);
    selectedRef.current = conversation;
    setMessages([]);
    setLoadingThread(true);
    socketRef.current?.emit('conversation:join', { conversationId: conversation.id });
    try {
      const response = await marketplaceFetch(firebaseUser, `/messages/${conversation.id}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'This conversation could not be opened.');
      setSelected(result.data);
      selectedRef.current = result.data;
      setMessages(result.data.messages ?? []);
      setConversations((all) => all.map((item) => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This conversation could not be opened.');
    } finally { setLoadingThread(false); }
  }, [cancelVoiceRecording, firebaseUser, loadConversations, voiceNote, voiceUrls]);

  useEffect(() => {
    if (!selected) return;
    socketRef.current?.emit('conversation:join', { conversationId: selected.id });
    return () => { socketRef.current?.emit('conversation:leave', selected.id); };
  }, [selected?.id]);

  useEffect(() => {
    if (!firebaseUser || !selected || !appUser || loadingThread) return;
    let current = true;
    const conversationId = selected.id;
    void listQueuedMessages(firebaseUser.uid).then(async (queued) => {
      if (!current || selectedRef.current?.id !== conversationId) return;
      const forConversation = queued.filter((item) => item.conversationId === conversationId);
      const recovered = forConversation.map((item): Message => ({
        id: item.id,
        body: item.body,
        sender: { id: appUser.id, firstName: appUser.firstName, lastName: appUser.lastName },
        createdAt: item.createdAt,
        status: item.state === 'sending' ? 'waiting' : item.state,
        offlineQueued: true,
        retryPayload: { body: item.body },
      }));
      setMessages((messages) => {
        const knownIds = new Set(messages.map((message) => message.id));
        return [...messages, ...recovered.filter((message) => !knownIds.has(message.id))];
      });
      for (const item of forConversation.filter((message) => message.state === 'sending')) {
        await saveQueuedMessage({ ...item, state: 'waiting', retryOnReconnect: true });
      }
    }).catch(() => {
      // IndexedDB is optional; an unsupported browser still keeps normal messaging available.
    });
    return () => { current = false; };
  }, [firebaseUser?.uid, selected?.id, appUser?.id, loadingThread]);

  useEffect(() => {
    if (!firebaseUser || !conversationIdParam) return;
    if (openedDeepLink.current === conversationIdParam) return;
    const match = conversations.find((item) => item.id === conversationIdParam);
    if (match) { openedDeepLink.current = conversationIdParam; void openConversation(match); return; }
    if (loadingList) return;
    openedDeepLink.current = conversationIdParam;
    void marketplaceFetch(firebaseUser, `/messages/${conversationIdParam}`).then(async (response) => {
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'That conversation could not be found.');
      const conversation = result.data as Conversation;
      setSelected(conversation); selectedRef.current = conversation; setMessages(conversation.messages ?? []);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'That conversation could not be found.'));
  }, [firebaseUser, conversationIdParam, conversations, loadingList, openConversation]);

  useEffect(() => {
    if (!firebaseUser || !artistIdParam || conversationIdParam) return;
    const attemptKey = `${artistIdParam}:${artworkIdParam ?? ''}`;
    if (startAttempt.current === attemptKey) return;
    startAttempt.current = attemptKey;
    void marketplaceFetch(firebaseUser, '/messages', {
      method: 'POST', body: JSON.stringify({ artistId: artistIdParam, ...(artworkIdParam ? { artworkId: artworkIdParam } : {}) }),
    }).then(async (response) => {
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? (response.status === 403 ? 'Your account cannot start a conversation. Contact support if you need help.' : 'The conversation could not be started.'));
      const createdConversation = { ...result.data, messages: result.data.messages ?? [], unreadCount: 0 } as Conversation;
      setConversations((all) => [createdConversation, ...all.filter((item) => item.id !== createdConversation.id)]);
      await loadConversations();
      router.replace(`/messages?conversationId=${encodeURIComponent(result.data.id)}` as Route);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'We could not reach the messaging service.'));
  }, [firebaseUser, artistIdParam, artistSlugParam, artworkIdParam, conversationIdParam, router, loadConversations]);

  function stopVoiceRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (recordingLimitRef.current) clearTimeout(recordingLimitRef.current);
    recordingTimerRef.current = null; recordingLimitRef.current = null;
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    setRecording(false);
  }

  function cancelVoiceRecording() {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (recordingLimitRef.current) clearTimeout(recordingLimitRef.current);
    recordingTimerRef.current = null; recordingLimitRef.current = null;
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      mediaRecorderRef.current = null;
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    recordingChunksRef.current = [];
    setRecording(false); setRecordingSeconds(0);
  }

  async function startVoiceRecording() {
    if (!selected) return;
    setUploadError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setUploadError('Voice recording is not supported by this browser.');
      return;
    }
    try {
      if (voiceNote) { URL.revokeObjectURL(voiceNote.previewUrl); objectUrlsRef.current.delete(voiceNote.previewUrl); }
      setVoiceNote(null); setAttachment(null); setRecordingSeconds(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => { cancelVoiceRecording(); setUploadError('Recording stopped unexpectedly. Please try again.'); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null; mediaRecorderRef.current = null;
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordingChunksRef.current = [];
        if (blob.size === 0) { setUploadError('No audio was recorded. Check your microphone and try again.'); return; }
        if (blob.size > MAX_ATTACHMENT_BYTES) { setUploadError('This voice note is too large to send. Please record a shorter note.'); return; }
        const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: blob.type.split(';')[0] || 'audio/webm' });
        const previewUrl = URL.createObjectURL(blob);
        objectUrlsRef.current.add(previewUrl);
        setVoiceNote({ file, previewUrl });
      };
      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
      recordingLimitRef.current = setTimeout(() => {
        stopVoiceRecording();
        setUploadError('Voice notes are limited to two minutes. Review the recording and send it when ready.');
      }, MAX_VOICE_NOTE_SECONDS * 1000);
    } catch (err) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null; mediaRecorderRef.current = null;
      const name = err instanceof DOMException ? err.name : '';
      setUploadError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Allow microphone access in your browser settings, then try recording again.'
        : name === 'NotFoundError'
          ? 'No microphone was found for this recording.'
          : 'The microphone could not be started. Check your device settings and try again.');
    }
  }

  function updateConversationPreview(conversationId: string, latestMessage: Message) {
    setConversations((all) => {
      const current = all.find((item) => item.id === conversationId) ?? selectedRef.current;
      if (!current) return all;
      return [
        { ...current, messages: [latestMessage], unreadCount: 0 },
        ...all.filter((item) => item.id !== conversationId),
      ];
    });
  }

  async function sendMessage(payload: { body: string; attachment?: UploadAsset }, retryId?: string, targetConversationId?: string): Promise<boolean> {
    const conversationId = targetConversationId ?? selected?.id;
    if (!firebaseUser || !conversationId) return false;
    if (!navigator.onLine && payload.attachment) {
      setUploadError('Files and voice messages cannot be queued offline. Reconnect to send this attachment.');
      return false;
    }
    const id = retryId ?? crypto.randomUUID();
    const optimistic: Message = {
      id, body: payload.body, sender: { id: appUser?.id ?? '', firstName: appUser?.firstName ?? '', lastName: appUser?.lastName ?? '' },
      createdAt: new Date().toISOString(), hasAttachment: Boolean(payload.attachment), attachmentName: payload.attachment?.name,
      attachmentType: payload.attachment?.mimeType, attachmentSize: payload.attachment?.bytes, status: 'sending', retryPayload: payload,
    };
    const isCurrentConversation = selectedRef.current?.id === conversationId;
    if (isCurrentConversation) {
      setMessages((all) => all.some((message) => message.id === id) ? all.map((message) => message.id === id ? { ...message, status: 'sending' } : message) : [...all, optimistic]);
    }

    if (!navigator.onLine) {
      const queued: QueuedTextMessage = {
        id, accountId: firebaseUser.uid, conversationId, body: payload.body,
        createdAt: optimistic.createdAt, state: 'waiting', retryOnReconnect: true, failureReason: null,
      };
      try {
        await saveQueuedMessage(queued);
        if (isCurrentConversation) setMessages((all) => all.map((message) => message.id === id ? { ...message, status: 'waiting', offlineQueued: true } : message));
        updateConversationPreview(conversationId, { ...optimistic, status: 'waiting', offlineQueued: true });
        if (body === payload.body) setBody('');
        setError(null);
        return true;
      } catch (err) {
        if (isCurrentConversation) setMessages((all) => all.map((message) => message.id === id ? { ...message, status: 'failed' } : message));
        setError(err instanceof Error ? err.message : 'This message could not be saved for offline delivery. Keep the draft and retry when connected.');
        return false;
      }
    }

    try {
      const response = await marketplaceFetch(firebaseUser, `/messages/${conversationId}/messages`, {
        method: 'POST', body: JSON.stringify({ id, body: payload.body, ...(payload.attachment ? { attachment: payload.attachment } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'Message could not be sent.');
      await acknowledgeQueuedMessage(id).catch(() => {});
      if (selectedRef.current?.id === conversationId) {
        setMessages((all) => all.map((message) => message.id === id
          ? { ...result.data, status: message.status === 'delivered' || message.readAt ? message.status : 'sent', offlineQueued: false }
          : message));
        if (body === payload.body) setBody('');
        setAttachment(null);
      }
      updateConversationPreview(conversationId, result.data);
      setError(null);
      void loadConversations();
      return true;
    } catch (err) {
      const state: MessageStatus = navigator.onLine ? 'failed' : 'waiting';
      const reason = err instanceof Error ? err.message : 'Message could not be sent.';
      if (isCurrentConversation) setMessages((all) => all.map((message) => message.id === id ? { ...message, status: state, retryPayload: payload } : message));
      if (!payload.attachment) {
        const queued: QueuedTextMessage = {
          id, accountId: firebaseUser.uid, conversationId, body: payload.body,
          createdAt: optimistic.createdAt, state: state === 'waiting' ? 'waiting' : 'failed',
          retryOnReconnect: state === 'waiting', failureReason: reason,
        };
        try {
          await saveQueuedMessage(queued);
          if (isCurrentConversation) setMessages((all) => all.map((message) => message.id === id ? { ...message, offlineQueued: true } : message));
          updateConversationPreview(conversationId, { ...optimistic, status: state, offlineQueued: true });
          if (body === payload.body) setBody('');
        } catch {
          setError(`${reason} The message could not be saved for later retry; keep a copy before leaving this conversation.`);
          return false;
        }
        if (!navigator.onLine) return true;
      }
      setError(reason);
      return false;
    }
  }

  async function flushPendingMessages() {
    if (!firebaseUser || !navigator.onLine || queueFlushBusyRef.current) return;
    queueFlushBusyRef.current = true;
    try {
      const queued = await listQueuedMessages(firebaseUser.uid);
      for (const item of queued) {
        if (!navigator.onLine) break;
        if (!item.retryOnReconnect || item.state === 'sending') continue;
        await saveQueuedMessage({ ...item, state: 'sending' });
        if (selectedRef.current?.id === item.conversationId) {
          setMessages((all) => all.map((message) => message.id === item.id ? { ...message, status: 'sending' } : message));
        }
        await sendMessage({ body: item.body }, item.id, item.conversationId);
      }
    } catch {
      // The queued item remains in IndexedDB and can be retried on the next reconnect.
    } finally {
      queueFlushBusyRef.current = false;
    }
  }

  flushQueueRef.current = flushPendingMessages;

  async function removeQueuedTextMessage(messageId: string) {
    if (!firebaseUser) return;
    try {
      await acknowledgeQueuedMessage(messageId);
      setMessages((all) => all.filter((message) => message.id !== messageId));
      setMessageActionStatus('Queued message removed from this device.');
    } catch {
      setError('This queued message could not be removed from device storage.');
    }
  }

  async function runMessageAction(messageId: string, method: 'PATCH' | 'DELETE', suffix = '', bodyData?: unknown) {
    if (!firebaseUser || !selected || messageActionBusy) return false;
    setMessageActionBusy(true); setMessageActionError(''); setMessageActionStatus('');
    try {
      const response = await marketplaceFetch(firebaseUser, `/messages/${selected.id}/messages/${messageId}${suffix}`, {
        method, ...(bodyData ? { body: JSON.stringify(bodyData) } : {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'This message could not be updated.');
      setMessages((all) => all.map((message) => message.id === messageId ? result.data : message));
      void loadConversations();
      return true;
    } catch (err) {
      setMessageActionError(err instanceof Error ? err.message : 'This message could not be updated.');
      return false;
    } finally { setMessageActionBusy(false); }
  }

  async function saveMessageEdit(messageId: string) {
    const saved = await runMessageAction(messageId, 'PATCH', '', { body: editDraft });
    if (saved) { setEditingMessageId(null); setEditDraft(''); setMessageActionStatus('Message edited.'); }
  }

  async function deleteTextMessage(messageId: string) {
    if (await runMessageAction(messageId, 'DELETE')) {
      setDeleteMessageId(null); setMessageActionStatus('Message deleted for everyone.');
    }
  }

  async function toggleMessagePin(message: Message) {
    const pinned = await runMessageAction(message.id, 'PATCH', '/pin', { pinned: !message.pinnedAt });
    if (pinned) setMessageActionStatus(message.pinnedAt ? 'Message unpinned.' : 'Message pinned for this conversation.');
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.body);
      setMessageActionError(''); setMessageActionStatus('Message copied.');
    } catch { setMessageActionError('Clipboard access is unavailable in this browser.'); }
  }

  async function uploadFile(file: File): Promise<UploadAsset | null> {
    if (!firebaseUser || !selected) return null;
    setUploadError(null); setRetryFile(null);
    if (!navigator.onLine) { setUploadError('File and voice uploads need a connection. This upload has not been queued.'); setRetryFile(file); return null; }
    if (!ACCEPTED_MIME.includes(file.type)) { setUploadError('Choose an image, audio file, or PDF.'); return null; }
    if (file.size > MAX_ATTACHMENT_BYTES) { setUploadError('Attachments must be 20 MB or smaller.'); return null; }
    setUploadProgress(0);
    try {
      const signed = await marketplaceFetch(firebaseUser, `/messages/${selected.id}/uploads/signature`, { method: 'POST' });
      const signatureResult = await signed.json();
      if (!signed.ok) throw new Error(signatureResult?.message ?? 'Could not prepare the secure upload.');
      const data = signatureResult.data;
      const resourceType = file.type.startsWith('audio/') ? 'video' : 'image';
      const asset = await new Promise<UploadAsset>((resolve, reject) => {
        const form = new FormData();
        form.append('file', file); form.append('api_key', data.apiKey); form.append('timestamp', String(data.timestamp));
        form.append('signature', data.signature); form.append('folder', data.folder); form.append('type', data.type); form.append('allowed_formats', data.allowedFormats);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${data.cloudName}/${resourceType}/upload`);
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) { reject(new Error('Secure storage could not upload that file.')); return; }
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.resource_type !== resourceType) { reject(new Error('Secure storage returned an invalid media type.')); return; }
            resolve({ publicId: result.public_id, secureUrl: result.secure_url, resourceType: result.resource_type, format: result.format, mimeType: file.type, bytes: result.bytes, version: result.version, signature: result.signature, name: file.name });
          } catch { reject(new Error('Secure storage returned an invalid upload response.')); }
        };
        xhr.onerror = () => reject(new Error('The upload failed. Check your connection and retry.'));
        xhr.send(form);
      });
      setAttachment(asset);
      return asset;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.'); setRetryFile(file);
      return null;
    } finally { setUploadProgress(null); }
  }

  async function loadVoiceMessage(message: Message) {
    if (!firebaseUser || !selected || voiceUrls[message.id] || loadingVoiceIds.includes(message.id)) return;
    setLoadingVoiceIds((ids) => [...ids, message.id]);
    try {
      const response = await marketplaceFetch(firebaseUser, `/messages/${selected.id}/attachments/${message.id}`);
      if (!response.ok) throw new Error('This voice message is unavailable.');
      const url = URL.createObjectURL(await response.blob());
      objectUrlsRef.current.add(url);
      setVoiceUrls((urls) => ({ ...urls, [message.id]: url }));
    } catch (err) { setError(err instanceof Error ? err.message : 'This voice message is unavailable.'); }
    finally { setLoadingVoiceIds((ids) => ids.filter((id) => id !== message.id)); }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (recording) { setUploadError('Stop the recording before sending your message.'); return; }
    if (voiceNote) {
      const voiceAsset = attachment ?? await uploadFile(voiceNote.file);
      if (!voiceAsset) return;
      if (await sendMessage({ body: body.trim(), attachment: voiceAsset })) {
        URL.revokeObjectURL(voiceNote.previewUrl);
        setVoiceNote(null);
      }
      return;
    }
    if (body.trim() || attachment) await sendMessage({ body: body.trim(), ...(attachment ? { attachment } : {}) });
  }

  async function fetchAttachment(message: Message, mode: 'preview' | 'download') {
    if (!firebaseUser || !selected) return;
    try {
      const response = await marketplaceFetch(firebaseUser, `/messages/${selected.id}/attachments/${message.id}`);
      if (!response.ok) throw new Error('This attachment is unavailable.');
      const url = URL.createObjectURL(await response.blob());
      if (mode === 'preview') setAttachmentPreview({ url, type: message.attachmentType ?? '', name: message.attachmentName ?? 'Attachment' });
      else {
        const link = document.createElement('a'); link.href = url; link.download = message.attachmentName ?? 'attachment'; link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'This attachment is unavailable.'); }
  }

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!firebaseUser || !selected || reportBusy) return;
    setReportBusy(true); setReportStatus(null);
    try {
      const response = await marketplaceFetch(firebaseUser, `/messages/${selected.id}/report`, {
        method: 'POST', body: JSON.stringify({ reason: reportReason, ...(reportDescription.trim() ? { description: reportDescription.trim() } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message ?? 'The report could not be submitted.');
      setReportStatus('Report submitted to the Fine Arts safety team. No automatic account action was taken.');
      setReportOpen(false); setReportDescription('');
    } catch (err) { setReportStatus(err instanceof Error ? err.message : 'The report could not be submitted.'); }
    finally { setReportBusy(false); }
  }

  const filteredEmoji = EMOJI.filter((item) => item.name.includes(emojiSearch.trim().toLowerCase()));
  const active = selected;
  const pinnedMessages = messages.filter((message) => message.pinnedAt && !message.deletedAt);
  const unreadTotal = conversations.reduce((total, conversation) => total + (conversation.unreadCount ?? 0), 0);
  const visibleConversations = conversations.filter((conversation) => {
    const matchesFilter = inboxFilter === 'all' || Boolean(conversation.unreadCount);
    const search = searchTerm.trim().toLowerCase();
    const context = conversation.commissionRequest?.title ?? conversation.artwork?.title ?? conversation.order?.orderNumber ?? '';
    return matchesFilter && (!search || `${conversation.participant.name} ${context}`.toLowerCase().includes(search));
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1600px] flex-col px-3 py-4 text-foreground sm:px-6 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
        <div><p className="text-[11px] font-medium tracking-wide text-muted">FINE ARTS</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Messages{unreadTotal > 0 && <span className="ml-2 align-middle text-sm font-medium text-accent">{unreadTotal} unread</span>}</h1></div>
        <div className="flex flex-wrap items-center justify-end gap-3"><p role="status" className={`text-xs ${online ? 'text-muted' : 'text-amber-300'}`}>{online ? realtimeConnected ? 'Connected' : 'Reconnecting…' : 'You’re offline'}</p></div>
      </header>
      {error && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-200"><span>{error}</span><button type="button" onClick={() => { setError(null); void loadConversations(); }} className="min-h-10 underline">Retry</button></div>}
      {!realtimeConnected && online && <p className="mb-3 rounded-xl border border-white/5 bg-surface-raised px-4 py-2 text-xs text-muted">Live updates are reconnecting. Messages remain available through the server.</p>}
      <div className="grid h-[calc(100dvh-8rem)] min-h-[26rem] flex-1 overflow-hidden rounded-2xl border border-border/10 bg-background shadow-[0_24px_80px_rgba(0,0,0,.34)] sm:h-[calc(100dvh-10rem)] sm:min-h-[34rem] sm:rounded-[24px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside aria-label="Conversations" className={`${active ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-white/[.07] bg-surface`}>
          <div className="border-b border-white/[.07] p-5 sm:p-6">
            <div className="flex items-center justify-between"><h2 className="text-xl font-semibold tracking-tight">Chats</h2><button type="button" onClick={() => { setInboxFilter('all'); setSearchTerm(''); }} aria-label="Reset conversation filters" className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-white/[.07] hover:text-white"><span aria-hidden="true" className="text-lg">☷</span></button></div>
            <label className="mt-4 flex h-11 items-center gap-2.5 rounded-xl bg-surface-raised px-3 text-muted focus-within:ring-2 focus-within:ring-accent"><span aria-hidden="true">⌕</span><span className="sr-only">Search conversations</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search Messenger" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-muted" /></label>
            <div className="mt-4 flex gap-2" role="group" aria-label="Filter conversations"><button type="button" aria-pressed={inboxFilter === 'all'} onClick={() => setInboxFilter('all')} className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${inboxFilter === 'all' ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-white/[.06]'}`}>All</button><button type="button" aria-pressed={inboxFilter === 'unread'} onClick={() => setInboxFilter('unread')} className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${inboxFilter === 'unread' ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-white/[.06]'}`}>Unread{unreadTotal > 0 && <span className="ml-1.5">{unreadTotal}</span>}</button></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingList ? <div role="status" aria-label="Loading conversations" className="space-y-2 p-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-2xl bg-white/[.04]" />)}</div>
              : conversations.length === 0 ? <div className="px-5 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[.05] text-xl text-muted">✉</div><p className="mt-4 font-medium">No conversations yet</p><p className="mt-2 text-sm leading-6 text-muted">When you message an artist or buyer, the conversation will show up here.</p></div>
                : visibleConversations.length === 0 ? <div className="px-5 py-12 text-center"><p className="font-medium">{inboxFilter === 'unread' && !searchTerm.trim() ? 'No unread chats' : 'No chats found'}</p><p className="mt-2 text-sm text-muted">{inboxFilter === 'unread' && !searchTerm.trim() ? 'You’re all caught up.' : 'Try another name or switch to All.'}</p></div>
                  : <ul className="space-y-1">{visibleConversations.map((conversation) => {
                    const last = conversation.messages[0]; const current = conversation.id === active?.id;
                    const context = conversation.commissionRequest?.title ?? conversation.artwork?.title ?? (conversation.order ? `Order #${conversation.order.orderNumber}` : 'General conversation');
                    return <li key={conversation.id}><button type="button" onClick={() => void openConversation(conversation)} aria-current={current ? 'true' : undefined} className={`flex min-h-[76px] w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${current ? 'bg-surface-raised' : 'hover:bg-white/[.045]'}`}>
                      <Avatar name={conversation.participant.name} imageUrl={conversation.participant.imageUrl} />
                      <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={`truncate text-sm ${conversation.unreadCount ? 'font-semibold text-white' : 'font-medium text-foreground'}`}>{conversation.participant.name}</span><span className="shrink-0 text-[10px] text-muted">{last ? dateFormat.format(new Date(last.createdAt)) : ''}</span></span><span className="mt-1 block truncate text-xs text-muted">{formatPreview(last)}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{context}</span></span>
                      {Boolean(conversation.unreadCount) && <span aria-label={`${conversation.unreadCount} unread messages`} className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-foreground">{conversation.unreadCount}</span>}
                    </button></li>;
                  })}</ul>}
          </div>
        </aside>

        <section aria-label={active ? `Conversation with ${active.participant.name}` : 'Conversation'} className={`${active ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col bg-background`}>
          <header className="relative z-10 flex min-h-[76px] items-center gap-2 border-b border-white/[.07] px-3 py-3 sm:gap-3 sm:px-6">
            {active ? <><button type="button" aria-label="Back to conversations" onClick={() => { setSelected(null); selectedRef.current = null; openedDeepLink.current = ''; router.replace('/messages' as Route); void loadConversations(); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl text-accent transition hover:bg-white/[.06] lg:hidden">‹</button><Avatar name={active.participant.name} imageUrl={active.participant.imageUrl} size="sm" /><div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{active.participant.name}</h2><p className="mt-0.5 text-xs text-muted">{active.participant.role === 'ARTIST' ? 'Artist' : 'Buyer'} · Fine Arts</p></div></> : <div className="min-w-0 flex-1"><h2 className="text-base font-semibold">Your messages</h2><p className="mt-0.5 text-xs text-muted">Select a conversation to start chatting</p></div>}
            {messagingSocket && <ConversationCallManager socket={messagingSocket} conversationId={active?.id ?? ''} participantName={active?.participant.name ?? 'Fine Arts member'} online={online} />}
            {active && <details className="relative shrink-0"><summary aria-label="Conversation options" className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full text-xl text-muted hover:bg-white/[.06]">⋯</summary><div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-white/10 bg-surface p-2 shadow-xl"><button type="button" onClick={() => { setReportOpen((open) => !open); setReportStatus(null); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[.06]">Report participant</button></div></details>}
          </header>
          {!active ? <div className="m-auto max-w-sm px-6 py-12 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-surface-raised text-2xl text-accent">✉</div><p className="mt-5 text-xl font-semibold tracking-tight">Your messages</p><p className="mt-2 text-sm leading-6 text-muted">Select a conversation to see your messages and reply.</p></div> : <>
            <ConversationContext conversation={active} />
            {reportStatus && <p role="status" className="mx-4 mt-3 rounded border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-foreground">{reportStatus}</p>}
            {messageActionError && <p role="alert" className="mx-4 mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">{messageActionError}</p>}
            {messageActionStatus && <p role="status" className="mx-4 mt-3 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-accent">{messageActionStatus}</p>}
            {reportOpen && <form onSubmit={(event) => void submitReport(event)} className="border-b border-border/10 bg-surface p-4"><div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-[1fr_2fr_auto]"><label className="text-xs text-muted">Reason<select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="mt-1 min-h-10 w-full rounded border border-border/15 bg-background px-2 text-sm text-foreground"><option>Harassment or abusive messages</option><option>Spam or scam</option><option>Impersonation</option><option>Other safety concern</option></select></label><label className="text-xs text-muted">Details (optional)<input value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} maxLength={2000} className="mt-1 min-h-10 w-full rounded border border-border/15 bg-background px-3 text-sm text-foreground" /></label><button disabled={reportBusy} className="mt-4 min-h-10 rounded bg-accent px-4 text-xs font-medium text-background disabled:opacity-50">{reportBusy ? 'Submitting…' : 'Submit report'}</button></div></form>}
            {pinnedMessages.length > 0 && <div className="flex flex-wrap gap-2 border-b border-white/[.06] bg-surface px-3 py-2 sm:px-5">{pinnedMessages.map((message) => <button key={message.id} type="button" onClick={() => messageRefs.current[message.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="flex min-h-9 max-w-full items-center gap-2 rounded-full bg-surface-raised px-3 text-left text-xs text-foreground/90 hover:bg-surface-raised"><span aria-hidden="true" className="shrink-0 text-accent">⌖</span><span className="shrink-0 font-medium text-accent">Pinned</span><span className="max-w-[min(55vw,420px)] truncate">{message.body}</span></button>)}</div>}
            <div role="log" aria-label="Message history" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">
              {loadingThread ? <p role="status" className="py-8 text-center text-sm text-muted">Loading conversation…</p> : messages.length === 0 ? <p className="py-12 text-center text-sm text-muted">No messages yet. Start with a friendly introduction.</p> : messages.map((message) => {
                const own = message.sender?.id === appUser?.id;
                const canUseMessageMenu = Boolean(message.body.trim()) && !message.hasAttachment && !message.deletedAt && (!own || !['sending', 'failed', 'waiting'].includes(message.status ?? ''));
                const state = message.readAt && own ? 'Read' : message.status === 'delivered' ? 'Delivered' : message.status === 'sending' ? 'Sending…' : message.status === 'waiting' ? 'Waiting for network' : message.status === 'failed' ? 'Failed to send' : own ? 'Sent' : '';
                const menu = canUseMessageMenu && <details className={`relative z-20 shrink-0 ${own ? 'order-2' : 'order-first'}`}><summary aria-label={`Options for message: ${message.body.slice(0, 48)}`} title="Message options" className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-lg text-muted opacity-100 transition hover:bg-white/[.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">⋯</summary><div className={`absolute top-10 z-30 w-48 rounded-xl border border-white/10 bg-surface-raised p-1.5 shadow-xl ${own ? 'right-0' : 'left-0'}`}>
                  <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void copyMessage(message); }} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/[.07]">Copy message</button>
                  {own && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setEditingMessageId(message.id); setEditDraft(message.body); setMessageActionError(''); setMessageActionStatus(''); }} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/[.07]">Edit message</button>}
                  <button type="button" disabled={messageActionBusy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void toggleMessagePin(message); }} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-white/[.07] disabled:opacity-50">{message.pinnedAt ? 'Unpin message' : 'Pin message'}</button>
                  {own && <button type="button" disabled={messageActionBusy} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setDeleteMessageId(message.id); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50">Delete message</button>}
                </div></details>;
                return <div key={message.id} ref={(node) => { messageRefs.current[message.id] = node; }} className={`group flex items-start gap-1.5 ${own ? 'justify-end' : 'justify-start'}`}>
                  {!own && menu}
                  <article className={`min-w-0 max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[75%] sm:px-4 ${own ? 'rounded-br-md bg-accent text-accent-foreground' : 'rounded-bl-md bg-surface-raised text-foreground'} ${message.deletedAt ? 'italic opacity-70' : ''}`}>
                    {editingMessageId === message.id ? <form onSubmit={(event) => { event.preventDefault(); void saveMessageEdit(message.id); }} className="min-w-[min(68vw,24rem)]"><label className="sr-only" htmlFor={`edit-message-${message.id}`}>Edit message</label><textarea id={`edit-message-${message.id}`} autoFocus value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={5000} className="min-h-20 w-full resize-y rounded-xl bg-black/20 p-2 text-sm text-white outline-none focus:ring-2 focus:ring-white/40" /><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => { setEditingMessageId(null); setEditDraft(''); }} className="min-h-8 rounded-full px-3 text-xs hover:bg-white/10">Cancel</button><button type="submit" disabled={!editDraft.trim() || messageActionBusy} className="min-h-8 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50">{messageActionBusy ? 'Saving…' : 'Save'}</button></div></form>
                      : message.deletedAt ? <p className="text-sm">This message was deleted</p> : <>
                        {message.pinnedAt && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium opacity-80"><span aria-hidden="true">⌖</span>Pinned</p>}
                        {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>}
                        {message.editedAt && <span className="mt-1 block text-[10px] opacity-70">Edited</span>}
                      </>}
                    {message.hasAttachment && message.attachmentType?.startsWith('audio/') ? <div className="mt-2 min-w-[220px] rounded-xl border border-current/10 bg-black/10 px-3 py-2"><p className="mb-2 flex items-center gap-2 text-xs font-medium"><span aria-hidden="true">♫</span>Voice message <span className="ml-auto text-[10px] opacity-70">{message.attachmentSize ? `${(message.attachmentSize / 1024).toFixed(0)} KB` : ''}</span></p>{voiceUrls[message.id] ? <audio controls preload="none" src={voiceUrls[message.id]} aria-label="Voice message playback" className="h-9 w-full" /> : <button type="button" disabled={loadingVoiceIds.includes(message.id)} onClick={() => void loadVoiceMessage(message)} className="min-h-9 rounded-full bg-white/10 px-3 text-xs font-medium hover:bg-white/15 disabled:opacity-60">{loadingVoiceIds.includes(message.id) ? 'Loading voice message…' : 'Load voice message'}</button>}</div> : message.hasAttachment && <div className="mt-2 rounded border border-current/15 px-3 py-2"><p className="max-w-[min(60vw,360px)] truncate text-xs font-medium">{message.attachmentName ?? 'Attachment'}</p><p className="mt-0.5 text-[10px] opacity-70">{message.attachmentType ?? 'File'}{message.attachmentSize ? ` · ${(message.attachmentSize / 1024 / 1024).toFixed(1)} MB` : ''}</p><div className="mt-2 flex gap-3 text-xs"><button type="button" onClick={() => void fetchAttachment(message, 'preview')} className="underline">Preview</button><button type="button" onClick={() => void fetchAttachment(message, 'download')} className="underline">Download</button></div></div>}
                    <div className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] ${own ? 'text-white/70' : 'text-muted'}`}><time dateTime={message.createdAt}>{timeFormat.format(new Date(message.createdAt))}</time>{own && !message.deletedAt && <span aria-label={`Message status: ${state}`}>{state}</span>}</div>
                    {own && !message.deletedAt && (message.status === 'failed' || message.status === 'waiting') && message.retryPayload && <div className="mt-1 flex justify-end gap-3 text-[10px] font-medium"><button type="button" onClick={() => void sendMessage(message.retryPayload!, message.id)} className="underline">Retry message</button>{message.offlineQueued && <button type="button" onClick={() => void removeQueuedTextMessage(message.id)} className="underline">Remove</button>}</div>}
                  </article>
                  {own && menu}
                </div>;
              })}
            </div>
            <form onSubmit={(event) => void submitMessage(event)} className="border-t border-white/[.07] bg-surface p-3 sm:px-6 sm:py-4">
              {attachment && <div className="mb-3 flex items-center justify-between gap-3 rounded border border-accent/20 bg-accent/5 px-3 py-2 text-xs"><span className="truncate">Ready to attach: {attachment.name}</span><button type="button" onClick={() => setAttachment(null)} className="min-h-8 px-2 underline">Remove</button></div>}
              {voiceNote && <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[.07] bg-surface-raised px-3 py-2"><audio controls preload="metadata" src={voiceNote.previewUrl} aria-label="Preview voice message" className="h-9 min-w-[180px] flex-1" /><span className="text-[10px] text-muted">Ready to send</span><button type="button" onClick={() => { URL.revokeObjectURL(voiceNote.previewUrl); setVoiceNote(null); setAttachment(null); setRecordingSeconds(0); }} className="min-h-9 rounded-full px-3 text-xs text-muted hover:bg-white/[.07]">Discard</button></div>}
              {!online && (attachment || voiceNote) && <p role="status" className="mb-2 text-xs text-amber-200">Files and voice messages cannot be queued offline. Reconnect or remove them to queue text only.</p>}
              {uploadProgress !== null && <p role="status" className="mb-2 text-xs text-accent">Uploading securely… {uploadProgress}%</p>}
              {uploadError && <div role="alert" className="mb-2 flex flex-wrap items-center gap-3 text-xs text-red-300">{uploadError}{retryFile && <button type="button" onClick={() => void uploadFile(retryFile)} className="min-h-8 underline">Retry upload</button>}</div>}
              <div className="flex items-end gap-2">
                <div className="relative flex gap-1"><button type="button" aria-label="Add emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((open) => !open)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg text-accent transition hover:bg-white/[.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">☺</button><label aria-label="Attach image, audio, or PDF" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-accent transition hover:bg-white/[.06] focus-within:outline focus-within:outline-2 focus-within:outline-accent">＋<input type="file" accept={ACCEPTED_MIME.join(',')} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) { if (voiceNote) URL.revokeObjectURL(voiceNote.previewUrl); setVoiceNote(null); void uploadFile(file); } event.currentTarget.value = ''; }} /></label>
                  {emojiOpen && <div className="absolute bottom-12 left-0 z-20 w-72 rounded-lg border border-border/15 bg-surface p-3 shadow-xl" role="dialog" aria-label="Emoji picker"><label className="sr-only" htmlFor="emoji-search">Search emoji</label><input id="emoji-search" value={emojiSearch} onChange={(event) => setEmojiSearch(event.target.value.toLowerCase())} placeholder="Search emoji" className="min-h-10 w-full rounded border border-border/15 bg-background px-3 text-sm" /><div className="mt-2 grid grid-cols-6 gap-1">{filteredEmoji.map((item) => <button type="button" key={item.name} aria-label={`${item.name} emoji`} title={item.name} onClick={() => { setBody((value) => `${value}${item.emoji}`); setEmojiOpen(false); }} className="min-h-10 rounded text-xl hover:bg-white/10">{item.emoji}</button>)}</div>{filteredEmoji.length === 0 && <p className="py-3 text-xs text-muted">No matching emoji.</p>}</div>}</div>
                {recording ? <div className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-red-500/10 px-3 text-xs text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" aria-hidden="true" /><span aria-live="off">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span><button type="button" aria-label="Stop recording" onClick={stopVoiceRecording} className="grid h-8 w-8 place-items-center rounded-full bg-red-500 text-white">■</button><button type="button" aria-label="Cancel recording" onClick={cancelVoiceRecording} className="grid h-8 w-8 place-items-center rounded-full text-red-200 hover:bg-red-500/20">×</button></div> : <button type="button" aria-label={voiceNote ? 'Record another voice message' : 'Record voice message'} title="Record voice message" onClick={() => void startVoiceRecording()} disabled={!online || uploadProgress !== null} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-accent transition hover:bg-white/[.06] disabled:opacity-40"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8" /></svg></button>}
                <label className="sr-only" htmlFor="message-body">Write a message</label><textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={1} placeholder={online ? 'Aa' : 'Text messages can wait for a connection'} disabled={recording} className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-white/[.05] bg-surface-raised px-4 py-3 text-sm text-white placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60" />
                <button type="submit" aria-label={online ? 'Send' : 'Queue text message'} title={online ? 'Send' : 'Queue text message for when you reconnect'} disabled={(!online && (!body.trim() || Boolean(attachment) || Boolean(voiceNote))) || (online && (!body.trim() && !attachment && !voiceNote)) || uploadProgress !== null || recording} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-lg font-medium text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted">➤</button>
              </div>
              {!online && <p className="mt-2 text-[11px] text-amber-200">This message has not been sent. Reconnect, then retry it from the conversation.</p>}
            </form>
          </>}
        </section>
      </div>
      {deleteMessageId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="delete-message-title" className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl"><h2 id="delete-message-title" className="text-base font-semibold">Delete this message?</h2><p className="mt-2 text-sm leading-6 text-muted">It will be removed for everyone in this conversation.</p><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={messageActionBusy} onClick={() => setDeleteMessageId(null)} className="min-h-10 rounded-full px-4 text-xs text-foreground hover:bg-white/[.07]">Cancel</button><button type="button" disabled={messageActionBusy} onClick={() => void deleteTextMessage(deleteMessageId)} className="min-h-10 rounded-full bg-[#e5484d] px-4 text-xs font-semibold text-white hover:bg-[#f05a60] disabled:opacity-50">{messageActionBusy ? 'Deleting…' : 'Delete message'}</button></div></section></div>}
      {attachmentPreview && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => { URL.revokeObjectURL(attachmentPreview.url); setAttachmentPreview(null); }}><section role="dialog" aria-modal="true" aria-label={`Attachment preview: ${attachmentPreview.name}`} className="max-h-[90dvh] w-full max-w-4xl overflow-auto rounded-lg bg-[#111] p-4" onClick={(event) => event.stopPropagation()}><header className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate text-sm">{attachmentPreview.name}</h2><button type="button" autoFocus onClick={() => { URL.revokeObjectURL(attachmentPreview.url); setAttachmentPreview(null); }} className="min-h-10 rounded border border-border/20 px-3 text-xs">Close</button></header>{attachmentPreview.type === 'application/pdf' ? <iframe title={attachmentPreview.name} src={attachmentPreview.url} className="h-[75dvh] w-full bg-white" /> : <img src={attachmentPreview.url} alt={attachmentPreview.name} className="mx-auto max-h-[75dvh] max-w-full object-contain" />}</section></div>}
    </main>
  );
}

export default function MessagesPage() {
  return <ProtectedRoute><Suspense fallback={<div className="p-8 text-sm text-muted" role="status">Loading messages…</div>}><MessagesContent /></Suspense></ProtectedRoute>;
}
