-- A new monthly cap waits here for the merchant's approval; the current grant keeps working.

ALTER TABLE "merchants" ADD COLUMN "pending_cap" BIGINT,
ADD COLUMN "pending_mandate_id" UUID;
