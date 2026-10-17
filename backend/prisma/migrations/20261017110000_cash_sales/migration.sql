-- Cash sales: counted and split, their shares held until the cash is deposited (ADR 0019).

ALTER TABLE "sales" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'qr';

ALTER TABLE "merchants" ADD COLUMN "cash_credit" BIGINT NOT NULL DEFAULT 0;
