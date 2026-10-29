import { timingSafeEqual, createHash } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';
import { registerCallSignaling } from './callSignaling.js';

let ioRef: Server | null = null;

export function registerMessagingSocket(io: Server) {
  ioRef = io;
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) return next(new Error('Authentication required'));
      const decoded = await adminAuth.verifyIdToken(token);
      const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, status: true } });
      if (!user || ['SUSPENDED', 'BANNED', 'DEACTIVATED'].includes(user.status)) return next(new Error('Account cannot use messaging'));
      socket.data.userId = user.id;
      socket.data.userStatus = user.status;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);
    registerCallSignaling(io, socket, userId, socket.data.userStatus as string);

    socket.on('conversation:join', async (payload: { conversationId?: string }, ack?: (result: { ok: boolean }) => void) => {
      try {
        const id = payload?.conversationId;
        if (typeof id !== 'string') return ack?.({ ok: false });
        const conversation = await prisma.conversation.findUnique({ where: { id }, select: { buyerId: true, artist: { select: { userId: true } } } });
        if (!conversation || (conversation.buyerId !== userId && conversation.artist.userId !== userId)) return ack?.({ ok: false });
        await socket.join(id);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('conversation:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') void socket.leave(conversationId);
    });

    socket.on('message:received', async (payload: { conversationId?: string; messageId?: string }) => {
      try {
        const { conversationId, messageId } = payload ?? {};
        if (!conversationId || !messageId || !socket.rooms.has(conversationId)) return;
        const message = await prisma.message.findFirst({
          where: { id: messageId, conversationId, senderId: { not: userId } },
          select: { id: true, senderId: true },
        });
        if (message?.senderId) io.to(`user:${message.senderId}`).emit('message:delivered', { messageId });
      } catch {
        // A delivery receipt is best-effort; the persisted message remains Sent.
      }
    });
  });
}

export function emitConversationEvent(conversationId: string, event: string, payload: unknown) {
  ioRef?.to(conversationId).emit(event, payload);
}

export function emitUserEvent(userId: string, event: string, payload: unknown) {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}

export function signedAuthenticatedCloudinaryUrl(secureUrl: string, cloudName: string, apiSecret: string): string | null {
  try {
    const url = new URL(secureUrl);
    const prefix = `/${cloudName}/`;
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(prefix)) return null;
    const match = url.pathname.slice(prefix.length).match(/^(image|video)\/authenticated\/(.+)$/);
    if (!match) return null;
    const [, resourceType, assetPath] = match;
    if (!assetPath || assetPath.includes('..') || assetPath.includes('\\')) return null;
    const signature = createHash('sha1').update(`${assetPath}${apiSecret}`).digest('base64url').slice(0, 8);
    return `${url.origin}${prefix}${resourceType}/authenticated/s--${signature}--/${assetPath}`;
  } catch {
    return null;
  }
}

export function isSafeUploadSignature(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
