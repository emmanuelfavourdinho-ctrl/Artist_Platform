import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/httpError.js';
import type { CreateContactMessageInput, RecordEmailOutcomeInput } from '../validation/contact.js';

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
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: messages });
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
    const { status } = req.body as { status: string };

    const message = await prisma.contactMessage.update({
      where: { id },
      data: { status: status as never },
    });

    res.json({ status: 'success', data: message });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      next(new HttpError(404, 'Message not found', { code: 'NOT_FOUND' }));
      return;
    }
    next(err);
  }
}
