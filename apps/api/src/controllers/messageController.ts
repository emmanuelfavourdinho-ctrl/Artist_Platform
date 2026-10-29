import type { NextFunction, Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import { config } from '../config/index.js';
import { createConversationSchema, editMessageSchema, pinMessageSchema, reportConversationSchema, sendMessageSchema } from '../schemas/messageSchemas.js';
import { findOrCreateConversation, conversationInclude } from '../services/conversationService.js';
import { emitConversationEvent, emitUserEvent } from '../sockets/messagingSocket.js';
import { isSafeUploadSignature, signedAuthenticatedCloudinaryUrl } from '../sockets/messagingSocket.js';

function requireUser(req: Request): string {
  if (!req.user?.id) throw new HttpError(401, 'Login required', { code: 'AUTH_REQUIRED' });
  return req.user.id;
}

function requireParam(value: string | undefined, name: string): string {
  if (!value) throw new HttpError(400, `${name} is required`, { code: 'INVALID_ROUTE_PARAM' });
  return value;
}

async function getParticipantConversation(id: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: conversationInclude,
  });
  if (!conversation)
    throw new HttpError(404, 'Conversation not found', { code: 'CONVERSATION_NOT_FOUND' });
  if (conversation.buyerId !== userId && conversation.artist.userId !== userId) {
    throw new HttpError(403, 'You are not a participant in this conversation', {
      code: 'CONVERSATION_FORBIDDEN',
    });
  }
  return conversation;
}

function participantView(conversation: any, userId: string) {
  const { buyer, artist, _count, ...rest } = conversation;
  const isBuyer = conversation.buyerId === userId;
  return {
    ...rest,
    buyer: { firstName: buyer.firstName, lastName: buyer.lastName },
    artist: { id: artist.id, displayName: artist.displayName, slug: artist.slug, profileImageUrl: artist.profileImageUrl },
    participant: isBuyer
      ? { name: artist.displayName, imageUrl: artist.profileImageUrl, role: 'ARTIST' }
      : { name: `${buyer.firstName} ${buyer.lastName}`.trim(), imageUrl: null, role: 'BUYER' },
  };
}

function messageView(message: any) {
  const { attachmentUrl, ...safe } = message;
  return { ...safe, hasAttachment: Boolean(attachmentUrl) };
}

function uploadResponseSignature(publicId: string, version: number, secret: string) {
  return createHash('sha1').update(`public_id=${publicId}&version=${version}${secret}`).digest('hex');
}

async function validateAttachment(userId: string, conversationId: string, attachment: NonNullable<ReturnType<typeof sendMessageSchema.parse>['attachment']>) {
  const { cloudName, apiSecret } = config.cloudinary;
  if (!cloudName || !apiSecret) throw new HttpError(503, 'Attachments are not configured', { code: 'UPLOADS_UNAVAILABLE' });
  const folder = `messages/${conversationId}/${userId}`;
  const url = new URL(attachment.secureUrl);
  const pathname = decodeURIComponent(url.pathname);
  const resourceType = attachment.resourceType;
  const expectedAsset = `/${cloudName}/${resourceType}/authenticated/v${attachment.version}/${attachment.publicId}.${attachment.format}`;
  const mimeFormats: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'],
    'image/gif': ['gif'], 'application/pdf': ['pdf'],
    'audio/webm': ['webm', 'opus'], 'audio/mp4': ['m4a', 'mp4'], 'audio/ogg': ['ogg', 'opus'],
    'audio/mpeg': ['mp3'], 'audio/wav': ['wav'], 'audio/aac': ['aac'], 'audio/flac': ['flac'],
  };
  const resourcePath = `/${cloudName}/${resourceType}/authenticated/`;
  if (
    url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' ||
    !pathname.startsWith(resourcePath) ||
    !pathname.endsWith(`/${attachment.publicId}.${attachment.format}`) ||
    !pathname.includes(`/${folder}/`) || !pathname.includes(expectedAsset) ||
    attachment.publicId.includes('..') || attachment.publicId.includes('\\') ||
    !mimeFormats[attachment.mimeType]?.includes(attachment.format) ||
    !isSafeUploadSignature(uploadResponseSignature(attachment.publicId, attachment.version, apiSecret), attachment.signature)
  ) {
    throw new HttpError(400, 'The attachment could not be verified. Upload it again.', { code: 'INVALID_ATTACHMENT' });
  }
  const publicIdPath = attachment.publicId.split('/').map(encodeURIComponent).join('/');
  const resourceResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/authenticated/${publicIdPath}`,
    { headers: { Authorization: `Basic ${Buffer.from(`${config.cloudinary.apiKey}:${apiSecret}`).toString('base64')}` } },
  );
  if (!resourceResponse.ok) {
    if (resourceResponse.status === 404) throw new HttpError(400, 'The uploaded attachment could not be found.', { code: 'INVALID_ATTACHMENT' });
    throw new HttpError(503, 'Attachment verification is temporarily unavailable. Retry sending.', { code: 'UPLOAD_VERIFICATION_UNAVAILABLE' });
  }
  const resource = await resourceResponse.json() as {
    public_id?: string; secure_url?: string; resource_type?: string; type?: string; format?: string; bytes?: number; version?: number;
  };
  if (
    resource.public_id !== attachment.publicId || resource.secure_url !== attachment.secureUrl ||
    resource.resource_type !== resourceType || resource.type !== 'authenticated' ||
    resource.format !== attachment.format || resource.bytes !== attachment.bytes || resource.bytes > 20_000_000 ||
    resource.version !== attachment.version
  ) {
    throw new HttpError(400, 'Uploaded attachment metadata did not match Cloudinary. Upload it again.', { code: 'INVALID_ATTACHMENT' });
  }
  return {
    attachmentUrl: attachment.secureUrl,
    attachmentType: attachment.mimeType,
    attachmentName: [...attachment.name].filter((character) => {
      const code = character.charCodeAt(0);
      return character !== '/' && character !== '\\' && !(code <= 0x1f || code === 0x7f);
    }).join('').slice(0, 255) || 'attachment',
    attachmentSize: attachment.bytes,
  };
}

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { artist: { userId } }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        ...conversationInclude,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, body: true, createdAt: true, editedAt: true, deletedAt: true, pinnedAt: true, pinnedById: true, senderId: true, attachmentUrl: true, attachmentName: true, attachmentType: true },
        },
        _count: { select: { messages: { where: { senderId: { not: userId }, readAt: null } } } },
      },
    });
    res.json({ status: 'success', data: conversations.map((c) => ({
      ...participantView(c, userId), unreadCount: c._count.messages,
      messages: c.messages.map(({ attachmentUrl, ...message }) => ({ ...message, hasAttachment: Boolean(attachmentUrl) })),
    })) });
  } catch (error) {
    next(error);
  }
}

export async function createConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const buyerId = requireUser(req);
    const input = createConversationSchema.parse(req.body);
    const artist = await prisma.artistProfile.findUnique({ where: { id: input.artistId } });
    if (!artist) throw new HttpError(404, 'Artist not found', { code: 'ARTIST_NOT_FOUND' });
    if (artist.userId === buyerId) throw new HttpError(400, 'You cannot message yourself', { code: 'SELF_CONVERSATION' });

    if (input.artworkId) {
      const artwork = await prisma.artwork.findUnique({ where: { id: input.artworkId }, select: { artistId: true, status: true, visibility: true } });
      if (!artwork || artwork.artistId !== artist.id || artwork.status !== 'PUBLISHED' || artwork.visibility !== 'PUBLIC') {
        throw new HttpError(404, 'Public artwork not found for this artist', { code: 'ARTWORK_CONTEXT_NOT_FOUND' });
      }
    }
    if (input.commissionRequestId) {
      const commission = await prisma.commissionRequest.findUnique({ where: { id: input.commissionRequestId }, select: { buyerId: true, artistId: true } });
      if (!commission || commission.buyerId !== buyerId || commission.artistId !== artist.id) {
        throw new HttpError(404, 'Commission context not found', { code: 'COMMISSION_CONTEXT_NOT_FOUND' });
      }
    }
    if (input.orderId) {
      const order = await prisma.order.findFirst({ where: { id: input.orderId, userId: buyerId, items: { some: { artistId: artist.id } } }, select: { id: true } });
      if (!order) throw new HttpError(404, 'Order context not found', { code: 'ORDER_CONTEXT_NOT_FOUND' });
    }

    const conversation = await findOrCreateConversation({
      buyerId,
      artistId: input.artistId,
      commissionRequestId: input.commissionRequestId,
      artworkId: input.artworkId,
      orderId: input.orderId,
    });

    emitUserEvent(artist.userId, 'message:inbox-update', { conversationId: conversation.id });
    res.status(201).json({ status: 'success', data: participantView(conversation, buyerId) });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversation = await getParticipantConversation(
      requireParam(req.params.id, 'Conversation ID'),
      userId,
    );
    const unread = await prisma.message.updateMany({
      where: { conversationId: conversation.id, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (unread.count > 0) emitConversationEvent(conversation.id, 'message:read', { userId, conversationId: conversation.id });
    res.json({ status: 'success', data: { ...participantView(conversation, userId), messages: messages.map(messageView) } });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const input = sendMessageSchema.parse(req.body);
    const conversation = await getParticipantConversation(
      requireParam(req.params.id, 'Conversation ID'),
      userId,
    );
    if (conversation.status !== 'OPEN') throw new HttpError(409, 'This conversation is closed.', { code: 'CONVERSATION_CLOSED' });
    const asset: { attachmentUrl?: string | null; attachmentType?: string | null; attachmentName?: string | null; attachmentSize?: number | null } =
      input.attachment ? await validateAttachment(userId, conversation.id, input.attachment) : {};
    const id = input.id ?? randomUUID();
    const messageData = {
      id,
      conversationId: conversation.id,
      senderId: userId,
      body: input.body ?? '',
      attachmentUrl: asset.attachmentUrl ?? null,
      attachmentType: asset.attachmentType ?? null,
      attachmentName: asset.attachmentName ?? null,
      attachmentSize: asset.attachmentSize ?? null,
      ...asset,
    };
    let message = await prisma.message.findUnique({ where: { id }, include: { sender: { select: { id: true, firstName: true, lastName: true } } } });
    if (message) {
      if (message.conversationId !== conversation.id || message.senderId !== userId || message.body !== messageData.body || message.attachmentUrl !== messageData.attachmentUrl) {
        throw new HttpError(409, 'This message id was already used for different content.', { code: 'MESSAGE_ID_CONFLICT' });
      }
    } else {
      try {
        message = await prisma.message.create({
          data: messageData,
          include: { sender: { select: { id: true, firstName: true, lastName: true } } },
        });
      } catch (error) {
        // A concurrent retry may have inserted this id after the lookup.
        message = await prisma.message.findUnique({ where: { id }, include: { sender: { select: { id: true, firstName: true, lastName: true } } } });
        if (!message || message.conversationId !== conversation.id || message.senderId !== userId || message.body !== messageData.body || message.attachmentUrl !== messageData.attachmentUrl) throw error;
      }
    }
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    const result = { ...messageView(message), conversationId: conversation.id };
    emitConversationEvent(conversation.id, 'message:new', result);
    const recipientId = conversation.buyerId === userId ? conversation.artist.userId : conversation.buyerId;
    emitUserEvent(recipientId, 'message:inbox-update', { conversationId: conversation.id });
    res.status(201).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
}

async function getTextMessageForConversation(messageId: string, conversationId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId },
    select: { id: true, senderId: true, body: true, attachmentUrl: true, deletedAt: true },
  });
  if (!message) throw new HttpError(404, 'Message not found', { code: 'MESSAGE_NOT_FOUND' });
  if (message.attachmentUrl || !message.body) throw new HttpError(400, 'Only text messages can use this action.', { code: 'TEXT_MESSAGE_REQUIRED' });
  if (message.deletedAt) throw new HttpError(409, 'This message has already been deleted.', { code: 'MESSAGE_DELETED' });
  return message;
}

export async function editMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversation = await getParticipantConversation(requireParam(req.params.id, 'Conversation ID'), userId);
    if (conversation.status !== 'OPEN') throw new HttpError(409, 'This conversation is closed.', { code: 'CONVERSATION_CLOSED' });
    const input = editMessageSchema.parse(req.body);
    const message = await getTextMessageForConversation(requireParam(req.params.messageId, 'Message ID'), conversation.id);
    if (message.senderId !== userId) throw new HttpError(403, 'You can only edit your own messages.', { code: 'MESSAGE_FORBIDDEN' });
    const updated = await prisma.message.update({
      where: { id: message.id }, data: { body: input.body, editedAt: new Date() },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    const result = { ...messageView(updated), conversationId: conversation.id };
    emitConversationEvent(conversation.id, 'message:update', result);
    emitUserEvent(conversation.buyerId === userId ? conversation.artist.userId : conversation.buyerId, 'message:inbox-update', { conversationId: conversation.id });
    res.json({ status: 'success', data: result });
  } catch (error) { next(error); }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversation = await getParticipantConversation(requireParam(req.params.id, 'Conversation ID'), userId);
    if (conversation.status !== 'OPEN') throw new HttpError(409, 'This conversation is closed.', { code: 'CONVERSATION_CLOSED' });
    const message = await getTextMessageForConversation(requireParam(req.params.messageId, 'Message ID'), conversation.id);
    if (message.senderId !== userId) throw new HttpError(403, 'You can only delete your own messages.', { code: 'MESSAGE_FORBIDDEN' });
    const updated = await prisma.message.update({
      where: { id: message.id }, data: { body: '', deletedAt: new Date(), editedAt: null, pinnedAt: null, pinnedById: null },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    const result = { ...messageView(updated), conversationId: conversation.id };
    emitConversationEvent(conversation.id, 'message:update', result);
    emitUserEvent(conversation.buyerId === userId ? conversation.artist.userId : conversation.buyerId, 'message:inbox-update', { conversationId: conversation.id });
    res.json({ status: 'success', data: result });
  } catch (error) { next(error); }
}

export async function pinMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversation = await getParticipantConversation(requireParam(req.params.id, 'Conversation ID'), userId);
    if (conversation.status !== 'OPEN') throw new HttpError(409, 'This conversation is closed.', { code: 'CONVERSATION_CLOSED' });
    const input = pinMessageSchema.parse(req.body);
    const message = await getTextMessageForConversation(requireParam(req.params.messageId, 'Message ID'), conversation.id);
    const updated = await prisma.message.update({
      where: { id: message.id }, data: { pinnedAt: input.pinned ? new Date() : null, pinnedById: input.pinned ? userId : null },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    const result = { ...messageView(updated), conversationId: conversation.id };
    emitConversationEvent(conversation.id, 'message:update', result);
    emitUserEvent(conversation.buyerId === userId ? conversation.artist.userId : conversation.buyerId, 'message:inbox-update', { conversationId: conversation.id });
    res.json({ status: 'success', data: result });
  } catch (error) { next(error); }
}

export async function createMessageUploadSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversation = await getParticipantConversation(requireParam(req.params.id, 'Conversation ID'), userId);
    if (conversation.status !== 'OPEN') throw new HttpError(409, 'This conversation is closed.', { code: 'CONVERSATION_CLOSED' });
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) throw new HttpError(503, 'Attachments are not configured', { code: 'UPLOADS_UNAVAILABLE' });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `messages/${conversation.id}/${userId}`;
    const allowedFormats = 'jpg,jpeg,png,webp,gif,pdf,webm,mp3,m4a,mp4,ogg,opus,wav,aac,flac';
    const signature = createHash('sha1').update(`allowed_formats=${allowedFormats}&folder=${folder}&timestamp=${timestamp}&type=authenticated${apiSecret}`).digest('hex');
    res.json({ status: 'success', data: { cloudName, apiKey, timestamp, folder, type: 'authenticated', allowedFormats, signature } });
  } catch (error) { next(error); }
}

export async function downloadMessageAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = requireUser(req);
    const conversation = await getParticipantConversation(requireParam(req.params.id, 'Conversation ID'), userId);
    const message = await prisma.message.findFirst({ where: { id: requireParam(req.params.messageId, 'Message ID'), conversationId: conversation.id, attachmentUrl: { not: null } } });
    if (!message?.attachmentUrl) throw new HttpError(404, 'Attachment not found', { code: 'ATTACHMENT_NOT_FOUND' });
    const { cloudName, apiSecret } = config.cloudinary;
    if (!cloudName || !apiSecret) throw new HttpError(503, 'Attachments are not configured', { code: 'UPLOADS_UNAVAILABLE' });
    const signedUrl = signedAuthenticatedCloudinaryUrl(message.attachmentUrl, cloudName, apiSecret);
    if (!signedUrl) throw new HttpError(404, 'Attachment not found', { code: 'ATTACHMENT_NOT_FOUND' });
    const cloudinaryResponse = await fetch(signedUrl);
    if (!cloudinaryResponse.ok) throw new HttpError(502, 'Attachment storage is temporarily unavailable', { code: 'ATTACHMENT_STORAGE_UNAVAILABLE' });
    const upstreamType = cloudinaryResponse.headers.get('content-type') ?? message.attachmentType ?? 'application/octet-stream';
    const contentType = message.attachmentType?.startsWith('audio/') ? message.attachmentType : upstreamType;
    if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf|audio\/(mpeg|mp4|webm|ogg|wav|aac|flac|opus))$/.test(contentType)) throw new HttpError(502, 'Unsupported attachment type', { code: 'INVALID_ATTACHMENT_TYPE' });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${String(message.attachmentName ?? 'attachment').replace(/["\\\r\n]/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(await cloudinaryResponse.arrayBuffer()));
  } catch (error) { next(error); }
}

export async function reportConversationParticipant(req: Request, res: Response, next: NextFunction) {
  try {
    const reporterId = requireUser(req);
    const conversation = await getParticipantConversation(requireParam(req.params.id, 'Conversation ID'), reporterId);
    const input = reportConversationSchema.parse(req.body);
    const targetId = conversation.buyerId === reporterId ? conversation.artist.userId : conversation.buyerId;
    if (targetId === reporterId) throw new HttpError(400, 'You cannot report yourself', { code: 'SELF_REPORT' });
    const report = await prisma.report.create({
      data: { reporterId, targetType: 'USER', targetId, reason: input.reason, description: `[conversation:${conversation.id}]${input.description ? ` ${input.description}` : ''}` },
      select: { id: true, status: true, createdAt: true },
    });
    res.status(201).json({ status: 'success', data: report });
  } catch (error) { next(error); }
}
