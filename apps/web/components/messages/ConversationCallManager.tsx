'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

type MediaMode = 'audio' | 'video';
type CallInfo = { callId: string; conversationId: string; mediaMode: MediaMode; state: string; participantName?: string; direction?: 'incoming' | 'outgoing' };
type Signal = { callId: string; kind: 'offer' | 'answer' | 'ice-candidate'; data: RTCSessionDescriptionInit | RTCIceCandidateInit };
type Result = { ok: boolean; message?: string; code?: string; call?: CallInfo; callId?: string; state?: string; iceServers?: RTCIceServer[]; networkNotice?: string | null };

function explainMediaError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (!navigator.mediaDevices?.getUserMedia) return 'Audio and video calling are not supported by this browser.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow microphone or camera access in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone or camera was found for this call.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'Your microphone or camera is being used by another app.';
  return 'The microphone or camera could not be started. Check your device settings and retry.';
}

export function ConversationCallManager({ socket, conversationId, participantName, online = true }: { socket: Socket | null; conversationId: string; participantName: string; online?: boolean }) {
  const [call, setCall] = useState<CallInfo | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteMediaReady, setRemoteMediaReady] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const pendingSignals = useRef<Signal[]>([]);
  const currentCall = useRef<CallInfo | null>(null);
  const mounted = useRef(true);

  const releaseMedia = useCallback(() => {
    peer.current?.close(); peer.current = null;
    localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null;
    remoteStream.current = null;
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    pendingSignals.current = [];
  }, []);

  useEffect(() => {
    if (localVideo.current && localStream.current) localVideo.current.srcObject = localStream.current;
    if (remoteVideo.current && remoteStream.current) remoteVideo.current.srcObject = remoteStream.current;
  }, [call?.callId]);

  const setCurrent = useCallback((next: CallInfo | null) => { currentCall.current = next; if (mounted.current) setCall(next); }, []);
  const emitAck = useCallback((event: string, data: unknown) => new Promise<Result>((resolve) => {
    if (!socket?.connected) { resolve({ ok: false, message: 'The calling service is disconnected.' }); return; }
    socket.timeout(8000).emit(event, data, (err: Error | null, result: Result) => resolve(err ? { ok: false, message: 'The calling service did not respond. Try again.' } : result));
  }), [socket]);

  const prepareMedia = useCallback(async (mode: MediaMode) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === 'video' });
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      return stream;
    } catch (error) { throw new Error(explainMediaError(error)); }
  }, []);

  const processSignal = useCallback(async (signal: Signal) => {
    const pc = peer.current;
    if (!pc) { pendingSignals.current.push(signal); return; }
    if (signal.kind === 'offer') {
      await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
      socket?.emit('call:signal', { callId: signal.callId, kind: 'answer', data: pc.localDescription });
    } else if (signal.kind === 'answer') {
      if (!pc.currentRemoteDescription) await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
    } else if (pc.remoteDescription) {
      await pc.addIceCandidate(signal.data as RTCIceCandidateInit);
    } else pendingSignals.current.push(signal);
  }, [socket]);

  const createPeer = useCallback(async (info: CallInfo, initiator: boolean) => {
    const ice = await emitAck('call:ice-config', { callId: info.callId });
    if (!ice.ok) throw new Error(ice.message ?? 'Could not prepare a secure call connection.');
    const stream = localStream.current ?? await prepareMedia(info.mediaMode);
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers ?? [] });
    peer.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? remoteStream.current ?? new MediaStream();
      if (!event.streams[0] && !stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      remoteStream.current = stream;
      setRemoteMediaReady(true);
      if (remoteVideo.current) remoteVideo.current.srcObject = stream;
    };
    pc.onicecandidate = (event) => { if (event.candidate) socket?.emit('call:signal', { callId: info.callId, kind: 'ice-candidate', data: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (!currentCall.current || currentCall.current.callId !== info.callId) return;
      if (pc.connectionState === 'connected') { setCurrent({ ...currentCall.current, state: 'connected' }); setStatus('Connected'); socket?.emit('call:network-state', { callId: info.callId, state: 'connected' }); }
      else if (pc.connectionState === 'disconnected' || pc.connectionState === 'connecting') { setCurrent({ ...currentCall.current, state: 'reconnecting' }); setStatus('Reconnecting…'); socket?.emit('call:network-state', { callId: info.callId, state: 'reconnecting' }); }
      else if (pc.connectionState === 'failed') { setStatus('Connection failed. End the call and try again.'); socket?.emit('call:end', { callId: info.callId }); releaseMedia(); setRemoteMediaReady(false); setCurrent(null); }
    };
    if (initiator) {
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket?.emit('call:signal', { callId: info.callId, kind: 'offer', data: pc.localDescription });
    }
    for (const signal of pendingSignals.current.splice(0)) await processSignal(signal);
    if (ice.networkNotice) setStatus(ice.networkNotice);
  }, [emitAck, prepareMedia, processSignal, releaseMedia, setCurrent, socket]);

  const terminate = useCallback((message = '') => { releaseMedia(); setRemoteMediaReady(false); setMuted(false); setCameraOff(false); setCurrent(null); setStatus(message); setBusy(false); }, [releaseMedia, setCurrent]);

  useEffect(() => {
    mounted.current = true;
    if (!socket) return () => { mounted.current = false; releaseMedia(); };
    const incoming = (data: CallInfo & { callerName?: string }) => {
      if (currentCall.current) { socket.emit('call:decline', { callId: data.callId }); return; }
      const next = { ...data, direction: 'incoming' as const, participantName: data.callerName ?? 'Fine Arts member' };
      setCurrent(next); setStatus(`${next.participantName} is calling (${next.mediaMode}).`);
    };
    const accepted = async (data: CallInfo) => {
      if (currentCall.current?.callId !== data.callId) return;
      const connectingCall: CallInfo = { ...currentCall.current, state: 'connecting' };
      setCurrent(connectingCall);
      try { await createPeer(connectingCall, true); } catch (error) { socket.emit('call:end', { callId: data.callId }); terminate(error instanceof Error ? error.message : 'Could not connect this call.'); }
    };
    const signal = (data: Signal) => { if (data.callId === currentCall.current?.callId) void processSignal(data).catch(() => setStatus('A call connection update could not be applied.')); };
    const ended = (data: { callId: string; state: string }) => { if (data.callId === currentCall.current?.callId) terminate(data.state === 'missed' ? 'The call was not answered.' : `Call ${data.state}.`); };
    const network = (data: { callId: string; state: string }) => {
      if (data.callId !== currentCall.current?.callId) return;
      if (data.state === 'connected' || data.state === 'reconnecting') setCurrent({ ...currentCall.current, state: data.state });
      setStatus(data.state === 'connected' ? 'Connected' : 'Reconnecting…');
    };
    const onDisconnect = () => { if (currentCall.current) setStatus('Signaling disconnected. Reconnecting…'); };
    const onConnect = () => {
      const activeCall = currentCall.current;
      if (!activeCall) return;
      socket.timeout(8000).emit('call:resume', { callId: activeCall.callId }, (err: Error | null, result: Result) => {
        if (err || !result?.ok) setStatus('The call could not resume. End it and try again.');
        else { setCurrent({ ...activeCall, state: 'connecting' }); setStatus('Signaling restored. Reconnecting media…'); }
      });
    };
    socket.on('call:incoming', incoming); socket.on('call:accepted', accepted); socket.on('call:signal', signal);
    socket.on('call:declined', ended); socket.on('call:cancelled', ended); socket.on('call:missed', ended); socket.on('call:failed', ended); socket.on('call:ended', ended);
    const reconnected = (data: { callId: string }) => { if (data.callId === currentCall.current?.callId) setStatus('Signaling restored. Reconnecting media…'); };
    socket.on('call:network-state', network); socket.on('call:reconnected', reconnected);
    socket.on('disconnect', onDisconnect); socket.on('connect', onConnect);
    return () => { mounted.current = false; socket.off('call:incoming', incoming); socket.off('call:accepted', accepted); socket.off('call:signal', signal); socket.off('call:declined', ended); socket.off('call:cancelled', ended); socket.off('call:missed', ended); socket.off('call:failed', ended); socket.off('call:ended', ended); socket.off('call:network-state', network); socket.off('call:reconnected', reconnected); socket.off('disconnect', onDisconnect); socket.off('connect', onConnect); if (currentCall.current) socket.emit('call:end', { callId: currentCall.current.callId }); releaseMedia(); };
  }, [createPeer, processSignal, releaseMedia, setCurrent, socket, terminate]);

  async function start(mode: MediaMode) {
    if (!online) { setStatus('Calls are unavailable while you are offline.'); return; }
    if (!socket || !conversationId || busy || currentCall.current) return;
    setBusy(true); setStatus('Requesting microphone and camera access…');
    try {
      await prepareMedia(mode);
      const result = await emitAck('call:initiate', { conversationId, mediaMode: mode, requestId: crypto.randomUUID() });
      if (!result.ok || !result.call) throw new Error(result.message ?? 'The call could not be started.');
      setCurrent(result.call); setStatus(`Calling ${participantName}…`);
    } catch (error) { releaseMedia(); setStatus(error instanceof Error ? error.message : 'The call could not be started.'); }
    finally { setBusy(false); }
  }

  async function accept() {
    const info = currentCall.current; if (!info || busy) return;
    setBusy(true); setStatus('Starting your microphone and camera…');
    try {
      await prepareMedia(info.mediaMode);
      const result = await emitAck('call:accept', { callId: info.callId });
      if (!result.ok) throw new Error(result.message ?? 'This call could not be accepted.');
      const connectingCall: CallInfo = { ...info, state: 'connecting' };
      setCurrent(connectingCall);
      await createPeer(connectingCall, false); setStatus('Connecting…');
    } catch (error) { socket?.emit('call:end', { callId: info.callId }); terminate(error instanceof Error ? error.message : 'This call could not be accepted.'); }
    finally { setBusy(false); }
  }

  async function action(event: 'call:decline' | 'call:cancel' | 'call:end') {
    const info = currentCall.current; if (!info) return;
    await emitAck(event, { callId: info.callId }); terminate(event === 'call:end' ? 'Call ended.' : event === 'call:decline' ? 'Call declined.' : 'Call cancelled.');
  }

  return <div className="flex flex-wrap items-center gap-2">
    {!call && conversationId && <>
      <button type="button" aria-label="Audio call" title={online ? 'Audio call' : 'Audio calls are unavailable offline'} disabled={!online || busy || !socket?.connected} onClick={() => void start('audio')} className="grid h-10 w-10 place-items-center rounded-full text-accent transition hover:bg-white/[.07] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h3l2 5-2 1.5a14 14 0 0 0 5.5 5.5L15 14l5 2v3c0 1.1-.9 2-2 2C10 21 3 14 3 6c0-1.1.9-2 2-2Z" /></svg></button>
      <button type="button" aria-label="Video call" title={online ? 'Video call' : 'Video calls are unavailable offline'} disabled={!online || busy || !socket?.connected} onClick={() => void start('video')} className="grid h-10 w-10 place-items-center rounded-full text-accent transition hover:bg-white/[.07] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg></button>
    </>}
    {call && <div role="dialog" aria-label="Audio and video call" className={`fixed inset-x-3 bottom-3 z-40 mx-auto max-h-[85dvh] overflow-auto rounded-2xl border border-border/20 bg-[#111] p-4 shadow-2xl sm:bottom-6 sm:right-6 ${call.mediaMode === 'video' ? 'sm:inset-x-auto sm:w-[min(92vw,56rem)]' : 'max-w-lg sm:inset-x-auto sm:w-[min(92vw,32rem)]'}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg">{call.participantName ?? participantName}</p><p role="status" className="mt-1 text-xs text-muted">{busy ? 'Please wait…' : status || call.state}</p></div><button type="button" aria-label={call.state === 'ringing' ? call.direction === 'incoming' ? 'Decline call' : 'Cancel call' : 'End call'} onClick={() => void action(call.state === 'ringing' ? (call.direction === 'incoming' ? 'call:decline' : 'call:cancel') : 'call:end')} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#e5484d] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#f05a60] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 rotate-[135deg]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h3l2 5-2 1.5a14 14 0 0 0 5.5 5.5L15 14l5 2v3c0 1.1-.9 2-2 2C10 21 3 14 3 6c0-1.1.9-2 2-2Z" /></svg><span>{call.state === 'ringing' ? call.direction === 'incoming' ? 'Decline' : 'Cancel' : 'End call'}</span></button></div>
      {call.state === 'ringing' && call.direction === 'incoming' && <div className="mt-4 flex gap-2"><button type="button" disabled={!online || busy} onClick={() => void accept()} className="min-h-11 flex-1 rounded bg-accent px-4 text-sm text-background disabled:opacity-50">{online ? 'Accept' : 'Unavailable offline'}</button></div>}
      {call.state === 'ringing' && call.direction === 'outgoing' && <p className="mt-3 text-xs text-muted">Waiting for the other participant to answer…</p>}
      <div className={`mt-3 ${call.mediaMode === 'video' ? 'relative aspect-video max-h-[58dvh] overflow-hidden rounded-xl bg-black' : 'hidden'}`}><video ref={remoteVideo} autoPlay playsInline aria-label="Other participant" className={`${call.mediaMode === 'video' ? 'absolute inset-0 h-full w-full' : 'hidden'} bg-black object-cover`} /><video ref={localVideo} autoPlay muted playsInline aria-label="Your camera preview" className={`${call.mediaMode === 'video' ? 'absolute bottom-3 right-3 z-10 aspect-video w-[28%] rounded-lg border border-white/30 bg-black object-cover shadow-xl' : 'hidden'}`} />{call.mediaMode === 'video' && !remoteMediaReady && <p className="absolute inset-0 grid place-items-center text-sm text-white/70">{call.state === 'ringing' ? 'Accept to join the video call' : 'Connecting video…'}</p>}</div>
      {(call.state === 'connecting' || call.state === 'connected' || call.state === 'reconnecting') && <div className="mt-3 flex gap-2"><button type="button" onClick={() => { const next = !muted; localStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); setMuted(next); }} className="min-h-10 rounded border border-border/20 px-3 text-xs">{muted ? 'Unmute' : 'Mute'}</button>{call.mediaMode === 'video' && <button type="button" onClick={() => { const next = !cameraOff; localStream.current?.getVideoTracks().forEach((track) => { track.enabled = !next; }); setCameraOff(next); }} className="min-h-10 rounded border border-border/20 px-3 text-xs">{cameraOff ? 'Camera on' : 'Camera off'}</button>}</div>}
    </div>}
    {!call && status && <p role="status" className="basis-full text-xs text-muted">{status}</p>}
  </div>;
}
