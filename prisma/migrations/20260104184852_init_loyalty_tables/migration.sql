-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "shopify_customer_id" VARCHAR(255) NOT NULL,
    "shop_id" VARCHAR(255) NOT NULL,
    "current_balance" INTEGER DEFAULT 0,
    "customer_tags" TEXT[],
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "external_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "ShopifyOrderId" BIGINT,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "reward_id" UUID,
    "shopify_discount_code" VARCHAR(255),
    "points_spent" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_shopify_customer_id_shop_id_key" ON "customers"("shopify_customer_id", "shop_id");

-- CreateIndex
CREATE INDEX "ledger_external_id_reason_idx" ON "ledger"("external_id", "reason");

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
