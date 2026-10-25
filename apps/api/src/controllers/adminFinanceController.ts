import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { HttpError } from '../lib/httpError.js';
import { prisma } from '../lib/prisma.js';
import type {
  ListAdminOrdersQuery,
  ListAdminPaymentsQuery,
} from '../validation/adminFinance.js';

const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  shippingAmount: true,
  taxAmount: true,
  discountAmount: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: true, payments: true } },
} satisfies Prisma.OrderSelect;

const PAYMENT_SELECT = {
  id: true,
  provider: true,
  providerPaymentId: true,
  amount: true,
  currency: true,
  status: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

function idParam(req: Request, name: string): string {
  const id = req.params.id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, `Invalid ${name} id`, { code: 'INVALID_ID' });
  }
  return id;
}

function createdAtFilter(from?: Date, to?: Date) {
  return from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

function orderWhere(query: ListAdminOrdersQuery): Prisma.OrderWhereInput {
  const { status, currency, from, to, reference } = query;
  return {
    ...(status ? { status } : {}),
    ...(currency ? { currency: { equals: currency, mode: 'insensitive' } } : {}),
    ...createdAtFilter(from, to),
    ...(reference
      ? {
          OR: [
            { id: reference },
            { orderNumber: { contains: reference, mode: 'insensitive' } },
            { checkoutSessionId: reference },
            {
              payments: {
                some: {
                  OR: [{ id: reference }, { providerPaymentId: reference }],
                },
              },
            },
          ],
        }
      : {}),
  };
}

function paymentWhere(query: ListAdminPaymentsQuery): Prisma.PaymentWhereInput {
  const { status, currency, from, to, reference } = query;
  return {
    ...(status ? { status } : {}),
    ...(currency ? { currency: { equals: currency, mode: 'insensitive' } } : {}),
    ...createdAtFilter(from, to),
    ...(reference
      ? {
          OR: [
            { id: reference },
            { providerPaymentId: reference },
            { orderId: reference },
            { order: { is: { orderNumber: { contains: reference, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
}

export async function listAdminOrders(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = req.query as unknown as ListAdminOrdersQuery;
  const where = orderWhere(req.query as unknown as ListAdminOrdersQuery);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ORDER_LIST_SELECT,
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: orders,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function getAdminOrder(req: Request, res: Response): Promise<void> {
  const id = idParam(req, 'order');
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      ...ORDER_LIST_SELECT,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          titleSnapshot: true,
          artistNameSnapshot: true,
          unitPrice: true,
          quantity: true,
          currency: true,
          subtotal: true,
          commissionRate: true,
          commissionAmount: true,
        },
      },
      payments: {
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: PAYMENT_SELECT,
      },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found', { code: 'ORDER_NOT_FOUND' });
  res.json({ status: 'success', data: order });
}

export async function listAdminPayments(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAdminPaymentsQuery;
  const { page, pageSize } = query;
  const where = paymentWhere(query);
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ...PAYMENT_SELECT,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: payments,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function getAdminPayment(req: Request, res: Response): Promise<void> {
  const id = idParam(req, 'payment');
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: {
      ...PAYMENT_SELECT,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          subtotal: true,
          shippingAmount: true,
          taxAmount: true,
          discountAmount: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          items: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              titleSnapshot: true,
              artistNameSnapshot: true,
              unitPrice: true,
              quantity: true,
              currency: true,
              subtotal: true,
              commissionRate: true,
              commissionAmount: true,
            },
          },
        },
      },
    },
  });
  if (!payment) throw new HttpError(404, 'Payment not found', { code: 'PAYMENT_NOT_FOUND' });
  res.json({ status: 'success', data: payment });
}
