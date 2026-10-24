import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => {
  const prisma = {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    artistProfile: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    verificationInfoRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    verificationSubmission: { create: vi.fn() },
    artistVerificationDecision: { create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notification: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    artwork: { findMany: vi.fn() },
    checkoutIntent: { findUnique: vi.fn().mockResolvedValue(null) },
    commissionRequest: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';
import { createNotification, isSafeLink } from '../services/notificationService.js';

const ACTOR = '22222222-2222-4222-8222-222222222222';
const ARTIST = '33333333-3333-4333-8333-333333333333';
const ARTIST_USER = '44444444-4444-4444-8444-444444444444';
const REQ = '55555555-5555-4555-8555-555555555555';
const OTHER_REQ = '66666666-6666-4666-8666-666666666666';

function sessionAs(roles: string[], id = ACTOR) {
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'fb', email: 'a@x.com' } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id,
    email: 'a@x.com',
    status: 'ACTIVE',
    roles: roles.map((name) => ({ role: { name } })),
  } as never);
}

const withAuth = (r: request.Test) => r.set('Authorization', 'Bearer t');
const get = (p: string) => withAuth(request(app).get(p));
const post = (p: string, body: unknown) => withAuth(request(app).post(p).send(body as object));
const patch = (p: string, body: unknown) => withAuth(request(app).patch(p).send(body as object));

const base = '/api/v1/admin/artist-verification';
const goodRequest = {
  message: 'Please help us confirm your work',
  fields: [
    { type: 'PORTFOLIO_URL', instructions: 'Link to your online portfolio', required: true },
    { type: 'ADDITIONAL_DETAILS', label: 'About your process', instructions: 'Describe how you work', required: false },
  ],
};

const storedFields = [
  { id: 'PORTFOLIO_URL', type: 'PORTFOLIO_URL', label: 'Portfolio link', instructions: 'Link', required: true },
  { id: 'ADDITIONAL_DETAILS', type: 'ADDITIONAL_DETAILS', label: 'Additional details', instructions: 'Tell us', required: false },
];

function pendingArtist(status = 'PENDING') {
  vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({
    id: ARTIST,
    userId: ARTIST_USER,
    verificationStatus: status,
  } as never);
}
const noOpenRequest = () => vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue(null as never);

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): a test that makes a mock reject must
  // not leak that rejection into the next test.
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prisma)) as never);
  vi.mocked(prisma.verificationInfoRequest.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(prisma.artistProfile.updateMany).mockResolvedValue({ count: 1 } as never);
});

describe('staff access control', () => {
  it('401 anonymous, 403 for buyers and for staff without artists.review', async () => {
    expect((await request(app).get(base)).status).toBe(401);
    sessionAs(['BUYER']);
    expect((await get(base)).status).toBe(403);
    sessionAs(['FINANCE_ADMIN']);
    const res = await get(base);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
    sessionAs(['FINANCE_ADMIN']);
    expect((await post(`${base}/${ARTIST}/requests`, goodRequest)).status).toBe(403);
    expect((await post(`${base}/${ARTIST}/decision`, { decision: 'APPROVE' })).status).toBe(403);
    expect(prisma.verificationInfoRequest.create).not.toHaveBeenCalled();
  });
});

describe('GET queue', () => {
  it.each(['?state=BOGUS', '?pageSize=500', '?page=0'])('rejects invalid query %s', async (q) => {
    sessionAs(['MODERATOR']);
    expect((await get(`${base}${q}`)).status).toBe(400);
    expect(prisma.artistProfile.findMany).not.toHaveBeenCalled();
  });

  it('lists only PENDING applications, filters by state, paginates, and omits emails', async () => {
    sessionAs(['MODERATOR']);
    vi.mocked(prisma.artistProfile.findMany).mockResolvedValue([
      {
        id: ARTIST,
        displayName: 'Ada',
        location: null,
        createdAt: new Date('2026-01-01'),
        user: { firstName: 'Ada', lastName: 'L' },
        _count: { artworks: 2, verificationRequests: 1 },
        verificationRequests: [{ id: REQ, round: 1, status: 'AWAITING_REVIEW', createdAt: new Date(), submission: { submittedAt: new Date() } }],
      },
    ] as never);
    vi.mocked(prisma.artistProfile.count).mockResolvedValue(21 as never);

    const res = await get(`${base}?state=AWAITING_REVIEW&search=ada&page=2&pageSize=10`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].openRequest.status).toBe('AWAITING_REVIEW');
    expect(res.body.data[0]).not.toHaveProperty('verificationRequests');
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 10, total: 21, totalPages: 3 });

    const args = vi.mocked(prisma.artistProfile.findMany).mock.calls[0]![0] as {
      where: Record<string, unknown>;
      select: { user: { select: Record<string, unknown> } };
      skip: number;
    };
    expect(args.where.verificationStatus).toBe('PENDING');
    expect(args.where.verificationRequests).toEqual({ some: { status: 'AWAITING_REVIEW' } });
    expect(args.skip).toBe(10);
    expect(args.select.user.select).not.toHaveProperty('email');
  });

  it('NO_ACTIVE_REQUEST includes artists with cancelled historical rounds', async () => {
    sessionAs(['MODERATOR']);
    vi.mocked(prisma.artistProfile.findMany).mockResolvedValue([
      {
        id: ARTIST,
        displayName: 'Ada',
        location: null,
        createdAt: new Date('2026-01-01'),
        user: { firstName: 'Ada', lastName: 'L' },
        _count: { artworks: 0, verificationRequests: 1 },
        verificationRequests: [],
      },
    ] as never);
    vi.mocked(prisma.artistProfile.count).mockResolvedValue(1 as never);
    const res = await get(`${base}?state=NO_ACTIVE_REQUEST`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].openRequest).toBeNull();
    expect(res.body.data[0]._count.verificationRequests).toBe(1);

    const where = (vi.mocked(prisma.artistProfile.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where.verificationRequests).toEqual({ none: { status: { in: ['AWAITING_ARTIST_INPUT', 'AWAITING_REVIEW'] } } });
  });
});

describe('POST create information request', () => {
  const url = `${base}/${ARTIST}/requests`;

  it.each([
    ['an unsupported field type', { fields: [{ type: 'ID_DOCUMENT_UPLOAD', instructions: 'x', required: true }] }],
    ['no fields', { fields: [] }],
    ['a duplicate type', { fields: [goodRequest.fields[0], goodRequest.fields[0]] }],
    ['missing instructions', { fields: [{ type: 'PORTFOLIO_URL', required: true }] }],
    ['missing required flag', { fields: [{ type: 'PORTFOLIO_URL', instructions: 'x' }] }],
    ['a client-supplied status', { ...goodRequest, status: 'COMPLETED' }],
    ['a client-supplied artist id', { ...goodRequest, artistId: ARTIST }],
    ['a client-supplied verification status', { ...goodRequest, verificationStatus: 'VERIFIED' }],
    ['a client-supplied field id', { fields: [{ id: 'x', type: 'PORTFOLIO_URL', instructions: 'x', required: true }] }],
    ['an oversize message', { ...goodRequest, message: 'x'.repeat(1001) }],
  ])('rejects %s without touching the database', async (_l, body) => {
    sessionAs(['MODERATOR']);
    const res = await post(url, body);
    expect(res.status).toBe(400);
    expect(prisma.verificationInfoRequest.create).not.toHaveBeenCalled();
    expect(prisma.artistProfile.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed artist id and a missing artist', async () => {
    sessionAs(['MODERATOR']);
    expect((await post(`${base}/not-a-uuid/requests`, goodRequest)).status).toBe(400);
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue(null as never);
    expect((await post(url, goodRequest)).status).toBe(404);
  });

  it('only works for artists awaiting verification', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist('VERIFIED');
    const res = await post(url, goodRequest);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_PENDING');
  });

  it('blocks a second request while one is waiting for the artist', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue({ id: REQ, status: 'AWAITING_ARTIST_INPUT' } as never);
    const res = await post(url, goodRequest);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REQUEST_ALREADY_OPEN');
    expect(prisma.verificationInfoRequest.create).not.toHaveBeenCalled();
  });

  it('creates round 1 with a catalogue snapshot, a notification and an audit record — and never verifies the artist', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst)
      .mockResolvedValueOnce(null as never) // open request?
      .mockResolvedValueOnce(null as never); // last round?
    vi.mocked(prisma.verificationInfoRequest.create).mockResolvedValue({ id: REQ, round: 1, status: 'AWAITING_ARTIST_INPUT', createdAt: new Date() } as never);

    const res = await post(url, goodRequest);

    expect(res.status).toBe(201);
    const created = vi.mocked(prisma.verificationInfoRequest.create).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(created.data).toMatchObject({ artistId: ARTIST, round: 1, requestedById: ACTOR });
    expect(created.data.fields).toEqual([
      { id: 'PORTFOLIO_URL', type: 'PORTFOLIO_URL', label: 'Portfolio link', instructions: 'Link to your online portfolio', required: true },
      { id: 'ADDITIONAL_DETAILS', type: 'ADDITIONAL_DETAILS', label: 'About your process', instructions: 'Describe how you work', required: false },
    ]);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: ARTIST_USER,
        type: 'VERIFICATION_INFO_REQUESTED',
        data: expect.objectContaining({ link: `/studio/verification/${REQ}`, requestId: REQ }),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: ACTOR,
        action: 'VERIFICATION_REQUEST_CREATED',
        entityId: REQ,
        metadata: expect.objectContaining({ artistId: ARTIST, round: 1, fieldTypes: ['PORTFOLIO_URL', 'ADDITIONAL_DETAILS'] }),
      }),
    });
    // The critical rule.
    expect(prisma.artistProfile.updateMany).not.toHaveBeenCalled();
  });

  it('asking again after a submission closes the old round and creates round n+1', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst)
      .mockResolvedValueOnce({ id: OTHER_REQ, status: 'AWAITING_REVIEW' } as never)
      .mockResolvedValueOnce({ round: 2 } as never);
    vi.mocked(prisma.verificationInfoRequest.create).mockResolvedValue({ id: REQ, round: 3, status: 'AWAITING_ARTIST_INPUT', createdAt: new Date() } as never);

    const res = await post(url, goodRequest);

    expect(res.status).toBe(201);
    expect(prisma.verificationInfoRequest.updateMany).toHaveBeenCalledWith({
      where: { id: OTHER_REQ, status: 'AWAITING_REVIEW' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
    expect((vi.mocked(prisma.verificationInfoRequest.create).mock.calls[0]![0] as { data: { round: number } }).data.round).toBe(3);
  });

  it('409s if the previous round changed under us, and on a concurrent duplicate round', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue({ id: OTHER_REQ, status: 'AWAITING_REVIEW' } as never);
    vi.mocked(prisma.verificationInfoRequest.updateMany).mockResolvedValue({ count: 0 } as never);
    const lost = await post(url, goodRequest);
    expect(lost.status).toBe(409);
    expect(lost.body.code).toBe('CONCURRENT_CHANGE');
    expect(prisma.verificationInfoRequest.create).not.toHaveBeenCalled();

    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValueOnce(null as never).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.verificationInfoRequest.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    const dup = await post(url, goodRequest);
    expect(dup.status).toBe(409);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails the whole operation when the audit write fails (nothing claims success)', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.verificationInfoRequest.create).mockResolvedValue({ id: REQ, round: 1, status: 'AWAITING_ARTIST_INPUT', createdAt: new Date() } as never);
    vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('db down'));
    const res = await post(url, goodRequest);
    expect(res.status).toBe(500);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('POST cancel information request', () => {
  const url = `${base}/requests/${REQ}/cancel`;
  const reason = 'Artist emailed the details to support';

  it('requires a reason and rejects extra keys', async () => {
    sessionAs(['MODERATOR']);
    expect((await post(url, {})).status).toBe(400);
    expect((await post(url, { reason: 'short' })).status).toBe(400);
    expect((await post(url, { reason, status: 'COMPLETED' })).status).toBe(400);
  });

  it('404 when missing, 409 when already closed', async () => {
    sessionAs(['MODERATOR']);
    vi.mocked(prisma.verificationInfoRequest.findUnique).mockResolvedValue(null as never);
    expect((await post(url, { reason })).status).toBe(404);
    vi.mocked(prisma.verificationInfoRequest.findUnique).mockResolvedValue({ id: REQ, status: 'COMPLETED', round: 1, artistId: ARTIST, artist: { userId: ARTIST_USER } } as never);
    const res = await post(url, { reason });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REQUEST_NOT_CANCELLABLE');
  });

  it('cancels with compare-and-set, keeps the reason, notifies and audits', async () => {
    sessionAs(['MODERATOR']);
    vi.mocked(prisma.verificationInfoRequest.findUnique).mockResolvedValue({ id: REQ, status: 'AWAITING_ARTIST_INPUT', round: 2, artistId: ARTIST, artist: { userId: ARTIST_USER } } as never);
    const res = await post(url, { reason });
    expect(res.status).toBe(200);
    expect(prisma.verificationInfoRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQ, status: 'AWAITING_ARTIST_INPUT' },
      data: expect.objectContaining({ status: 'CANCELLED', cancelledById: ACTOR, cancellationReason: reason }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'VERIFICATION_REQUEST_CANCELLED', reason, entityId: REQ }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: ARTIST_USER, type: 'VERIFICATION_REQUEST_CANCELLED' }),
    });
  });

  it('409s when the request changed concurrently', async () => {
    sessionAs(['MODERATOR']);
    vi.mocked(prisma.verificationInfoRequest.findUnique).mockResolvedValue({ id: REQ, status: 'AWAITING_REVIEW', round: 1, artistId: ARTIST, artist: { userId: ARTIST_USER } } as never);
    vi.mocked(prisma.verificationInfoRequest.updateMany).mockResolvedValue({ count: 0 } as never);
    expect((await post(url, { reason })).status).toBe(409);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('POST final decision', () => {
  const url = `${base}/${ARTIST}/decision`;

  it('validates the body: reason needed to reject, unknown keys refused', async () => {
    sessionAs(['MODERATOR']);
    expect((await post(url, { decision: 'REJECT' })).status).toBe(400);
    expect((await post(url, { decision: 'REJECT', reason: 'too short' })).status).toBe(400);
    expect((await post(url, { decision: 'MAYBE' })).status).toBe(400);
    expect((await post(url, { decision: 'APPROVE', verificationStatus: 'VERIFIED' })).status).toBe(400);
    expect(prisma.artistProfile.updateMany).not.toHaveBeenCalled();
  });

  it('approves: compare-and-set on PENDING, immutable decision row, audit, notification', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    noOpenRequest();
    vi.mocked(prisma.artistVerificationDecision.create).mockResolvedValue({ id: 'dec-1' } as never);
    const res = await post(url, { decision: 'APPROVE' });
    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('VERIFIED');
    expect(prisma.artistProfile.updateMany).toHaveBeenCalledWith({
      where: { id: ARTIST, verificationStatus: 'PENDING' },
      data: { verificationStatus: 'VERIFIED', verifiedAt: expect.any(Date) },
    });
    expect(prisma.artistVerificationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ artistId: ARTIST, decision: 'VERIFIED', decidedById: ACTOR }),
      select: { id: true },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ARTIST_VERIFICATION_CHANGED',
        entityType: 'ArtistProfile',
        metadata: expect.objectContaining({ from: 'PENDING', to: 'VERIFIED', decisionId: 'dec-1' }),
      }),
    });
  });

  it('rejects with a reason, completes the reviewed round, and keeps the reason internal', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue({ id: REQ, status: 'AWAITING_REVIEW' } as never);
    vi.mocked(prisma.artistVerificationDecision.create).mockResolvedValue({ id: 'dec-2' } as never);
    const reason = 'Portfolio does not match the submitted identity';
    const res = await post(url, { decision: 'REJECT', reason });
    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('REJECTED');
    expect(prisma.verificationInfoRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQ, status: 'AWAITING_REVIEW' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
    expect(prisma.artistVerificationDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ decision: 'REJECTED', reason, requestId: REQ }),
      select: { id: true },
    });
    const notice = vi.mocked(prisma.notification.create).mock.calls[0]![0] as { data: { message: string } };
    expect(notice.data.message).not.toContain('Portfolio does not match');
  });

  it('refuses while the artist still owes an answer, or when already decided, or when raced', async () => {
    sessionAs(['MODERATOR']);
    pendingArtist();
    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue({ id: REQ, status: 'AWAITING_ARTIST_INPUT' } as never);
    const open = await post(url, { decision: 'APPROVE' });
    expect(open.status).toBe(409);
    expect(open.body.code).toBe('REQUEST_OPEN');

    pendingArtist('VERIFIED');
    expect((await post(url, { decision: 'APPROVE' })).body.code).toBe('NOT_PENDING');

    pendingArtist();
    noOpenRequest();
    vi.mocked(prisma.artistProfile.updateMany).mockResolvedValue({ count: 0 } as never);
    const raced = await post(url, { decision: 'APPROVE' });
    expect(raced.status).toBe(409);
    expect(raced.body.code).toBe('CONCURRENT_CHANGE');
    expect(prisma.artistVerificationDecision.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('artist: own verification tasks', () => {
  const own = '/api/v1/studio/verification';
  const submit = (id: string, body: unknown) => post(`${own}/requests/${id}/submission`, body);

  it('is for artists only', async () => {
    sessionAs(['BUYER']);
    const res = await get(own);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ARTIST_ROLE_REQUIRED');
  });

  it('returns the active task and history without staff-internal fields', async () => {
    sessionAs(['ARTIST'], ARTIST_USER);
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({ id: ARTIST, verificationStatus: 'PENDING' } as never);
    vi.mocked(prisma.verificationInfoRequest.findMany).mockResolvedValue([
      { id: REQ, round: 2, status: 'AWAITING_ARTIST_INPUT', fields: storedFields, message: null, createdAt: new Date(), completedAt: null, cancelledAt: null, submission: null },
      { id: OTHER_REQ, round: 1, status: 'COMPLETED', fields: storedFields, message: null, createdAt: new Date(), completedAt: new Date(), cancelledAt: null, submission: { responses: [], submittedAt: new Date() } },
    ] as never);
    const res = await get(own);
    expect(res.status).toBe(200);
    expect(res.body.data.activeRequest.id).toBe(REQ);
    expect(res.body.data.history.map((r: { id: string }) => r.id)).toEqual([OTHER_REQ]);
    const select = (vi.mocked(prisma.verificationInfoRequest.findMany).mock.calls[0]![0] as { select: Record<string, unknown> }).select;
    for (const internal of ['requestedBy', 'cancelledBy', 'cancellationReason', 'requestedById']) {
      expect(select).not.toHaveProperty(internal);
    }
  });

  it('scopes every lookup to the signed-in artist: another artist’s valid id is a 404', async () => {
    sessionAs(['ARTIST'], ARTIST_USER);
    vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue(null as never);

    const read = await get(`${own}/requests/${OTHER_REQ}`);
    expect(read.status).toBe(404);
    expect(vi.mocked(prisma.verificationInfoRequest.findFirst).mock.calls[0]![0]).toMatchObject({
      where: { id: OTHER_REQ, artist: { is: { userId: ARTIST_USER } } },
    });

    const write = await submit(OTHER_REQ, { responses: [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example' }] });
    expect(write.status).toBe(404);
    expect(prisma.verificationInfoRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.verificationSubmission.create).not.toHaveBeenCalled();
  });

  describe('submission', () => {
    const open = (over: Record<string, unknown> = {}) =>
      vi.mocked(prisma.verificationInfoRequest.findFirst).mockResolvedValue({
        id: REQ, round: 1, status: 'AWAITING_ARTIST_INPUT', fields: storedFields, artistId: ARTIST,
        artist: { verificationStatus: 'PENDING' }, ...over,
      } as never);
    const ok = { responses: [{ fieldId: 'PORTFOLIO_URL', value: '  https://portfolio.example/me  ' }, { fieldId: 'ADDITIONAL_DETAILS', value: 'I paint in oils.' }] };

    beforeEach(() => sessionAs(['ARTIST'], ARTIST_USER));

    it.each([
      ['unknown top-level keys', { ...ok, status: 'COMPLETED' }],
      ['client-supplied field definitions', { ...ok, fields: [] }],
      ['an unknown key inside a response', { responses: [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example', required: false }] }],
      ['a non-array body', { responses: 'nope' }],
    ])('rejects %s', async (_l, body) => {
      open();
      expect((await submit(REQ, body)).status).toBe(400);
      expect(prisma.verificationSubmission.create).not.toHaveBeenCalled();
    });

    it.each([
      ['an unrequested field id', [{ fieldId: 'ID_DOCUMENT', value: 'x' }, { fieldId: 'PORTFOLIO_URL', value: 'https://a.example' }], 'ID_DOCUMENT'],
      ['a duplicated field', [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example' }, { fieldId: 'PORTFOLIO_URL', value: 'https://b.example' }], 'PORTFOLIO_URL'],
      ['an empty required field', [{ fieldId: 'PORTFOLIO_URL', value: '   ' }], 'PORTFOLIO_URL'],
      ['an http link', [{ fieldId: 'PORTFOLIO_URL', value: 'http://a.example/work' }], 'PORTFOLIO_URL'],
      ['a javascript: link', [{ fieldId: 'PORTFOLIO_URL', value: 'javascript:alert(1)' }], 'PORTFOLIO_URL'],
      ['a data: link', [{ fieldId: 'PORTFOLIO_URL', value: 'data:text/html,example' }], 'PORTFOLIO_URL'],
      ['an ftp link', [{ fieldId: 'PORTFOLIO_URL', value: 'ftp://files.example/a' }], 'PORTFOLIO_URL'],
      ['a relative link', [{ fieldId: 'PORTFOLIO_URL', value: '/artist/portfolio' }], 'PORTFOLIO_URL'],
      ['a link with credentials', [{ fieldId: 'PORTFOLIO_URL', value: 'https://user:pass@a.example' }], 'PORTFOLIO_URL'],
      ['a malformed link', [{ fieldId: 'PORTFOLIO_URL', value: 'not a url' }], 'PORTFOLIO_URL'],
      ['an HTTPS URL without a hostname', [{ fieldId: 'PORTFOLIO_URL', value: 'https:///work' }], 'PORTFOLIO_URL'],
      ['a URL containing a control character', [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example/\nwork' }], 'PORTFOLIO_URL'],
      ['an oversize link', [{ fieldId: 'PORTFOLIO_URL', value: `https://a.example/${'x'.repeat(2100)}` }], 'PORTFOLIO_URL'],
      ['oversize text', [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example' }, { fieldId: 'ADDITIONAL_DETAILS', value: 'x'.repeat(5001) }], 'ADDITIONAL_DETAILS'],
    ])('rejects %s with a field-level error', async (_l, responses, path) => {
      open();
      const res = await submit(REQ, { responses });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { path: string }) => d.path)).toContain(path);
      expect(prisma.verificationSubmission.create).not.toHaveBeenCalled();
    });

    it('validates against the STORED definition, not the client’s claims', async () => {
      open({ fields: [storedFields[1]] }); // only ADDITIONAL_DETAILS was requested
      const res = await submit(REQ, { responses: [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example' }] });
      expect(res.status).toBe(400);
      expect(res.body.details[0].message).toMatch(/not requested/);
    });

    it('accepts a valid answer, cleans it, moves to AWAITING_REVIEW, and audits without the content', async () => {
      open();
      vi.mocked(prisma.verificationSubmission.create).mockResolvedValue({ id: 's1', submittedAt: new Date() } as never);
      const res = await submit(REQ, ok);
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('AWAITING_REVIEW');
      expect(prisma.verificationInfoRequest.updateMany).toHaveBeenCalledWith({
        where: { id: REQ, status: 'AWAITING_ARTIST_INPUT' },
        data: { status: 'AWAITING_REVIEW' },
      });
      expect(prisma.verificationSubmission.create).toHaveBeenCalledWith({
        data: {
          requestId: REQ,
          submittedById: ARTIST_USER,
          responses: [
            { fieldId: 'PORTFOLIO_URL', value: 'https://portfolio.example/me' },
            { fieldId: 'ADDITIONAL_DETAILS', value: 'I paint in oils.' },
          ],
        },
        select: { id: true, submittedAt: true },
      });
      const audit = vi.mocked(prisma.auditLog.create).mock.calls[0]![0] as { data: { action: string; metadata: unknown } };
      expect(audit.data.action).toBe('VERIFICATION_RESPONSE_SUBMITTED');
      expect(JSON.stringify(audit.data.metadata)).not.toContain('portfolio.example');
      expect(JSON.stringify(audit.data.metadata)).not.toContain('oils');
      // Submitting never verifies anyone.
      expect(prisma.artistProfile.updateMany).not.toHaveBeenCalled();
    });

    it('allows leaving an optional field empty', async () => {
      open();
      vi.mocked(prisma.verificationSubmission.create).mockResolvedValue({ id: 's1', submittedAt: new Date() } as never);
      const res = await submit(REQ, { responses: [{ fieldId: 'PORTFOLIO_URL', value: 'https://a.example' }, { fieldId: 'ADDITIONAL_DETAILS', value: '  ' }] });
      expect(res.status).toBe(201);
      expect((vi.mocked(prisma.verificationSubmission.create).mock.calls[0]![0] as unknown as { data: { responses: unknown[] } }).data.responses).toHaveLength(1);
    });

    it.each([
      ['AWAITING_REVIEW', 'ALREADY_SUBMITTED'],
      ['CANCELLED', 'REQUEST_CANCELLED'],
      ['COMPLETED', 'REQUEST_CLOSED'],
    ])('refuses a %s request with 409 %s', async (status, code) => {
      open({ status });
      const res = await submit(REQ, ok);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(code);
      expect(prisma.verificationSubmission.create).not.toHaveBeenCalled();
    });

    it('refuses once the application has been decided', async () => {
      open({ artist: { verificationStatus: 'VERIFIED' } });
      expect((await submit(REQ, ok)).body.code).toBe('NOT_PENDING');
    });

    it('survives double-submit and races: only one submission can win', async () => {
      open();
      vi.mocked(prisma.verificationInfoRequest.updateMany).mockResolvedValue({ count: 0 } as never);
      expect((await submit(REQ, ok)).status).toBe(409);
      expect(prisma.verificationSubmission.create).not.toHaveBeenCalled();

      vi.mocked(prisma.verificationInfoRequest.updateMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.verificationSubmission.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );
      const dup = await submit(REQ, ok);
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('ALREADY_SUBMITTED');
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});

describe('notifications API', () => {
  it('is mounted and requires authentication', async () => {
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
    expect((await request(app).patch('/api/v1/notifications/read').send({})).status).toBe(401);
  });

  it('lists only the signed-in user’s notifications with a normalised link and read flag', async () => {
    sessionAs(['ARTIST'], ARTIST_USER);
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      { id: 'n1', type: 'VERIFICATION_INFO_REQUESTED', title: 't', message: 'm', data: { link: `/studio/verification/${REQ}` }, readAt: null, createdAt: new Date() },
      { id: 'n2', type: 'X', title: 't', message: 'm', data: { link: 'https://evil.example/phish' }, readAt: new Date(), createdAt: new Date() },
      { id: 'n3', type: 'X', title: 't', message: 'm', data: { link: '//evil.example' }, readAt: null, createdAt: new Date() },
      { id: 'n5', type: 'X', title: 't', message: 'm', data: { link: '/\\evil.example' }, readAt: null, createdAt: new Date() },
      { id: 'n6', type: 'X', title: 't', message: 'm', data: { link: 'javascript:alert(1)' }, readAt: null, createdAt: new Date() },
      { id: 'n7', type: 'X', title: 't', message: 'm', data: { link: '/%ZZ' }, readAt: null, createdAt: new Date() },
      { id: 'n8', type: 'X', title: 't', message: 'm', data: { link: '/studio/verification/\nexternal' }, readAt: null, createdAt: new Date() },
      { id: 'n4', type: 'X', title: 't', message: 'm', data: null, readAt: null, createdAt: new Date() },
    ] as never);
    vi.mocked(prisma.notification.count).mockResolvedValue(3 as never);

    const res = await get('/api/v1/notifications');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.notifications.map((n: { id: string }) => [n.id, n]));
    expect(byId.n1).toMatchObject({ link: `/studio/verification/${REQ}`, read: false });
    expect(byId.n2).toMatchObject({ link: null, read: true });
    for (const id of ['n3', 'n5', 'n6', 'n7', 'n8']) expect(byId[id].link).toBeNull();
    expect(byId.n4.link).toBeNull();
    expect(res.body.data.unreadCount).toBe(3);
    expect(vi.mocked(prisma.notification.findMany).mock.calls[0]![0]).toMatchObject({ where: { userId: ARTIST_USER } });
    expect(vi.mocked(prisma.notification.count).mock.calls[0]![0]).toMatchObject({ where: { userId: ARTIST_USER, readAt: null } });
  });

  it('accepts valid internal paths and rejects crafted destinations before storage', () => {
    const validLinks = ['/studio/verification', `/studio/verification/${REQ}`, '/studio/verification?tab=history'];
    for (const link of validLinks) expect(isSafeLink(link)).toBe(true);

    createNotification(prisma, {
      userId: ARTIST_USER,
      type: 'VERIFICATION_INFO_REQUESTED',
      title: 'More information needed',
      message: 'Please respond to your verification request.',
      link: `/studio/verification/${REQ}`,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ data: { link: `/studio/verification/${REQ}` } }),
    });

    const unsafeLinks = [
      '//evil.example',
      '/\\evil.example',
      '/\\\\evil.example',
      'https://evil.example',
      'javascript:alert(1)',
      'data:text/html,example',
      '/%ZZ',
      '/%5cevil.example',
      '/studio/verification/\nexternal',
    ];
    for (const link of unsafeLinks) {
      expect(isSafeLink(link)).toBe(false);
      expect(() =>
        createNotification(prisma, {
          userId: ARTIST_USER,
          type: 'X',
          title: 't',
          message: 'm',
          link,
        }),
      ).toThrow('Notification link must be an app-relative path');
    }
  });

  it('marks as read only the caller’s own notifications, and does not delete anything', async () => {
    sessionAs(['ARTIST'], ARTIST_USER);
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 } as never);
    const id = '77777777-7777-4777-8777-777777777777';
    const res = await patch('/api/v1/notifications/read', { notificationIds: [id] });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: ARTIST_USER, readAt: null, id: { in: [id] } },
      data: { readAt: expect.any(Date) },
    });

    await patch('/api/v1/notifications/read', {});
    expect((vi.mocked(prisma.notification.updateMany).mock.calls[1]![0] as { where: Record<string, unknown> }).where).toEqual({ userId: ARTIST_USER, readAt: null });
  });

  it('validates the read payload', async () => {
    sessionAs(['ARTIST'], ARTIST_USER);
    expect((await patch('/api/v1/notifications/read', { notificationIds: ['nope'] })).status).toBe(400);
    expect((await patch('/api/v1/notifications/read', { notificationIds: [] })).status).toBe(400);
    expect((await patch('/api/v1/notifications/read', { userId: 'someone-else' })).status).toBe(400);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('verification gates on marketplace operations', () => {
  const commissionBody = {
    artistId: ARTIST,
    title: 'Family portrait',
    description: 'An oil portrait of my family, roughly 60x80cm, warm palette.',
  };

  it('does not accept new commission requests for an unverified artist', async () => {
    sessionAs(['BUYER'], ACTOR);
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({ id: ARTIST, verificationStatus: 'PENDING' } as never);
    const res = await post('/api/v1/commissions', commissionBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ARTIST_NOT_VERIFIED');
    expect(prisma.commissionRequest.create).not.toHaveBeenCalled();
  });

  it('still accepts commission requests for a verified artist', async () => {
    sessionAs(['BUYER'], ACTOR);
    vi.mocked(prisma.artistProfile.findUnique).mockResolvedValue({ id: ARTIST, verificationStatus: 'VERIFIED' } as never);
    vi.mocked(prisma.commissionRequest.create).mockResolvedValue({ id: 'c1' } as never);
    const res = await post('/api/v1/commissions', commissionBody);
    expect(res.status).toBe(201);
    expect(prisma.commissionRequest.create).toHaveBeenCalled();
  });

  it('checkout only considers artwork whose seller is verified (trusted backend data)', async () => {
    sessionAs(['BUYER'], ACTOR);
    vi.mocked(prisma.artwork.findMany).mockResolvedValue([] as never);
    const res = await withAuth(request(app).post('/api/v1/checkout/session'))
      .set('Idempotency-Key', 'checkout-test-key-1234567890')
      .send({ items: [{ artworkId: 'a1', quantity: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ARTWORK_UNAVAILABLE');
    expect(vi.mocked(prisma.artwork.findMany).mock.calls[0]![0]).toMatchObject({
      where: {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        artist: { is: { verificationStatus: 'VERIFIED' } },
      },
    });
  });

  it('leaves existing commitments alone: status updates are not gated on verification', async () => {
    // updateCommissionStatus never consults the artist's verification status.
    sessionAs(['ARTIST'], ARTIST_USER);
    const res = await patch('/api/v1/commissions/not-a-real-id/status', { status: 'ACCEPTED' });
    expect(res.body.code).not.toBe('ARTIST_NOT_VERIFIED');
  });
});
