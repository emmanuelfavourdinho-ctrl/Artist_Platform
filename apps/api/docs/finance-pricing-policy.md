# Listing currency and commission policy

## Current behavior

- New artwork listing prices are USD only. A listing's stored currency is not
  changed or converted when it is read.
- Public gallery/search results only include USD listings. A legacy non-USD
  listing is unavailable for checkout and displays a price-verification state
  where it remains visible (for example in favorites, the studio, or its detail
  page).
- Checkout does not convert USD listing prices into another payment currency.
  It remains USD-only until Fine Arts connects and verifies an FX quote source
  and confirms provider support for the quoted transaction.
- Fine Arts commission is 1,000 basis points (10%). For USD, the platform fee
  is rounded half-up once on the order's eligible artwork subtotal in cents.
  Per-item snapshots are allocated by largest remainder; equal remainders are
  resolved by ascending reservation ID. The allocations sum exactly to the
  rounded order-level commission. Shipping, tax, discounts, and provider fees
  are not part of the eligible subtotal.
- New Stripe Checkout metadata contains the fixed basis-point value. A signed
  legacy Checkout Session with its own rate metadata is fulfilled using that
  captured rate, never a current environment setting. Legacy rates preserve
  the previous per-item rounding behavior and accept the previous numeric
  string precision; legacy currency amounts preserve the old zero-/two-decimal
  Stripe adapter rules for an explicit set of Stripe-supported currencies.
  Unsupported or malformed currency/rate metadata is rejected rather than
  guessed. Order-item rates and amounts remain immutable snapshots for
  analytics.

## Legacy listing preflight and reconciliation

No database values were inspected or rewritten for this change. Before launch,
an authorized operator should:

1. Run a read-only inventory grouped by `Artwork.currency`, and export IDs,
   artist IDs, status, visibility, amount, and any active checkout intent/session
   references for non-USD rows. Do not infer a USD value from the numeric amount.
2. Ask the data owner/artist to verify each listing's intended USD price from
   source records. Maintain an approved reconciliation record outside this
   deployment until a price-history workflow exists.
3. For each verified listing, use a reviewed admin/data operation to set the
   explicit USD value and currency together. Never change only the currency
   label. Keep unverified rows unavailable.
4. Identify open unpaid checkout sessions referencing non-USD or old-policy
   listings and expire them through an approved provider operation. Reconcile
   provider status before releasing any reservation. Let already-paid legacy
   sessions fulfill in their actual transaction currency and captured
   commission terms.
5. Reindex verified listings and confirm there are no purchasable/searchable
   unverified rows before enabling public sales.

### Elasticsearch currency backfill

The application only adds the `currency` mapping when it creates a new index.
Existing documents in an older `artworks` index can therefore have no currency
field; those documents are intentionally excluded from search suggestions until
their index document is refreshed. Before enabling the currency-filtered
search, an authorized operator must:

1. Read the artwork IDs from the authoritative database; do not infer missing
   currencies from indexed values or prices.
2. In a controlled, rate-limited batch, invoke the normal
   `syncArtworkToElasticsearch` service for each ID. This upserts the document
   from current database fields, including currency and computed availability.
   It does not create financial records or change database values.
3. Verify document counts and sample the indexed currency/availability against
   the database. Keep missing or inconsistent documents unavailable from
   search, and investigate them before public launch.

Do not populate a missing currency by assuming USD and do not run this backfill
against production without the normal operational approval.

This repository has no connected FX quote source or payment-currency choice
flow. `FxQuote` is only a provider-independent type contract; it does not
represent a live quote, conversion, or fee estimate. Provider processing fees
also are not currently retrieved or stored separately from payments. Add a
separate verified fee amount/currency field only when a provider source and
reconciliation semantics are approved; do not derive fees from commission.

Analytics currently returns monetary totals as JSON numbers to preserve the
existing dashboard contract. Database aggregation and currency normalization
use exact decimal arithmetic, but conversion to JavaScript numbers can lose
cent-level precision for very large totals. A future exact-money API contract
should return decimal strings and update the dashboard formatter together;
do not change the current response shape in a compatibility patch.
