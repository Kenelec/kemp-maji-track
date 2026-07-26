
## Goal

Stop duplicate payment rows on edit, make credit truly usable across deliveries, and expose payments on the Deliveries page via a "Payments" count column + modal.

## 1. Fix "edit creates duplicate" in `PaymentFormDialog.tsx`

Root cause: some callers open the dialog with `editData` cleared or with a partial object missing `id`, so the form falls into the insert branch.

Changes:
- Treat edit vs create by the presence of `editData?.id` (not just `editData`).
- Guard the submit: if we entered as "edit" but `editData.id` is missing, abort with a toast instead of inserting.
- When updating, keep `created_at` untouched, only set `updated_at`.
- After a successful update, re-run overpayment reconciliation: recompute `sum(payments.amount where paid/completed) - delivery.total_amount`; if positive and no existing `customer_credits` row references this payment, insert one; if the edit reduced the amount and a prior credit row for this `source_payment_id` exists, delete/adjust it so credit stays consistent.

## 2. Credit system correctness

Keep the existing `customer_credits` ledger (positive = added, negative = consumed). Fixes:
- `fetchCreditBalance` already sums the ledger — keep it, but also refetch after submit so the dialog and Deliveries modal show fresh balances.
- When "Apply credit" is used, insert the negative ledger row **only after** the payment row insert succeeds (already the case) and inside the same try/catch so a failure surfaces to the user.
- On payment **delete** (from the new modal): if that payment produced ledger rows (`source_payment_id = payment.id`), delete those ledger rows too so credit doesn't linger.
- Show "Credit available: KSh X" on the new Deliveries-page payment modal header, same component as the form.

Note: the user's request to key credit off `payments.status='credit'` conflicts with the existing ledger design already shipped and with the DB status check constraint. Plan keeps the ledger table (`customer_credits`) as the source of truth — it already models exactly this — and does not add a `'credit'` payments status. Flag this trade-off up front; if they insist we can revisit.

## 3. Move payment UI onto `DeliveriesSection.tsx`

- Fetch a `payments_count` and `payments_sum` per delivery in the deliveries query (single extra select on `payments` grouped in JS, or a lightweight follow-up query keyed by delivery ids).
- Add a new column **"Payments"** between "Total" and "Status":
  - Shows `n · KSh paid` as a clickable button.
  - `0` renders as "Add payment".
- Clicking opens a new `DeliveryPaymentsDialog`:
  - Lists every payment row for that delivery (date, method, amount, status badge, mpesa code).
  - Buttons: **Add Payment**, **Edit** (per row, MasterAdmin only), **Delete** (MasterAdmin only, with confirm).
  - Add/Edit reuses `PaymentFormDialog` with `editData` (or preselected `customer_id` + `delivery_id` for add).
  - Delete removes the payment row and any linked `customer_credits` rows (see §2).
  - Header shows delivery total, sum paid, remaining, and customer credit balance.
- Keep existing `PaymentsSection` list working (no removal) — it stays as the global payments view. Only add the new column + modal on Deliveries.

## 4. Role gating

- MasterAdmin: can Add / Edit / Delete payments from the new modal.
- Admin: can Add only; Edit/Delete buttons hidden (matches existing rule).
- Customer view unchanged.

## 5. Files touched

- `src/components/dashboard/forms/PaymentFormDialog.tsx` — edit-vs-create guard, post-update credit reconciliation.
- `src/components/dashboard/sections/DeliveriesSection.tsx` — new Payments column, wire modal.
- `src/components/dashboard/sections/DeliveryPaymentsDialog.tsx` — new file, per-delivery payments list + actions.
- No DB migration required. Existing `payments` + `customer_credits` + `update_delivery_payment_status` trigger already roll status to paid/partial correctly.

## Open question

Do you want the standalone **Payments** tab kept as-is (global view across all deliveries) or removed now that payments live on the Deliveries page? Default in this plan: keep it.
