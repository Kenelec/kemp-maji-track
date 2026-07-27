
## Goal

Make payment editing and adding two clearly separate flows, and switch the credit source of truth to `payments.status = 'credit'` as you described, so credit is calculated, shown, and applied consistently.

## 1. DB migration

The current `payments.status` check constraint does not allow `'credit'`. Update it to allow: `pending`, `pending_verification`, `paid`, `completed`, `partial`, `overdue`, `rejected`, `credit`.

Backfill: for every existing row in `customer_credits` with `amount > 0` and no matching `payments` row of status `'credit'`, insert a `payments` row (`customer_id`, `amount`, `status='credit'`, `delivery_id = source_delivery_id`, `due_date = created_at::date`, `payment_method='credit'`). Negative ledger rows (consumed credit) become `payments` rows with negative amount and `status='credit'` so the SUM still nets to the real balance. Keep `customer_credits` table intact for now (read-only fallback) but stop writing to it.

Update `update_delivery_payment_status` trigger so credit rows (`status='credit'`) are NOT counted as paid toward a delivery's total — only `paid`/`completed` count.

## 2. `DeliveryPaymentsDialog.tsx` — two buttons, clear intent

- Header stays: Total, Paid, Remaining, Credit.
- Credit is now `SUM(amount) FROM payments WHERE customer_id = X AND status = 'credit'`.
- Per-row action buttons (MasterAdmin): **Edit Payment** (pencil) and **Delete**.
- Top-right action: **Add Payment** (always creates a new row).
- Edit opens `PaymentFormDialog` in edit mode with that `payment.id`.
- Add opens `PaymentFormDialog` in add mode, pre-filled with `customer_id` + `delivery_id`, no `id`.

## 3. `PaymentFormDialog.tsx` — hard split edit vs add

- Mode is derived from `editData?.id`. If `id` present → UPDATE that row only. If absent → INSERT new row. No branch can cross over.
- Header shows the mode: "Edit Payment #<short-id>" vs "Add Payment".
- Always show:
  - Current Amount Paid (sum of `paid`/`completed` for that delivery)
  - Delivery Balance (total − current paid)
  - Available Credit (sum of `status='credit'` for that customer)
  - Amount field (in edit = this row's amount; in add = new amount to record)
  - "Use available credit" checkbox — only enabled when credit > 0 and mode = add
- Submit behavior:
  - **Edit**: `UPDATE payments SET amount=?, payment_method=?, mpesa_code=?, status=? WHERE id=?`. No new rows. After update, run overpayment reconciliation (see §4) for this delivery.
  - **Add** (no credit applied): `INSERT` new row with the entered amount and appropriate status. Then reconciliation.
  - **Add with credit applied**: (a) `INSERT` a negative `status='credit'` row for `min(credit_available, amount_entered)` under that customer, (b) `INSERT` the actual payment row for the full entered amount and status `paid`/`pending_verification`. Delivery total paid increases by the full entered amount; customer credit balance drops by the applied amount.
- Overpayment reconciliation after any add/edit: recompute `paid_sum` for the delivery; if `paid_sum > delivery.total_amount`, `INSERT` a `status='credit'` row for `paid_sum - total_amount` (positive) under the customer, linked to `delivery_id`, and cap the delivery's effective paid at total. If a prior overpayment-credit row exists for this delivery+payment and is no longer valid (edit reduced amount), delete/adjust it so credit never double-counts.

## 4. `DeliveriesSection.tsx`

- Payments column already exists — keep it. Update aggregate query to exclude `status='credit'` rows from the "paid" sum and from the count shown.
- Status column color mapping (already via `StatusBadge`) unchanged — no `'credit'` badge on delivery rows; that status only exists on `payments`.

## 5. Role gating (unchanged, re-stated)

- MasterAdmin: Add, Edit, Delete.
- Admin: Add only. Edit/Delete hidden.
- Customer: view only from their portal (no dialog).

## Files touched

- Migration: expand `payments_status_check`, backfill from `customer_credits`, update `update_delivery_payment_status`.
- `src/components/dashboard/forms/PaymentFormDialog.tsx`: strict edit/add split, credit source switched to `payments.status='credit'`, credit-application flow, reconciliation.
- `src/components/dashboard/sections/DeliveryPaymentsDialog.tsx`: separate Edit vs Add buttons, credit read from `payments`.
- `src/components/dashboard/sections/DeliveriesSection.tsx`: aggregate excludes credit rows.
- `src/components/dashboard/sections/PaymentsSection.tsx`: filter out `status='credit'` rows from the main payments list (or show them in a dedicated "Credits" sub-view — default: hidden from main list to avoid confusion; confirm if you want them visible).

## Open question

Do you want `status='credit'` rows to appear in the main **Payments** tab list, or stay hidden there and only be visible via the customer's credit balance shown on forms? Default in this plan: hidden from the Payments list.
