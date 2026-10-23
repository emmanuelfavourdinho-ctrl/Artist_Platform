import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import { recordAudit } from '../services/auditService.js';
import type {
  CreateContactMessageInput,
  ListContactMessagesQuery,
  RecordEmailOutcomeInput,
  UpdateContactMessageStatusInput,
} from '../validation/contact.js';

// Public — anyone can submit the contact form, no login required.
export async function createContactMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = req.body as CreateContactMessageInput;

    const created = await prisma.contactMessage.create({
      data: {
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
      },
    });

    // Only the id goes back to the browser — enough for it to later
    // report whether its own EmailJS notification succeeded, without
    // exposing the full stored record.
    res.status(201).json({ status: 'success', data: { id: created.id } });
  } catch (err) {
    next(err);
  }
}

// Public, but effectively self-limiting: the browser only knows the id
// it just received from createContactMessage above, and this is a
// one-time, idempotent status flag — not something worth gating behind
// auth. Once set, further calls are silently ignored.
export async function recordEmailOutcome(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { sent, error } = req.body as RecordEmailOutcomeInput;

    const existing = await prisma.contactMessage.findUnique({
      where: { id },
      select: { emailSentAt: true },
    });
    if (!existing) {
      res.status(404).json({ status: 'error', message: 'Message not found' });
      return;
    }
    if (existing.emailSentAt) {
      // Already recorded once — no-op, not an error.
      res.status(204).send();
      return;
    }

    await prisma.contactMessage.update({
      where: { id },
      data: sent ? { emailSentAt: new Date() } : { emailError: error ?? 'Unknown EmailJS failure' },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Admin-only from here down.
export async function listContactMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, pageSize, view } = req.query as unknown as ListContactMessagesQuery;
    const where = view === 'ARCHIVED' ? { status: 'ARCHIVED' as const } : { status: { not: 'ARCHIVED' as const } };
    const [messages, total, unreadTotal] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.contactMessage.count({ where }),
      view === 'INBOX'
        ? prisma.contactMessage.count({ where: { status: 'UNREAD' } })
        : Promise.resolve(0),
    ]);

    res.json({
      status: 'success',
      data: messages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        unreadTotal,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateContactMessageStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body as UpdateContactMessageStatusInput;

    const message = await prisma.$transaction(async (tx) => {
      const current = await tx.contactMessage.findUnique({ where: { id } });
      if (!current) {
        throw new HttpError(404, 'Message not found', { code: 'NOT_FOUND' });
      }

      if (current.status === status) return current;

      const transition = await tx.contactMessage.updateMany({
        where: { id, status: current.status },
        data: { status },
      });
      if (transition.count === 0) {
        throw new HttpError(409, 'Message status changed before this update completed', {
          code: 'CONTACT_MESSAGE_STATUS_CONFLICT',
        });
      }

      await recordAudit(tx, {
        actorId: req.user!.id,
        action: 'CONTACT_MESSAGE_STATUS_CHANGED',
        entityType: 'ContactMessage',
        entityId: id,
        requestId: req.id ?? null,
        metadata: { fromStatus: current.status, toStatus: status },
      });

      const updated = await tx.contactMessage.findUnique({ where: { id } });
      if (!updated) {
        throw new HttpError(404, 'Message not found', { code: 'NOT_FOUND' });
      }
      return updated;
    });

    res.json({ status: 'success', data: message });
  } catch (err) {
    next(err);
  }
}
