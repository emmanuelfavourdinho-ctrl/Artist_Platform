import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../lib/firebaseAdmin.js', () => ({ adminAuth: { verifyIdToken: vi.fn() } }));

import { app } from '../app.js';
import { adminAuth } from '../lib/firebaseAdmin.js';
import { prisma } from '../lib/prisma.js';

const ORDER_ID = '10000000-0000-4000-8000-000000000001';
const TOKEN = 'release-hold-permission-test-token';

function loggedIn(role: string) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: 'staff-1',
    firebaseUid: 'firebase-staff-1',
    email: 'staff@example.com',
    firstName: 'Finance',
    lastName: 'Staff',
    roles: [{ role: { name: role } }],
  } as never);
  vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'firebase-staff-1' } as never);
  return request(app);
}

beforeEach(() => vi.clearAllMocks());

describe('admin payment release holds', () => {
  it('does not allow Finance Admin read permission to mutate a payment hold', async () => {
    const response = await loggedIn('FINANCE_ADMIN')
      .patch(`/api/v1/admin/orders/${ORDER_ID}/release-hold`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ held: true, reason: 'Manual review required for this order.' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires authentication before a payment hold mutation', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/orders/${ORDER_ID}/release-hold`)
      .send({ held: true, reason: 'Manual review required for this order.' });

    expect(response.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
