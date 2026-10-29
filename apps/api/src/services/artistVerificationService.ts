import { Prisma, type VerificationRequestStatus } from '@prisma/client';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import {
  VERIFICATION_FIELD_CATALOGUE,
  validateResponses,
  type RequestedField,
  type SubmittedResponse,
} from '../lib/verificationFields.js';
import type {
  CreateInfoRequestInput,
  DecisionInput,
  QueueQuery,
} from '../validation/artistVerification.js';
import { recordAudit } from './auditService.js';
import { createNotification } from './notificationService.js';

/*
  Explainer — the lifecycle of one request ROUND:

      AWAITING_ARTIST_INPUT --artist submits--> AWAITING_REVIEW
      AWAITING_ARTIST_INPUT --staff cancels---> CANCELLED
      AWAITING_REVIEW      --staff cancels---> CANCELLED
      AWAITING_REVIEW      --staff asks again, or decides--> COMPLETED

  Rounds are never edited: asking again creates round n+1 and closes the
  previous one. Verification status is a different thing entirely — it
  changes ONLY in decide(), by an authorised reviewer, never as a side
  effect of requesting information or receiving an answer. Every
  transition is a compare-and-set on the status we just read, so two
  people acting at once cannot both win.
*/

const OPEN: VerificationRequestStatus[] = ['AWAITING_ARTIST_INPUT', 'AWAITING_REVIEW'];

const personSelect = { id: true, firstName: true, lastName: true } as const;

function conflict(message: string, code: string) {
  return new HttpError(409, message, { code });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Staff: queue and review
// ---------------------------------------------------------------------------

export async function listQueue(query: QueueQuery) {
  const { page, pageSize, search, state } = query;

  const where: Prisma.ArtistProfileWhereInput = {
    verificationStatus: 'PENDING',
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: 'insensitive' } },
            { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
            { user: { is: { firstName: { contains: search, mode: 'insensitive' } } } },
            { user: { is: { lastName: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
    ...(state === 'NO_ACTIVE_REQUEST'
      ? { verificationRequests: { none: { status: { in: OPEN } } } }
      : state
        ? { verificationRequests: { some: { status: state } } }
        : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.artistProfile.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        displayName: true,
        location: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { artworks: true, verificationRequests: true } },
        verificationRequests: {
          where: { status: { in: OPEN } },
          take: 1,
          select: {
            id: true,
            round: true,
            status: true,
            createdAt: true,
            submission: { select: { submittedAt: true } },
          },
        },
      },
    }),
    prisma.artistProfile.count({ where }),
  ]);

  return {
    applications: rows.map(({ verificationRequests, ...artist }) => ({
      ...artist,
      openRequest: verificationRequests[0] ?? null,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function getReviewDetail(artistId: string) {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
    select: {
      id: true,
      displayName: true,
      slug: true,
      biography: true,
      artisticStatement: true,
      website: true,
      location: true,
      profileImageUrl: true,
      coverImageUrl: true,
      verificationStatus: true,
      verifiedAt: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, status: true, createdAt: true } },
      socialLinks: { select: { platform: true, url: true } },
      achievements: { select: { id: true, title: true, organization: true, year: true } },
      _count: { select: { artworks: true } },
    },
  });
  if (!artist) throw new HttpError(404, 'Artist profile not found', { code: 'ARTIST_NOT_FOUND' });

  const [requests, decisions] = await Promise.all([
    prisma.verificationInfoRequest.findMany({
      where: { artistId },
      orderBy: { round: 'asc' },
      select: {
        id: true,
        round: true,
        status: true,
        message: true,
        fields: true,
        createdAt: true,
        completedAt: true,
        cancelledAt: true,
        cancellationReason: true,
        requestedBy: { select: personSelect },
        cancelledBy: { select: personSelect },
        submission: {
          select: { responses: true, submittedAt: true, submittedBy: { select: personSelect } },
        },
      },
    }),
    prisma.artistVerificationDecision.findMany({
      where: { artistId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        decision: true,
        reason: true,
        requestId: true,
        createdAt: true,
        decidedBy: { select: personSelect },
      },
    }),
  ]);

  return { artist, requests, decisions };
}

// ---------------------------------------------------------------------------
// Staff: request, cancel, decide
// ---------------------------------------------------------------------------

export interface StaffContext {
  actorId: string;
  requestId?: string | null;
}

export async function createInfoRequest(
  artistId: string,
  input: CreateInfoRequestInput,
  ctx: StaffContext,
) {
  // Build the snapshot from the catalogue. The client supplies only the
  // type, an optional label, instructions and required — never an id.
  const fields: RequestedField[] = input.fields.map((f) => ({
    id: f.type,
    type: f.type,
    label: f.label ?? VERIFICATION_FIELD_CATALOGUE[f.type].label,
    instructions: f.instructions,
    required: f.required,
  }));

  try {
    return await prisma.$transaction(async (tx) => {
      const artist = await tx.artistProfile.findUnique({
        where: { id: artistId },
        select: { id: true, userId: true, verificationStatus: true },
      });
      if (!artist) throw new HttpError(404, 'Artist profile not found', { code: 'ARTIST_NOT_FOUND' });
      if (artist.verificationStatus !== 'PENDING') {
        throw conflict('Information can only be requested from artists awaiting verification', 'NOT_PENDING');
      }

      const open = await tx.verificationInfoRequest.findFirst({
        where: { artistId, status: { in: OPEN } },
        select: { id: true, status: true },
      });
      if (open?.status === 'AWAITING_ARTIST_INPUT') {
        throw conflict(
          'There is already an open request waiting for the artist. Cancel it first to send a new one.',
          'REQUEST_ALREADY_OPEN',
        );
      }
      if (open) {
        // Asking again after reviewing an answer closes that round.
        const closed = await tx.verificationInfoRequest.updateMany({
          where: { id: open.id, status: 'AWAITING_REVIEW' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        if (closed.count !== 1) {
          throw conflict('This application changed while you were working. Reload and try again.', 'CONCURRENT_CHANGE');
        }
      }

      const last = await tx.verificationInfoRequest.findFirst({
        where: { artistId },
        orderBy: { round: 'desc' },
        select: { round: true },
      });
      const round = (last?.round ?? 0) + 1;

      const request = await tx.verificationInfoRequest.create({
        data: {
          artistId,
          round,
          message: input.message || null,
          fields: fields as unknown as Prisma.InputJsonValue,
          requestedById: ctx.actorId,
        },
        select: { id: true, round: true, status: true, createdAt: true },
      });

      await createNotification(tx, {
        userId: artist.userId,
        type: 'VERIFICATION_INFO_REQUESTED',
        title: 'More information needed for your verification',
        message: 'Our team needs a little more information before we can verify your artist profile.',
        link: `/studio/verification/${request.id}`,
        data: { requestId: request.id, round },
      });

      await recordAudit(tx, {
        actorId: ctx.actorId,
        action: 'VERIFICATION_REQUEST_CREATED',
        entityType: 'VerificationInfoRequest',
        entityId: request.id,
        requestId: ctx.requestId,
        metadata: {
          artistId,
          round,
          fieldTypes: fields.map((f) => f.type),
          previousRequestId: open?.id ?? null,
        },
      });

      return request;
    });
  } catch (error) {
    // Two reviewers creating a round at the same moment compute the same
    // round number; the (artistId, round) unique index makes the loser fail.
    if (isUniqueViolation(error)) {
      throw conflict('Another reviewer just sent a request. Reload and try again.', 'CONCURRENT_CHANGE');
    }
    throw error;
  }
}

export async function cancelInfoRequest(requestId: string, reason: string, ctx: StaffContext) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.verificationInfoRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, round: true, artistId: true, artist: { select: { userId: true } } },
    });
    if (!request) throw new HttpError(404, 'Request not found', { code: 'REQUEST_NOT_FOUND' });
    if (!OPEN.includes(request.status)) {
      throw conflict(`This request is already ${request.status.toLowerCase()}`, 'REQUEST_NOT_CANCELLABLE');
    }

    const cancelled = await tx.verificationInfoRequest.updateMany({
      where: { id: requestId, status: request.status },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: ctx.actorId,
        cancellationReason: reason,
      },
    });
    if (cancelled.count !== 1) {
      throw conflict('This request changed while you were working. Reload and try again.', 'CONCURRENT_CHANGE');
    }

    await createNotification(tx, {
      userId: request.artist.userId,
      type: 'VERIFICATION_REQUEST_CANCELLED',
      title: 'A verification request was withdrawn',
      message: 'You no longer need to respond to the earlier request for more information.',
      link: '/studio/verification',
      data: { requestId },
    });

    await recordAudit(tx, {
      actorId: ctx.actorId,
      action: 'VERIFICATION_REQUEST_CANCELLED',
      entityType: 'VerificationInfoRequest',
      entityId: requestId,
      reason,
      requestId: ctx.requestId,
      metadata: { artistId: request.artistId, round: request.round, from: request.status },
    });

    return { id: requestId, status: 'CANCELLED' as const };
  });
}

export async function decideVerification(artistId: string, input: DecisionInput, ctx: StaffContext) {
  const approve = input.decision === 'APPROVE';
  const newStatus = approve ? 'VERIFIED' : 'REJECTED';

  return prisma.$transaction(async (tx) => {
    const artist = await tx.artistProfile.findUnique({
      where: { id: artistId },
      select: { id: true, userId: true, verificationStatus: true },
    });
    if (!artist) throw new HttpError(404, 'Artist profile not found', { code: 'ARTIST_NOT_FOUND' });
    if (artist.verificationStatus !== 'PENDING') {
      throw conflict(`This artist is already ${artist.verificationStatus.toLowerCase()}`, 'NOT_PENDING');
    }

    const open = await tx.verificationInfoRequest.findFirst({
      where: { artistId, status: { in: OPEN } },
      select: { id: true, status: true },
    });
    if (open?.status === 'AWAITING_ARTIST_INPUT') {
      throw conflict(
        'The artist has an open information request. Cancel it before making a final decision.',
        'REQUEST_OPEN',
      );
    }
    if (open) {
      const closed = await tx.verificationInfoRequest.updateMany({
        where: { id: open.id, status: 'AWAITING_REVIEW' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (closed.count !== 1) {
        throw conflict('This application changed while you were working. Reload and try again.', 'CONCURRENT_CHANGE');
      }
    }

    // The ONLY place verification status changes. Compare-and-set on PENDING.
    const updated = await tx.artistProfile.updateMany({
      where: { id: artistId, verificationStatus: 'PENDING' },
      data: { verificationStatus: newStatus, ...(approve ? { verifiedAt: new Date() } : {}) },
    });
    if (updated.count !== 1) {
      throw conflict('This application was decided by someone else. Reload to see the outcome.', 'CONCURRENT_CHANGE');
    }

    const decision = await tx.artistVerificationDecision.create({
      data: {
        artistId,
        decision: newStatus,
        reason: input.reason || null,
        requestId: open?.id ?? null,
        decidedById: ctx.actorId,
      },
      select: { id: true },
    });

    await createNotification(tx, {
      userId: artist.userId,
      type: 'VERIFICATION_DECISION',
      title: approve ? 'Your artist profile is verified' : 'Your verification was not approved',
      message: approve
        ? 'Congratulations — you can now sell on Fine Arts and accept commissions.'
        : 'We were unable to verify your artist profile. Contact support if you would like to know more.',
      link: '/studio/verification',
      data: { decision: newStatus },
    });

    await recordAudit(tx, {
      actorId: ctx.actorId,
      action: 'ARTIST_VERIFICATION_CHANGED',
      entityType: 'ArtistProfile',
      entityId: artistId,
      reason: input.reason || null,
      requestId: ctx.requestId,
      metadata: { from: 'PENDING', to: newStatus, decisionId: decision.id, requestId: open?.id ?? null },
    });

    return { artistId, verificationStatus: newStatus };
  });
}

// ---------------------------------------------------------------------------
// Artist: own tasks only. Ownership is ALWAYS derived from the signed-in user
// (artist.userId = req.user.id) — a request id from the browser is never
// enough on its own, so guessing another artist's id returns 404.
// ---------------------------------------------------------------------------

const artistRequestSelect = {
  id: true,
  round: true,
  status: true,
  message: true,
  fields: true,
  createdAt: true,
  completedAt: true,
  cancelledAt: true,
  submission: { select: { responses: true, submittedAt: true } },
} as const;

export async function getOwnVerification(userId: string) {
  const artist = await prisma.artistProfile.findUnique({
    where: { userId },
    select: { id: true, verificationStatus: true },
  });
  if (!artist) throw new HttpError(404, 'Artist profile not found', { code: 'ARTIST_PROFILE_NOT_FOUND' });

  const [requests, latestDecision] = await Promise.all([
    prisma.verificationInfoRequest.findMany({
      where: { artistId: artist.id },
      orderBy: { round: 'desc' },
      select: artistRequestSelect,
    }),
    prisma.artistVerificationDecision.findFirst({
      where: { artistId: artist.id },
      orderBy: { createdAt: 'desc' },
      select: { decision: true, reason: true, createdAt: true },
    }),
  ]);

  return {
    verificationStatus: artist.verificationStatus,
    latestDecision,
    activeRequest: requests.find((r) => OPEN.includes(r.status)) ?? null,
    history: requests.filter((r) => !OPEN.includes(r.status)),
  };
}

export async function getOwnRequest(userId: string, requestId: string) {
  const request = await prisma.verificationInfoRequest.findFirst({
    where: { id: requestId, artist: { is: { userId } } },
    select: artistRequestSelect,
  });
  if (!request) throw new HttpError(404, 'Request not found', { code: 'REQUEST_NOT_FOUND' });
  return request;
}

export async function submitOwnResponse(
  userId: string,
  requestId: string,
  responses: SubmittedResponse[],
  ctx: { requestId?: string | null } = {},
) {
  const request = await prisma.verificationInfoRequest.findFirst({
    where: { id: requestId, artist: { is: { userId } } },
    select: {
      id: true,
      round: true,
      status: true,
      fields: true,
      artistId: true,
      artist: { select: { verificationStatus: true } },
    },
  });
  if (!request) throw new HttpError(404, 'Request not found', { code: 'REQUEST_NOT_FOUND' });

  if (request.artist.verificationStatus !== 'PENDING') {
    throw conflict('Your application has already been decided', 'NOT_PENDING');
  }
  rejectIfNotSubmittable(request.status);

  // Validate against the STORED snapshot, never against client claims.
  const cleaned = validateResponses(request.fields as unknown as RequestedField[], responses);

  try {
    return await prisma.$transaction(async (tx) => {
      const moved = await tx.verificationInfoRequest.updateMany({
        where: { id: requestId, status: 'AWAITING_ARTIST_INPUT' },
        data: { status: 'AWAITING_REVIEW' },
      });
      if (moved.count !== 1) {
        throw conflict('This request is no longer accepting a response', 'REQUEST_NOT_SUBMITTABLE');
      }

      const submission = await tx.verificationSubmission.create({
        data: {
          requestId,
          submittedById: userId,
          responses: cleaned as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, submittedAt: true },
      });

      // Audit the fact and shape of the submission, never its contents.
      await recordAudit(tx, {
        actorId: userId,
        action: 'VERIFICATION_RESPONSE_SUBMITTED',
        entityType: 'VerificationInfoRequest',
        entityId: requestId,
        requestId: ctx.requestId,
        metadata: {
          artistId: request.artistId,
          round: request.round,
          fieldIds: cleaned.map((r) => r.fieldId),
        },
      });

      return { id: requestId, status: 'AWAITING_REVIEW' as const, submittedAt: submission.submittedAt };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('A response has already been submitted for this request', 'ALREADY_SUBMITTED');
    }
    throw error;
  }
}

function rejectIfNotSubmittable(status: VerificationRequestStatus) {
  if (status === 'AWAITING_ARTIST_INPUT') return;
  if (status === 'AWAITING_REVIEW') {
    throw conflict('A response has already been submitted and is awaiting review', 'ALREADY_SUBMITTED');
  }
  if (status === 'CANCELLED') throw conflict('This request was withdrawn', 'REQUEST_CANCELLED');
  throw conflict('This request is closed', 'REQUEST_CLOSED');
}
