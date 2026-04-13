-- CreateTable
CREATE TABLE "reward_products" (
    "id" UUID NOT NULL,
    "shop_id" VARCHAR(255) NOT NULL,
    "shopify_product_id" VARCHAR(255) NOT NULL,
    "shopify_variant_id" VARCHAR(255) NOT NULL,
    "shopify_product_title" VARCHAR(255) NOT NULL,
    "shopify_product_image_url" VARCHAR(512),
    "points_cost" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_products_shop_id_shopify_variant_id_key" ON "reward_products"("shop_id", "shopify_variant_id");
