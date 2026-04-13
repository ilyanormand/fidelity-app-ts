/**
 * Dedicated routes for Checkout UI Extensions.
 *
 * These routes bypass the App Proxy entirely so that checkout extensions can
 * call them directly from the app server URL. This is necessary because
 * Shopify's App Proxy redirects requests from checkout extensions when the
 * store is password-protected (common for dev/staging stores), which breaks
 * CORS preflight handling.
 *
 * Authentication: Shopify session token JWT passed via:
 *   - GET  ?token=<jwt>      → /api/checkout?path=rewards&shop=<domain>
 *   - POST body { token, ... } → /api/checkout?path=redeem
 *
 * The JWT `dest` claim = shop myshopify domain
 * The JWT `sub`  claim = customer GID (if logged in)
 */
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { processRedemption } from "../utils/redemption.server";
import { createLogger } from "../utils/logger.server";
import { enqueueSyncBalance } from "../queues/shopify-sync.queue";
import { invalidateBalance } from "../utils/cache.server";

const log = createLogger("api:checkout");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init?.headers ?? {}) },
  });
}

function decodeSessionToken(token: string | null): { shop: string | null; customerGid: string | null } {
  try {
    if (!token) return { shop: null, customerGid: null };
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return { shop: null, customerGid: null };
    const json = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(json);
    return {
      shop: payload.dest ?? null,       // e.g. "fwn-test-store.myshopify.com"
      customerGid: payload.sub ?? null, // e.g. "gid://shopify/Customer/12345"
    };
  } catch {
    return { shop: null, customerGid: null };
  }
}

// GET /api/checkout?path=rewards&token=<jwt>
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const token = url.searchParams.get("token");

  if (path === "rewards") {
    const { shop } = decodeSessionToken(token);
    log.info(`GET checkout/rewards shop=${shop}`);

    if (!shop) {
      return corsJson({ success: false, error: "Invalid session token" }, { status: 401 });
    }

    const rewards = await prisma.reward.findMany({
      where: { shopId: shop, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        pointsCost: true,
        discountType: true,
        discountValue: true,
        minimumCartValue: true,
      },
      orderBy: { pointsCost: "asc" },
    });

    log.info(`Returned ${rewards.length} rewards for shop=${shop}`);
    return corsJson({ success: true, rewards });
  }

  if (path === "reward-products") {
    const { shop } = decodeSessionToken(token);
    log.info(`GET checkout/reward-products shop=${shop}`);

    if (!shop) {
      return corsJson({ success: false, error: "Invalid session token" }, { status: 401 });
    }

    const rewardProducts = await prisma.rewardProduct.findMany({
      where: { shopId: shop, isActive: true },
      select: {
        id: true,
        shopifyProductId: true,
        shopifyVariantId: true,
        shopifyProductTitle: true,
        shopifyProductImageUrl: true,
        pointsCost: true,
      },
      orderBy: { pointsCost: "asc" },
    });

    log.info(`Returned ${rewardProducts.length} reward products for shop=${shop}`);
    return corsJson({ success: true, rewardProducts });
  }

  return corsJson({ success: false, error: "Invalid path" }, { status: 404 });
};

// POST /api/checkout?path=redeem  body: { token, rewardId }
// POST /api/checkout?path=validate-product-redemption  body: { token, variantId, pointsCost }
export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");

  let body: Record<string, any> = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch { /* empty */ }

  if (path === "redeem") {
    const { token, rewardId, cartTotal } = body;
    const { shop, customerGid } = decodeSessionToken(token);

    log.info(`POST checkout/redeem rewardId=${rewardId} shop=${shop} customer=${customerGid}`);

    if (!rewardId) {
      return corsJson({ success: false, error: "rewardId is required" }, { status: 400 });
    }
    if (!customerGid) {
      return corsJson({ success: false, error: "Customer must be logged in", requiresLogin: true }, { status: 401 });
    }
    if (!shop) {
      return corsJson({ success: false, error: "Invalid session token" }, { status: 401 });
    }

    const result = await processRedemption(customerGid, rewardId, shop, cartTotal);
    log.success(`Redeem result: success=${result.success} code=${(result as any).discountCode || "N/A"}`);
    return corsJson(result, { status: (result as any).status || (result.success ? 200 : 400) });
  }

  if (path === "validate-product-redemption" || path === "confirm-product-redemption") {
    const { token, variantId, pointsCost, productTitle } = body;
    const { shop, customerGid } = decodeSessionToken(token);

    log.info(`POST checkout/${path} variantId=${variantId} pointsCost=${pointsCost} shop=${shop} customer=${customerGid}`);

    if (!customerGid) {
      return corsJson({ success: false, error: "Customer must be logged in", requiresLogin: true }, { status: 401 });
    }
    if (!shop) {
      return corsJson({ success: false, error: "Invalid session token" }, { status: 401 });
    }
    if (!variantId || pointsCost === undefined || pointsCost === null) {
      return corsJson({ success: false, error: "variantId and pointsCost are required" }, { status: 400 });
    }

    const cost = Number(pointsCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      return corsJson({ success: false, error: "pointsCost must be a positive number" }, { status: 400 });
    }

    const customer = await prisma.customer.findFirst({
      where: { shopifyCustomerId: customerGid, shopId: shop },
      select: { id: true, currentBalance: true },
    });

    if (!customer) {
      return corsJson({ success: false, error: "Customer not found" }, { status: 404 });
    }

    const balance = customer.currentBalance ?? 0;
    if (balance < cost) {
      log.info(`${path}: insufficient points balance=${balance} required=${cost}`);
      return corsJson({
        success: false,
        error: "insufficient_points",
        currentBalance: balance,
        required: cost,
      }, { status: 400 });
    }

    // confirm-product-redemption: deduct from DB immediately
    if (path === "confirm-product-redemption") {
      try {
        const idempotencyKey = `checkout_product_${customerGid}_${variantId}_${Date.now()}`;

        await prisma.$transaction(async (tx) => {
          await tx.ledger.create({
            data: {
              customerId: customer.id,
              amount: -cost,
              reason: "free_product_redemption",
              externalId: idempotencyKey,
              metadata: {
                variantId,
                productTitle: productTitle || variantId,
                source: "checkout_confirm",
              },
            },
          });

          await tx.redemption.create({
            data: {
              customerId: customer.id,
              rewardName: `free_product:${variantId}:qty1`,
              pointsSpent: cost,
            },
          });

          await tx.customer.update({
            where: { id: customer.id },
            data: { currentBalance: { decrement: cost } },
          });
        });

        const updated = await prisma.customer.findUnique({
          where: { id: customer.id },
          select: { currentBalance: true },
        });
        const newBalance = updated?.currentBalance ?? 0;

        log.success(`confirm-product-redemption: deducted ${cost} pts for ${variantId}. New balance: ${newBalance}`);

        // Sync metafield asynchronously
        await enqueueSyncBalance(customerGid, newBalance, shop).catch(() => {});
        await invalidateBalance(customerGid, shop).catch(() => {});

        return corsJson({
          success: true,
          authorized: true,
          currentBalance: newBalance,
          idempotencyKey,
        });
      } catch (err) {
        log.error(`confirm-product-redemption: DB error — ${err}`);
        return corsJson({ success: false, error: "Failed to deduct points" }, { status: 500 });
      }
    }

    // validate-product-redemption: just check, don't deduct (legacy)
    log.success(`validate-product-redemption: authorized variantId=${variantId} balance=${balance} cost=${cost}`);
    return corsJson({ success: true, authorized: true, currentBalance: balance });
  }

  if (path === "rollback-product-redemption") {
    const { token, variantId, pointsCost, productTitle } = body;
    const { shop, customerGid } = decodeSessionToken(token);

    log.info(`POST checkout/rollback-product-redemption variantId=${variantId} pointsCost=${pointsCost} shop=${shop} customer=${customerGid}`);

    if (!customerGid || !shop || !variantId) {
      return corsJson({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const cost = Number(pointsCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      return corsJson({ success: false, error: "Invalid pointsCost" }, { status: 400 });
    }

    try {
      const customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: customerGid, shopId: shop },
        select: { id: true, currentBalance: true },
      });

      if (!customer) {
        return corsJson({ success: false, error: "Customer not found" }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.ledger.create({
          data: {
            customerId: customer.id,
            amount: cost,
            reason: "free_product_rollback",
            metadata: {
              variantId,
              productTitle: productTitle || variantId,
              source: "checkout_abandoned",
            },
          },
        });

        await tx.customer.update({
          where: { id: customer.id },
          data: { currentBalance: { increment: cost } },
        });
      });

      const updated = await prisma.customer.findUnique({
        where: { id: customer.id },
        select: { currentBalance: true },
      });
      const newBalance = updated?.currentBalance ?? 0;

      log.success(`rollback-product-redemption: refunded ${cost} pts for ${variantId}. New balance: ${newBalance}`);

      await enqueueSyncBalance(customerGid, newBalance, shop).catch(() => {});
      await invalidateBalance(customerGid, shop).catch(() => {});

      return corsJson({ success: true, newBalance });
    } catch (err) {
      log.error(`rollback-product-redemption: DB error — ${err}`);
      return corsJson({ success: false, error: "Failed to rollback" }, { status: 500 });
    }
  }

  return corsJson({ success: false, error: "Invalid path" }, { status: 404 });
};
