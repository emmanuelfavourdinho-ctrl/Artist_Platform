# Checkout intent reconciliation

The API repository has no scheduler or job queue. Before production, schedule the explicit runner `npm --prefix apps/api exec -- tsx scripts/reconcileCheckoutIntents.ts` from an authenticated operations environment on a short recurring interval (for example, every five minutes). Alert on non-zero `failed` results and review intents in `RECONCILIATION_REQUIRED`. Do not expose this operation through an unauthenticated HTTP route.

The runner replays an unresolved create only with its persisted Stripe request and idempotency key inside the conservative 23-hour replay window. It retrieves known sessions and releases inventory only after Stripe reports the session expired or confirms expiration through the supported expire endpoint. Open valid sessions, completed sessions awaiting webhook processing, and outcomes older than the replay window keep their reservations protected. Provider or database failures remain eligible for another attempt when safe, with details recorded in `CheckoutIntent.lastError`.

No live provider request or database operation is run by this document or during tests.
