
## 1. Payments: additive, not overwriting

Problem: opening an existing payment and typing a new amount overwrites the row. Also filters hide any delivery with a "paid" payment even when a second partial exists.

Changes in `PaymentFormDialog.tsx` and `PaymentsSection.tsx`:
- When called from a delivery's "Add Payment" action or the payments "+ New" button, **always create a new payment row**. Only allow editing an existing payment row when the user clicks Edit on that specific row (MasterAdmin only).
- Remove the "already paid" hard block. Replace with computed remaining balance:
  - `remaining = delivery.total_amount − SUM(payments.amount WHERE status IN ('paid','completed'))`
  - If `remaining <= 0` and no credit selected, show "Fully paid" and disable submit.
- New payment status logic:
  - `remaining_after = remaining − paymentAmount`
  - `remaining_after > 0` → status `paid` (this partial is confirmed) — the delivery trigger `update_delivery_payment_status` already rolls this up to `partial`.
  - `remaining_after == 0` → status `paid`.
  - `remaining_after < 0` → status `paid` for `remaining`, and the excess becomes customer credit (see §2).
- In Payments list, group rows by delivery so each partial appears on its own line under the delivery (already row-per-payment; just ensure sorting by `created_at` and add a small "Payment #n of delivery" label).

## 2. Customer credit ledger

Currently "credit" only appears as a text label in the form. Make it real and usable.

- New table `public.customer_credits` (id, customer_id, amount, source_payment_id nullable, source_delivery_id nullable, note, created_at). Positive rows = credit added, negative rows = credit consumed. Balance = SUM(amount) per customer. RLS: MasterAdmin/Admin full; customer read-own via `customers.user_id`. GRANTs included.
- When a payment amount > remaining on a delivery, auto-insert a positive `customer_credits` row for the excess with `source_payment_id`.
- In `PaymentFormDialog`, once a customer is selected, fetch and show **"Credit available: KSh X"** with a checkbox **"Apply credit to this payment"**. If checked, `Amount` field is prefilled/adjustable and on submit we insert a negative `customer_credits` row for the consumed amount plus a payment row of the same value with `payment_method='credit'`.
- Show credit balance on `CustomerDashboard` and in `CustomersSection` (small badge under name).

## 3. Colored status badges everywhere

Add a shared `<StatusBadge status={...} />` in `src/components/ui/status-badge.tsx` mapping:
- `paid` / `completed` → green bg + dark green text
- `partial` → amber
- `pending` / `pending_verification` → blue
- `open` / `unpaid` → slate
- `overdue` / `rejected` → red
- `credit` → violet

Replace inline status text/`<Badge>` in `PaymentsSection`, `DeliveriesSection`, `CustomerDeliveriesSection`, `CustomerPaymentsSection`, `MpesaVerificationsSection`, and `DashboardSection` cards.

## 4. Collapsible sidebar on every dashboard page

- Refactor `MasterAdminDashboard`, `AdminDashboard`, and `CustomerDashboard` to wrap their content in `SidebarProvider` + a new shared `<AppSidebar>` built on shadcn `Sidebar` with `collapsible="icon"`.
- Header gets a persistent `<SidebarTrigger />` so the user can hide/show the tab rail on every page (works on mobile via the built-in offcanvas behavior).
- Keep the current tab items and their onClick behavior; just move them into `SidebarMenu`.

## 5. Compact, data-dense spacing

- `src/App.css`: reduce `#root` padding to `0.25rem` mobile / `0.5rem` md / `0.75rem` lg, and raise `max-width` to `100%` (remove the 1280px cap so tables use full width).
- `src/index.css`: tighten `.card-mobile`, `.p-mobile`, `.py-mobile`, `.px-mobile` to `p-1 sm:p-2`.
- In heavy tables (Payments, Deliveries, Customers): switch to `text-xs sm:text-sm`, `py-1.5` cells, `gap-2` toolbars, and remove outer `p-6` wrappers on section containers.
- Dashboard KPI cards: switch grid to `grid-cols-2 md:grid-cols-4 lg:grid-cols-6` with `p-3` and smaller icons so more cards fit above the fold.

## Technical notes

- Only one schema change needed (`customer_credits` table + trigger to auto-create excess credit). Everything else is UI/logic.
- No changes to existing `payments` schema; each payment stays its own row (already the case), we just stop overwriting from the form.
- No changes to Admin permissions: only MasterAdmin can edit existing payments; Admin can create new partials but not edit prior rows (existing rule kept).

```text
Delivery 2500
 ├─ Payment #1 Cash    500  paid    2026-07-20   ← separate row
 ├─ Payment #2 M-Pesa 1000  paid    2026-07-22   ← separate row
 └─ Payment #3 Credit  400  paid    2026-07-24   ← credit consumed
Remaining: 600 → delivery status = partial (amber badge)
```
