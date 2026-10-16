import { prisma } from '../lib/prisma.js';

/*
  Explainer: plain counts straight from the database — no revenue, no
  growth percentages, no "recent activity". Anything that isn't a direct,
  reliably-countable fact lives in the analytics endpoint instead, with
  its definition attached. Each count here backs a real queue or a real
  total an admin can act on.
*/
export async function getAdminOverview() {
  const [
    totalUsers,
    totalArtists,
    pendingArtistVerification,
    totalArtworks,
    publishedArtworks,
    ordersByStatus,
    pendingReviews,
    unreadContactMessages,
    openReports,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.artistProfile.count(),
    prisma.artistProfile.count({ where: { verificationStatus: 'PENDING' } }),
    prisma.artwork.count(),
    prisma.artwork.count({ where: { status: 'PUBLISHED' } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.review.count({ where: { status: 'PENDING' } }),
    prisma.contactMessage.count({ where: { status: 'UNREAD' } }),
    prisma.report.count({ where: { status: 'PENDING' } }),
  ]);

  const orderStatusCounts = Object.fromEntries(
    ordersByStatus.map((row) => [row.status, row._count._all]),
  );

  return {
    users: { total: totalUsers },
    artists: { total: totalArtists, pendingVerification: pendingArtistVerification },
    artworks: { total: totalArtworks, published: publishedArtworks },
    orders: {
      total: Object.values(orderStatusCounts).reduce((sum, n) => sum + n, 0),
      byStatus: orderStatusCounts,
    },
    queues: {
      pendingReviews,
      unreadContactMessages,
      openReports,
      pendingArtistVerification,
    },
  };
}
