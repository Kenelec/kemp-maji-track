-- Delete orphan $0 pending payments that block M-Pesa form
DELETE FROM payments WHERE amount = 0 AND status = 'pending';