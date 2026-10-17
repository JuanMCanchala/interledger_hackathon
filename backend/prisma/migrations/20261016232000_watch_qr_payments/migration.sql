-- AlterTable
ALTER TABLE "mandates" ADD COLUMN "incoming_access" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "incoming_payment_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_incoming_payment_url_key" ON "sales"("incoming_payment_url");
