-- A failed payout can take its amount from the emergency fund before it is sent again (ADR 0016).

ALTER TABLE "payouts" ADD COLUMN "emergency_payment_id" UUID,
ADD COLUMN "emergency_amount" BIGINT,
ADD COLUMN "emergency_status" TEXT,
ADD COLUMN "emergency_error" TEXT,
ADD COLUMN "emergency_counted" BOOLEAN NOT NULL DEFAULT false;
