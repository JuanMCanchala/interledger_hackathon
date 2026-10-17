-- Payment requests have no known payer.

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "sender" DROP NOT NULL;
