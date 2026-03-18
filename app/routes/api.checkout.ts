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

  return corsJson({ success: false, error: "Invalid path" }, { status: 404 });
};

// POST /api/checkout?path=redeem  body: { token, rewardId }
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

  return corsJson({ success: false, error: "Invalid path" }, { status: 404 });
};
