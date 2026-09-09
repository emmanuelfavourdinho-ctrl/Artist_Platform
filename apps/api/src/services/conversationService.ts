import { prisma } from '../lib/prisma.js';

interface FindOrCreateConversationParams {
  buyerId: string;
  artistId: string;
  commissionRequestId?: string | null;
  artworkId?: string | null;
  orderId?: string | null;
}

export const conversationInclude = {
  artist: {
    select: { id: true, userId: true, displayName: true, slug: true, profileImageUrl: true },
  },
  buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
  commissionRequest: { select: { id: true, title: true, status: true } },
  artwork: { select: { id: true, title: true, slug: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
} as const;

/**
 * Centralizes "does a conversation for this exact buyer+artist+context
 * already exist?" — shared by both the standalone conversation
 * endpoint and commission creation, so a commission's associated
 * conversation is never accidentally duplicated no matter which path
 * triggers it.
 */
export async function findOrCreateConversation(params: FindOrCreateConversationParams) {
  const {
    buyerId,
    artistId,
    commissionRequestId = null,
    artworkId = null,
    orderId = null,
  } = params;

  const existing = await prisma.conversation.findFirst({
    where: { buyerId, artistId, commissionRequestId },
    include: conversationInclude,
  });
  if (existing) return existing;

  return prisma.conversation.create({
    data: { buyerId, artistId, commissionRequestId, artworkId, orderId },
    include: conversationInclude,
  });
}
