-- Debts are paid in one payment on their due day: each sale only reserves their share (ADR 0014).

ALTER TABLE "rules" ADD COLUMN "due_day" INTEGER;
UPDATE "rules" SET "due_day" = 28 WHERE "kind" = 'debt';

CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_scale" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payment_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payouts_merchant_id_created_at_idx" ON "payouts"("merchant_id", "created_at");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
