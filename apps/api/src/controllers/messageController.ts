import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/db.js';
import { HttpError } from '../lib/httpError.js';
import { createConversationSchema, sendMessageSchema } from '../schemas/messageSchemas.js';

const conversationInclude = {
  artist: {
    select: { id: true, userId: true, displayName: true, slug: true, profileImageUrl: true },
  },
  buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
  commissionRequest: { select: { id: true, title: true, status: true } },
  artwork: { select: { id: true, title: true, slug: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
} as const;

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
          select: { body: true, createdAt: true },
        },
      },
    });
    res.json({ status: 'success', data: conversations });
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

    const existing = await prisma.conversation.findFirst({
      where: {
        buyerId,
        artistId: input.artistId,
        commissionRequestId: input.commissionRequestId ?? null,
      },
      include: conversationInclude,
    });
    if (existing) {
      res.json({ status: 'success', data: existing });
      return;
    }

    const conversation = await prisma.conversation.create({
      data: {
        buyerId,
        artistId: input.artistId,
        artworkId: input.artworkId,
        orderId: input.orderId,
        commissionRequestId: input.commissionRequestId,
      },
      include: conversationInclude,
    });
    res.status(201).json({ status: 'success', data: conversation });
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
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    res.json({ status: 'success', data: { ...conversation, messages } });
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
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderId: userId, ...input },
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    res.status(201).json({ status: 'success', data: message });
  } catch (error) {
    next(error);
  }
}
