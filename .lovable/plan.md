## Fixes

### 1. Delivery form UI (`DeliveriesSection.tsx`)
- Remove the "Total Quantity" readonly field from the totals row (keep only "Total Amount").
- Move the "Add Item" button from the header of the Products section to sit **below** the Total Amount box (right-aligned).
- Per-item Qty column already renders separately per row — leave as-is (user confirmed items now show separately; each row's own Qty input remains).

### 2. Delivery list should show "Partial Payment" when partly paid
Problem: user paid 500 of 1000, but delivery still shows "Open".

Root cause (confirmed by reading `update_delivery_payment_status` trigger + payments status logic): the trigger only ever writes `'paid'` or `'unpaid'` to `deliveries.payment_status` — it never writes `'partial'`, even though the column allows it and the UI already has a "Partial Payment" badge for it.

Fix: update the `update_delivery_payment_status()` DB function so that on any payment insert/update it recomputes the delivery's status from the sum of that delivery's `paid` payments:
- sum >= delivery.total_amount → `paid`
- 0 < sum < delivery.total_amount → `partial`
- sum = 0 → `unpaid`

Also run a one-time backfill so existing deliveries with partial payments get the correct status immediately.

### 3. Customer dropdown alphabetical order
`DeliveriesSection.tsx` already fetches customers with `.order('customer_name')`, but this is case-sensitive in Postgres (uppercase sorts before lowercase). Switch to a case-insensitive sort so the list is truly A→Z regardless of casing. Apply the same fix in `DeliveryFormDialog.tsx` (the other create/edit form) for consistency.

### Files touched
- `src/components/dashboard/sections/DeliveriesSection.tsx` — remove Total Qty field, relocate Add Item button, case-insensitive customer sort.
- `src/components/dashboard/forms/DeliveryFormDialog.tsx` — case-insensitive customer sort.
- New migration — replace `update_delivery_payment_status()` with sum-based logic and backfill existing rows.
