-- The shop's limit is monthly, and each debt has a monthly quota (ADR 0013).

-- AlterTable: the cap is now per calendar month.
ALTER TABLE "merchants" RENAME COLUMN "daily_cap" TO "monthly_cap";

-- AlterTable: categories group the shop's wallets; debts get a monthly quota.
ALTER TABLE "rules" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "rules" ADD COLUMN "monthly_quota" BIGINT;

-- Existing rules keep working: debts become microcredits whose quota is their remaining balance.
UPDATE "rules" SET "category" = 'Microcréditos', "monthly_quota" = GREATEST("outstanding", 1) WHERE "kind" = 'debt';
UPDATE "rules" SET "category" = 'Ahorro' WHERE "kind" = 'savings';
