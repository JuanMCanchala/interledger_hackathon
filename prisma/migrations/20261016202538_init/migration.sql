-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_scale" INTEGER NOT NULL,
    "daily_cap" BIGINT NOT NULL,
    "mandate_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "merchant_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "share_bps" INTEGER NOT NULL,
    "outstanding" BIGINT,
    "repaid" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("merchant_id","id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_scale" INTEGER NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "customer" TEXT,
    "payment_id" UUID,
    "error" TEXT,
    "settlement_status" TEXT NOT NULL,
    "settlement_reason" TEXT,
    "kept_amount" BIGINT,
    "settled_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "sale_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "rule_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "capped" BOOLEAN NOT NULL,
    "payment_id" UUID,
    "error" TEXT,

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("sale_id","position")
);

-- CreateTable
CREATE TABLE "mandates" (
    "id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "return_to" TEXT,
    "sender" TEXT NOT NULL,
    "max_amount" JSONB NOT NULL,
    "interval" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "interaction" JSONB,
    "token" JSONB,
    "continuation" JSONB,

    CONSTRAINT "mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "return_to" TEXT,
    "sender" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "mandate_id" UUID,
    "incoming_payment_url" TEXT NOT NULL,
    "quote_id" TEXT,
    "quote_expires_at" TEXT,
    "debit_amount" JSONB,
    "receive_amount" JSONB,
    "received_amount" JSONB,
    "outgoing_payment_url" TEXT,
    "authorized_at" TIMESTAMPTZ(3),
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "interaction" JSONB,
    "incoming_token" TEXT,
    "outgoing_token" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_mandate_id_key" ON "merchants"("mandate_id");

-- CreateIndex
CREATE UNIQUE INDEX "rules_merchant_id_position_key" ON "rules"("merchant_id", "position");

-- CreateIndex
CREATE INDEX "sales_merchant_id_created_at_idx" ON "sales"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");

-- CreateIndex
CREATE INDEX "payments_mandate_id_created_at_idx" ON "payments"("mandate_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "mandates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
