-- The counter display: a phone linked to the shop shows each new sale's QR (ADR 0018).

ALTER TABLE "merchants" ADD COLUMN "display_key" TEXT;

CREATE UNIQUE INDEX "merchants_display_key_key" ON "merchants"("display_key");
