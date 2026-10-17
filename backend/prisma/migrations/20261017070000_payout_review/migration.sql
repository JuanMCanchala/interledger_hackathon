-- Due-day payouts can complete a debt's quota from profit, and a failed payout waits for the
-- shopkeeper to retry it or mark it paid instead of being retried on its own (ADR 0015).

ALTER TABLE "payouts" ADD COLUMN "top_up" BIGINT,
ADD COLUMN "resolution" TEXT,
ADD COLUMN "resolved_at" TIMESTAMPTZ(3);
