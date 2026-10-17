-- QR payments are no longer matched by amount: each sale has its own incoming payment.

-- DropIndex
DROP INDEX "sales_incoming_payment_url_key";

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "incoming_payment_url";

-- AlterTable
ALTER TABLE "mandates" DROP COLUMN "incoming_access";
