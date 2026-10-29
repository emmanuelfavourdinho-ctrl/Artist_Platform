'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminSession } from '../../../components/admin/AdminSessionContext';
import { EmptyBox, ErrorBox, PageHeader, Pagination, StatusPill } from '../../../components/admin/AdminUi';
import {
  fetchAdminOrder,
  fetchAdminOrders,
  fetchAdminPayment,
  fetchAdminPayments,
  type AdminFinanceParams,
  type AdminOrderDetail,
  type AdminOrderRow,
  type AdminPaymentDetail,
  type AdminPaymentListRow,
  type Pagination as PaginationData,
} from '../../../lib/adminApi';

const PAGE_SIZE = 20;
type View = 'orders' | 'payments';

function dateBounds(from: string, to: string) {
  return {
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
  };
}

function money(amount: string, currency: string) {
  return `${currency} ${amount}`;
}

function timestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function AdminOrdersPageContent() {
  const { can } = useAdminSession();
  const allowed = can('finance.view');
  const [view, setView] = useState<View>('orders');
  const [filters, setFilters] = useState({ status: '', currency: '', from: '', to: '', reference: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<(AdminOrderRow | AdminPaymentListRow)[] | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminOrderDetail | AdminPaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setError(null);
    setSelected(null);
    setDetailError(null);
    setDetailLoading(false);
    detailRequestId.current += 1;
    try {
      const params: AdminFinanceParams = {
        page,
        pageSize: PAGE_SIZE,
        ...(appliedFilters.status ? { status: appliedFilters.status } : {}),
        ...(appliedFilters.currency ? { currency: appliedFilters.currency } : {}),
        ...dateBounds(appliedFilters.from, appliedFilters.to),
        ...(appliedFilters.reference ? { reference: appliedFilters.reference.trim() } : {}),
      };
      const result =
        view === 'orders' ? await fetchAdminOrders(params) : await fetchAdminPayments(params);
      if (requestId !== listRequestId.current) return;
      setRows(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      if (requestId !== listRequestId.current) return;
      setError(err instanceof Error ? err.message : 'Could not load financial records.');
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [appliedFilters, page, view]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const selectOrder = async (id: string) => {
    const requestId = ++detailRequestId.current;
    setSelected(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const order = await fetchAdminOrder(id);
      if (requestId === detailRequestId.current) setSelected(order);
    } catch (err) {
      if (requestId === detailRequestId.current) {
        setDetailError(err instanceof Error ? err.message : 'Could not load order details.');
      }
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  };

  const selectPayment = async (id: string) => {
    const requestId = ++detailRequestId.current;
    setSelected(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const payment = await fetchAdminPayment(id);
      if (requestId === detailRequestId.current) setSelected(payment);
    } catch (err) {
      if (requestId === detailRequestId.current) {
        setDetailError(err instanceof Error ? err.message : 'Could not load payment details.');
      }
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  };

  const changeView = (nextView: View) => {
    listRequestId.current += 1;
    detailRequestId.current += 1;
    setView(nextView);
    setPage(1);
    setFilters((current) => ({ ...current, status: '' }));
    setAppliedFilters((current) => ({ ...current, status: '' }));
    setRows(null);
    setPagination(null);
    setLoading(true);
    setSelected(null);
  };

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    listRequestId.current += 1;
    setPage(1);
    setAppliedFilters(filters);
  };

  const changePage = (nextPage: number) => {
    listRequestId.current += 1;
    setPage(nextPage);
  };

  if (!allowed) {
    return <p role="alert" className="text-sm text-red-400">You do not have permission to view financial records.</p>;
  }

  const field =
    'rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Marketplace"
        title="Orders & payments"
        description="Inspect persisted order and checkout payment records. These records do not establish provider settlement or artist payout."
      />

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-foreground/80">
        A successful checkout payment is not proof of Stripe settlement or an artist payout.
        Provider fees and refund amounts are not tracked in these records.
      </p>

      <div role="tablist" aria-label="Financial records" className="flex gap-2">
        {(['orders', 'payments'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => changeView(item)}
            className={`rounded-md border px-4 py-2 text-sm capitalize ${
              view === item ? 'border-accent text-accent' : 'border-border/15 text-muted'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <form onSubmit={submitFilters} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select
            className={field}
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">All statuses</option>
            {(view === 'orders'
              ? ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']
              : ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']
            ).map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Currency
          <input
            className={field}
            value={filters.currency}
            maxLength={3}
            placeholder="USD"
            onChange={(event) => setFilters((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Created from
          <input type="date" className={field} value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Created through
          <input type="date" className={field} value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted lg:col-span-2">
          Order, checkout, or payment reference
          <input
            className={field}
            value={filters.reference}
            maxLength={255}
            onChange={(event) => setFilters((current) => ({ ...current, reference: event.target.value }))}
          />
        </label>
        <button type="submit" className="rounded-md border border-accent px-4 py-2 text-sm text-accent hover:bg-accent/5">
          Apply filters
        </button>
      </form>

      {error && <ErrorBox message={error} onRetry={() => void load()} />}
      {loading && <div role="status" aria-label="Loading financial records" className="h-24 animate-pulse rounded-lg bg-surface" />}
      {!loading && !error && rows?.length === 0 && (
        <EmptyBox title={`No ${view} found`} description="Try changing or clearing the filters." />
      )}

      {!loading && !error && !!rows?.length && view === 'orders' && (
        <div className="overflow-x-auto rounded-lg border border-border/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Items / payments</th><th className="px-4 py-3">Created</th></tr>
            </thead>
            <tbody>
              {(rows as AdminOrderRow[]).map((order) => (
                <tr key={order.id} className="border-t border-border/10">
                  <td className="px-4 py-3"><button type="button" onClick={() => void selectOrder(order.id)} className="text-accent hover:underline">{order.orderNumber}</button></td>
                  <td className="px-4 py-3"><StatusPill status={order.status} /></td>
                  <td className="px-4 py-3">{money(order.totalAmount, order.currency)}</td>
                  <td className="px-4 py-3">{order._count.items} / {order._count.payments}</td>
                  <td className="px-4 py-3">{timestamp(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && !!rows?.length && view === 'payments' && (
        <div className="overflow-x-auto rounded-lg border border-border/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Recorded amount</th><th className="px-4 py-3">Paid at</th></tr>
            </thead>
            <tbody>
              {(rows as AdminPaymentListRow[]).map((payment) => (
                <tr key={payment.id} className="border-t border-border/10">
                  <td className="px-4 py-3"><button type="button" onClick={() => void selectPayment(payment.id)} className="text-accent hover:underline">{payment.id}</button></td>
                  <td className="px-4 py-3">{payment.order.orderNumber}</td>
                  <td className="px-4 py-3"><StatusPill status={payment.status} /></td>
                  <td className="px-4 py-3">{money(payment.amount, payment.currency)}</td>
                  <td className="px-4 py-3">{timestamp(payment.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={changePage} />}

      {detailLoading && <p role="status">Loading record details…</p>}
      {detailError && <ErrorBox message={detailError} />}
      {selected && (
        <section aria-labelledby="record-detail-heading" className="space-y-5 rounded-lg border border-border/10 bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="record-detail-heading" className="font-display text-xl text-foreground">
                {'orderNumber' in selected ? `Order ${selected.orderNumber}` : `Payment ${selected.id}`}
              </h2>
              <p className="mt-1 text-xs text-muted">Record ID: {selected.id}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                detailRequestId.current += 1;
                setSelected(null);
                setDetailLoading(false);
              }}
              className="rounded-md border border-border/15 px-3 py-1.5 text-sm"
            >
              Close details
            </button>
          </div>

          {'orderNumber' in selected ? (
            <OrderDetails order={selected} onSelectPayment={(id) => void selectPayment(id)} />
          ) : (
            <PaymentDetails payment={selected} onSelectOrder={(id) => void selectOrder(id)} />
          )}
        </section>
      )}
    </div>
  );
}

function OrderDetails({ order, onSelectPayment }: { order: AdminOrderDetail; onSelectPayment: (id: string) => void }) {
  return (
    <>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>Status: <StatusPill status={order.status} /></p>
        <p>Subtotal: {money(order.subtotal, order.currency)}</p>
        <p>Shipping recorded: {money(order.shippingAmount, order.currency)}</p>
        <p>Tax recorded: {money(order.taxAmount, order.currency)}</p>
        <p>Discount recorded: {money(order.discountAmount, order.currency)}</p>
        <p>Total recorded: {money(order.totalAmount, order.currency)}</p>
        <p>Created: {timestamp(order.createdAt)}</p>
      </div>
      <h3 className="font-medium">Order item snapshots</h3>
      <ul className="divide-y divide-border/10 rounded border border-border/10">
        {order.items.map((item) => (
          <li key={item.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
            <span>{item.titleSnapshot} · {item.artistNameSnapshot} · Qty {item.quantity}</span>
            <span>{money(item.subtotal, item.currency)} · Commission snapshot {money(item.commissionAmount, item.currency)} (stored rate: {item.commissionRate})</span>
          </li>
        ))}
      </ul>
      <h3 className="font-medium">Associated checkout payment records</h3>
      {order.payments.length === 0 ? <EmptyBox title="No payment records attached to this order" /> : (
        <ul className="space-y-2">
          {order.payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/10 px-4 py-3 text-sm">
              <button type="button" onClick={() => onSelectPayment(payment.id)} className="text-accent hover:underline">{payment.id}</button>
              <span><StatusPill status={payment.status} /> · {money(payment.amount, payment.currency)} · Paid at {timestamp(payment.paidAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Commission is the stored item snapshot, not evidence of a transfer or artist payout. Payment success records checkout confirmation only.</p>
    </>
  );
}

function PaymentDetails({ payment, onSelectOrder }: { payment: AdminPaymentDetail; onSelectOrder: (id: string) => void }) {
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <p>Status: <StatusPill status={payment.status} /></p>
      <p>Recorded amount: {money(payment.amount, payment.currency)}</p>
      <p>Provider: {payment.provider}</p>
      <p>Provider payment reference: {payment.providerPaymentId ?? 'Not recorded'}</p>
      <p>Paid at: {timestamp(payment.paidAt)}</p>
      <p>Record created: {timestamp(payment.createdAt)}</p>
      <div className="sm:col-span-2 rounded border border-border/10 p-4">
        <h3 className="font-medium">Related order</h3>
        <button type="button" onClick={() => onSelectOrder(payment.order.id)} className="mt-2 text-accent hover:underline">
          {payment.order.orderNumber} · {payment.order.status}
        </button>
        <p className="mt-1">Recorded order total: {money(payment.order.totalAmount, payment.order.currency)}</p>
      </div>
      <p className="text-xs text-muted sm:col-span-2">A successful payment status does not establish provider settlement or artist payout. Provider fees and refund amounts are not recorded here.</p>
    </div>
  );
}

export default function AdminOrdersPage() {
  return <AdminOrdersPageContent />;
}
