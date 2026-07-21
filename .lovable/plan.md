## Goal

Change the M-Pesa flow so customer-entered codes stay in a "pending verification" state until an admin (Master Admin) confirms them against the Safaricom SMS. Only after confirmation does the payment/delivery flip to PAID. Add an optional automation step where the system auto-matches customer codes against ingested Safaricom SMS records.

## Current behavior (verified)

In `CustomerMpesaPaymentForm.tsx`, when a customer submits an M-Pesa code the app currently:
- Inserts the payment with `status: "paid"` immediately
- Updates the delivery to `payment_status: "paid"` and `customer_confirmed: true`

There is no admin verification step, and no place to store SMS messages received from Safaricom.

## New flow

1. Customer submits M-Pesa code on the web app.
2. Payment is recorded as `status: "pending_verification"` (delivery stays `unpaid`/`partial`, not paid).
3. Master Admin sees a new "M-Pesa Verifications" queue in the Approvals area.
4. Master Admin compares the entered code with the Safaricom SMS and clicks **Confirm** or **Reject**.
   - Confirm → payment `status = paid`, delivery `payment_status = paid`, customer notified.
   - Reject → payment `status = rejected` with a reason, customer notified to resubmit.
5. Optional automation: a table of ingested Safaricom SMS rows; when a customer code matches an SMS row (same code, amount within tolerance, not already used), the payment is auto-confirmed. Unmatched entries stay in the manual queue.

## Changes

### Database (migration)

- Extend `payments.status` handling to include `pending_verification` and `rejected` (values only — no CHECK constraint, use trigger/app validation).
- Add columns to `payments`: `verified_by uuid`, `verified_at timestamptz`, `rejection_reason text`.
- New table `mpesa_sms_inbox` (id, mpesa_code unique, amount, sender_phone, sender_name, message_text, received_at, matched_payment_id nullable, created_at). GRANTs + RLS: only MasterAdmin/Admin can select/insert; service_role full access.
- Trigger on `payments` insert/update: if a row in `mpesa_sms_inbox` matches `mpesa_code` (case-insensitive) and amount is within a small tolerance and `matched_payment_id IS NULL`, auto-set payment to `paid`, set `verified_at`, and link `matched_payment_id`.
- Adjust `update_delivery_payment_status` so only `paid`/`completed` flip delivery to paid; `pending_verification` and `rejected` keep it `unpaid`.

### Frontend

- **`CustomerMpesaPaymentForm.tsx`**: insert payment as `pending_verification`; do NOT mark delivery paid or set `customer_confirmed`. Show success toast "Submitted for verification".
- **Customer delivery/payment views** (`CustomerDeliveriesSection`, `CustomerPaymentsSection`, `PaymentPage`): show a "Pending verification" badge for these payments; on confirm/reject, show updated status and (for reject) reason.
- **`MasterAdminDashboard` Approvals tab**: new "M-Pesa Verifications" list showing pending payments with customer, delivery, amount, entered code, submitted time, and matching SMS (if any). Buttons: **Confirm** and **Reject** (reject requires reason). Admin (view-only role) can see the list but not act.
- **New "SMS Inbox" section** (MasterAdmin only): paste/enter incoming Safaricom SMS (code, amount, sender). Saving inserts into `mpesa_sms_inbox`, which triggers auto-match.
- In-app notifications to the customer on confirm ("Payment verified") and reject ("Payment rejected — resubmit").

### Out of scope (call out to user)

- Automatic ingestion of SMS from your phone into `mpesa_sms_inbox` requires a phone-side forwarder (SMS-to-webhook app or Africa's Talking SMS receiver). This plan supports manual paste now and leaves the webhook endpoint as a follow-up.

## Technical notes

- No CHECK constraint change needed if we keep `status` as text — verify current constraint and adjust in migration if it restricts values.
- Duplicate-code check in the form stays, but scoped to non-rejected payments so a rejected code can be re-entered corrected.
- All new policies use `get_user_role(auth.uid())` to stay consistent with prior security fixes.
