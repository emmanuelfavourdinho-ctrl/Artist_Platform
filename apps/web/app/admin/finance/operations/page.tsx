'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAdminSession } from '../../../../components/admin/AdminSessionContext';
import { EmptyBox, ErrorBox, PageHeader, Pagination } from '../../../../components/admin/AdminUi';
import {
  createAdminPayout,
  createAdminRefund,
  decideAdminPayout,
  decideAdminRefund,
  fetchAdminPayouts,
  fetchAdminRefunds,
  fetchEligibleAdminPayouts,
  reconcileAdminPayout,
  reconcileAdminRefund,
  retryAdminPayout,
  retryAdminRefund,
  submitAdminPayout,
  submitAdminRefund,
  type AdminPayoutOperation,
  type AdminRefundOperation,
  type EligibleAdminPayout,
  type Pagination as PaginationData,
} from '../../../../lib/adminApi';

const PAGE_SIZE = 20;

function actionReason(decision: 'APPROVE' | 'REJECT') {
  return decision === 'APPROVE'
    ? 'Approved after administrative review.'
    : 'Rejected after administrative review.';
}

function displayMinorUnits(value: string, currency: string) {
  const exponent = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']
    .includes(currency.toUpperCase()) ? 0 : 2;
  const amount = BigInt(value);
  const scale = BigInt(10) ** BigInt(exponent);
  if (exponent === 0) return `${currency} ${amount}`;
  return `${currency} ${amount / scale}.${String(amount % scale).padStart(exponent, '0')}`;
}

export default function AdminFinancialOperationsPage() {
  const session = useAdminSession();
  const allowed = session.can('finance.view');
  const canManageRefunds = session.can('finance.refunds.manage');
  const canManagePayouts = session.can('finance.payouts.manage');
  const [refunds, setRefunds] = useState<AdminRefundOperation[]>([]);
  const [refundPagination, setRefundPagination] = useState<PaginationData | null>(null);
  const [payouts, setPayouts] = useState<AdminPayoutOperation[]>([]);
  const [payoutPagination, setPayoutPagination] = useState<PaginationData | null>(null);
  const [eligible, setEligible] = useState<EligibleAdminPayout[]>([]);
  const [refundPage, setRefundPage] = useState(1);
  const [payoutPage, setPayoutPage] = useState(1);
  const [paymentId, setPaymentId] = useState('');
  const [amountMinorUnits, setAmountMinorUnits] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [refundResult, payoutResult, eligibleResult] = await Promise.all([
        fetchAdminRefunds({ page: refundPage, pageSize: PAGE_SIZE }),
        fetchAdminPayouts({ page: payoutPage, pageSize: PAGE_SIZE }),
        fetchEligibleAdminPayouts({ page: 1, pageSize: PAGE_SIZE }),
      ]);
      setRefunds(refundResult.data);
      setRefundPagination(refundResult.pagination ?? null);
      setPayouts(payoutResult.data);
      setPayoutPagination(payoutResult.pagination ?? null);
      setEligible(eligibleResult.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load refund and payout operations.');
    } finally {
      setLoading(false);
    }
  }, [payoutPage, refundPage]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  async function runAction(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await action();
      setFeedback(successMessage);
      await load();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The financial action failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitRefundRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await runAction(
      () => createAdminRefund({
        paymentId: paymentId.trim(),
        amountMinorUnits: amountMinorUnits.trim(),
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      }),
      'Refund request recorded for review.',
    );
    if (!succeeded) return;
    setPaymentId('');
    setAmountMinorUnits('');
    setReason('');
  }

  if (!allowed) {
    return <p role="alert" className="text-sm text-red-400">You do not have permission to view financial operations.</p>;
  }

  const field = 'rounded-md border border-border/15 bg-background px-3 py-2 text-sm text-foreground';
  const operationActions = (
    operation: AdminRefundOperation | AdminPayoutOperation,
    kind: 'refund' | 'payout',
  ) => {
    const canManage = kind === 'refund' ? canManageRefunds : canManagePayouts;
    if (!canManage) return <span className="text-xs text-muted">Read-only</span>;
    const decide = (decision: 'APPROVE' | 'REJECT') => kind === 'refund'
      ? decideAdminRefund(operation.id, { decision, reason: actionReason(decision) })
      : decideAdminPayout(operation.id, { decision, reason: actionReason(decision) });
    const retry = () => kind === 'refund'
      ? retryAdminRefund(operation.id, 'Retry authorized after definitive provider failure.')
      : retryAdminPayout(operation.id, 'Retry authorized after definitive provider failure.');
    const submit = () => kind === 'refund' ? submitAdminRefund(operation.id) : submitAdminPayout(operation.id);
    const reconcile = () => kind === 'refund'
      ? reconcileAdminRefund(operation.id)
      : reconcileAdminPayout(operation.id);
    return (
      <div className="flex flex-wrap gap-2">
        {operation.status === 'REQUESTED' && (
          <>
            <button type="button" disabled={busy} onClick={() => void runAction(() => decide('APPROVE'), 'Operation approved.')} className="text-xs text-accent">Approve</button>
            <button type="button" disabled={busy} onClick={() => void runAction(() => decide('REJECT'), 'Operation rejected.')} className="text-xs text-red-400">Reject</button>
          </>
        )}
        {operation.status === 'APPROVED' && (
          <button type="button" disabled={busy} onClick={() => void runAction(submit, 'Provider submission state recorded; confirmation is still pending.')} className="text-xs text-accent">
            Submit to provider
          </button>
        )}
        {['SUBMITTED', 'PENDING', 'MANUAL_RECONCILIATION'].includes(operation.status) && (
          <button type="button" disabled={busy} onClick={() => void runAction(reconcile, 'Provider status reconciliation completed.')} className="text-xs text-accent">
            Reconcile
          </button>
        )}
        {operation.status === 'FAILED' && (
          <button type="button" disabled={busy} onClick={() => void runAction(retry, 'Retry authorized; operation must be submitted again.')} className="text-xs text-accent">
            Authorize retry
          </button>
        )}
        {!['REQUESTED', 'APPROVED', 'SUBMITTED', 'PENDING', 'MANUAL_RECONCILIATION', 'FAILED'].includes(operation.status) && (
          <span className="text-xs text-muted">No action available</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finance"
        title="Refunds & artist payouts"
        description="Operations are distinct from checkout confirmation, release eligibility, settlement, and one another."
      />
      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
        No live provider is configured. Approved operations cannot be sent or verified yet. Approval and submission are not success; only a provider-confirmed reconciliation can record a completed refund or payout. Release eligibility is not evidence of a payout. No provider fees are deducted.
      </p>
      {feedback && <p role="status" className="text-sm text-emerald-400">{feedback}</p>}
      {error && <ErrorBox message={error} onRetry={() => void load()} />}

      {canManageRefunds && (
        <form onSubmit={submitRefundRequest} className="grid gap-3 rounded-lg border border-border/10 p-4 sm:grid-cols-2">
          <h2 className="text-lg sm:col-span-2">Request a full or partial refund</h2>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Payment ID
            <input className={field} required value={paymentId} onChange={(event) => setPaymentId(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Amount in integer minor units
            <input className={field} required inputMode="numeric" pattern="[1-9][0-9]*" value={amountMinorUnits} onChange={(event) => setAmountMinorUnits(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
            Reason
            <input className={field} required minLength={10} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button disabled={busy} className="rounded-md border border-accent px-4 py-2 text-sm text-accent sm:col-span-2">Record refund request</button>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-xl">Refund operations</h2>
        {!loading && refunds.length === 0 && <EmptyBox title="No refund operations" description="No refund records are created from historical payment statuses." />}
        {!!refunds.length && (
          <div className="overflow-x-auto rounded-lg border border-border/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted"><tr><th className="px-3 py-2">Operation / order</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Provider reference</th><th className="px-3 py-2">Actions</th></tr></thead>
              <tbody>{refunds.map((refund) => (
                <tr key={refund.id} className="border-t border-border/10">
                  <td className="px-3 py-3"><p>{refund.id}</p><p className="text-xs text-muted">Order {refund.order.orderNumber} · payment {refund.paymentId}</p></td>
                  <td className="px-3 py-3">{displayMinorUnits(refund.amountMinorUnits, refund.currency)}</td>
                  <td className="px-3 py-3">{refund.status}</td>
                  <td className="px-3 py-3">{refund.providerReference ?? 'Not submitted'}</td>
                  <td className="px-3 py-3">{operationActions(refund, 'refund')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {refundPagination && <Pagination page={refundPagination.page} totalPages={refundPagination.totalPages} total={refundPagination.total} onChange={setRefundPage} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">Release-eligible fulfillments</h2>
        {!loading && eligible.length === 0 && <EmptyBox title="No eligible fulfillments" description="Release eligibility is not evidence of a payout. A separate payout operation must be created and provider-confirmed." />}
        {!!eligible.length && (
          <div className="overflow-x-auto rounded-lg border border-border/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted"><tr><th className="px-3 py-2">Order / artist</th><th className="px-3 py-2">Artist amount</th><th className="px-3 py-2">Stored commission</th><th className="px-3 py-2">Action</th></tr></thead>
              <tbody>{eligible.map((candidate) => (
                <tr key={candidate.fulfillmentId} className="border-t border-border/10">
                  <td className="px-3 py-3">{candidate.orderNumber}<p className="text-xs text-muted">{candidate.artistName} · {candidate.fulfillmentId}</p></td>
                  <td className="px-3 py-3">{displayMinorUnits(candidate.amountMinorUnits, candidate.currency)}</td>
                  <td className="px-3 py-3">{displayMinorUnits(candidate.commissionMinorUnits, candidate.currency)}</td>
                  <td className="px-3 py-3">{canManagePayouts
                    ? <button type="button" disabled={busy} onClick={() => void runAction(
                        () => createAdminPayout({ fulfillmentId: candidate.fulfillmentId, idempotencyKey: crypto.randomUUID() }),
                        'Payout operation recorded; no money has been sent.',
                      )} className="text-xs text-accent">Create payout operation</button>
                    : <span className="text-xs text-muted">Read-only</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl">Payout operations</h2>
        {!loading && payouts.length === 0 && <EmptyBox title="No payout operations" description="Existing release eligibility is not backfilled as a payout." />}
        {!!payouts.length && (
          <div className="overflow-x-auto rounded-lg border border-border/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted"><tr><th className="px-3 py-2">Operation / order</th><th className="px-3 py-2">Artist amount</th><th className="px-3 py-2">Commission</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Provider ref</th><th className="px-3 py-2">Actions</th></tr></thead>
              <tbody>{payouts.map((payout) => (
                <tr key={payout.id} className="border-t border-border/10">
                  <td className="px-3 py-3"><p>{payout.id}</p><p className="text-xs text-muted">{payout.order.orderNumber} · fulfillment {payout.fulfillmentId}</p></td>
                  <td className="px-3 py-3">{displayMinorUnits(payout.amountMinorUnits, payout.currency)}</td>
                  <td className="px-3 py-3">{displayMinorUnits(payout.commissionMinorUnits, payout.currency)}</td>
                  <td className="px-3 py-3">{payout.status}</td>
                  <td className="px-3 py-3">{payout.providerReference ?? 'Not submitted'}</td>
                  <td className="px-3 py-3">{operationActions(payout, 'payout')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {payoutPagination && <Pagination page={payoutPagination.page} totalPages={payoutPagination.totalPages} total={payoutPagination.total} onChange={setPayoutPage} />}
      </section>
      {loading && <p role="status">Loading financial operations…</p>}
    </div>
  );
}
