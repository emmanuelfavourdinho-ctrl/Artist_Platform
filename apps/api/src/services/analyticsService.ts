import { prisma } from '../config/db.js';

export async function getOverviewMetrics() {
  const [totalOrders, totalRevenueResult, totalArtworks] = await Promise.all([
    prisma.order.count({ where: { status: 'DELIVERED' } }),
    prisma.order.aggregate({
      where: { status: 'DELIVERED' },
      _sum: { totalAmount: true },
    }),
    prisma.artwork.count(),
  ]);

  return {
    totalOrders,
    totalRevenue: Number(totalRevenueResult._sum.totalAmount ?? 0),
    totalArtworks,
  };
}

export async function getSalesTimeSeries(days?: number) {
  const dateFilter = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

  const orders = await prisma.order.findMany({
    where: {
      status: 'DELIVERED',
      ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}),
    },
    select: {
      totalAmount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const dailyTotals = orders.reduce((acc: Record<string, number>, order) => {
    const rawDate = order.createdAt ? order.createdAt.toISOString().split('T')[0] : null;
    const dateKey: string = rawDate ?? 'unknown';

    acc[dateKey] = (acc[dateKey] ?? 0) + Number(order.totalAmount);
    return acc;
  }, {});

  return dailyTotals;
}

export async function getTopPerformingArtworks(limit = 5) {
  const topItems = await prisma.orderItem.groupBy({
    by: ['artworkId'],
    _count: { artworkId: true },
    _sum: {
      quantity: true,
      subtotal: true,
    },
    orderBy: {
      _count: { artworkId: 'desc' },
    },
    take: limit,
  });

  return topItems;
}

export async function getSalesAnalytics() {
  return getSalesTimeSeries();
}
