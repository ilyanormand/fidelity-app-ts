import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { processRedemption } from "../utils/redemption.server";
import { createLoyaltyDiscount } from "../utils/createShopifyDiscount.server";
import shopify from "../shopify.server";
import { getCachedBalance, setCachedBalance } from "../utils/cache.server";
import { createLogger } from "../utils/logger.server";

const log = createLogger("proxy");

const SIGNUP_BONUS_POINTS = 15;

/**
 * Decode the `sub` claim (customer GID) from a Shopify session token (JWT).
 * Checkout UI extensions can't send Authorization headers without triggering
 * a CORS preflight that the App Proxy rejects, so the token is passed as a
 * query param (?token=...) or in the POST body ({ token: "..." }).
 */
function extractCustomerGidFromToken(token: string | null): string | null {
  try {
    if (!token) return null;
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const json = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload = JSON.parse(json);
    return payload.sub ?? null; // e.g. "gid://shopify/Customer/12345"
  } catch {
    return null;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
};

function corsJson(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init?.headers ?? {}) },
  });
}

/**
 * Auto-create a customer record when it doesn't exist yet in our DB.
 * This is a fallback for the race condition where the customer just signed up
 * and the customers/create webhook hasn't fired yet.
 * Awards the 15-point signup bonus if it hasn't been given already.
 */
async function getOrCreateCustomer(gid: string, shop: string) {
  // Try to fetch Shopify profile data to populate the record properly
  let shopifyProfile: {
    firstName?: string;
    lastName?: string;
    email?: string;
    tags?: string[];
    emailMarketingConsent?: string;
  } = {};

  log.info(`Auto-creating customer gid=${gid} for shop=${shop}`);

  try {
    const { admin } = await shopify.unauthenticated.admin(shop);
    const response = await admin.graphql(
      `#graphql
      query GetCustomer($id: ID!) {
        customer(id: $id) {
          firstName
          lastName
          email
          tags
          emailMarketingConsent {
            marketingState
          }
        }
      }`,
      { variables: { id: gid } }
    );
    const data = await response.json();
    const c = data.data?.customer;
    if (c) {
      shopifyProfile = {
        firstName: c.firstName ?? undefined,
        lastName: c.lastName ?? undefined,
        email: c.email ?? undefined,
        tags: c.tags ?? [],
        emailMarketingConsent: c.emailMarketingConsent?.marketingState?.toLowerCase() ?? undefined,
      };
    }
  } catch (e) {
    log.warn("Could not fetch Shopify profile for auto-create:", e);
  }

  const displayName = shopifyProfile.firstName
    ? `${shopifyProfile.firstName} ${shopifyProfile.lastName ?? ""}`.trim()
    : (shopifyProfile.email ?? null);

  // upsert handles the race condition: concurrent requests won't conflict
  const customer = await prisma.customer.upsert({
    where: { shopifyCustomerId_shopId: { shopifyCustomerId: gid, shopId: shop } },
    create: {
      shopifyCustomerId: gid,
      shopId: shop,
      currentBalance: 0, // bonus awarded below after idempotency check
      firstName: shopifyProfile.firstName ?? null,
      lastName: shopifyProfile.lastName ?? null,
      email: shopifyProfile.email ?? null,
      displayName,
      customerTags: shopifyProfile.tags ?? [],
      emailMarketingConsent: shopifyProfile.emailMarketingConsent ?? null,
    },
    update: {
      // If the record already exists, just refresh the profile data
      firstName: shopifyProfile.firstName ?? undefined,
      lastName: shopifyProfile.lastName ?? undefined,
      email: shopifyProfile.email ?? undefined,
      displayName: displayName ?? undefined,
      customerTags: shopifyProfile.tags ?? undefined,
      emailMarketingConsent: shopifyProfile.emailMarketingConsent ?? undefined,
    },
  });

  // Award signup bonus idempotently — only if never given before
  const existingBonus = await prisma.ledger.findFirst({
    where: { customerId: customer.id, reason: "signup_bonus" },
  });

  if (!existingBonus) {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: { currentBalance: { increment: SIGNUP_BONUS_POINTS } },
      });
      await tx.ledger.create({
        data: {
          customerId: customer.id,
          amount: SIGNUP_BONUS_POINTS,
          reason: "signup_bonus",
          metadata: {
            note: "Welcome bonus — auto-created on first widget visit",
            shopifyCustomerId: gid,
          },
        },
      });
    });
    customer.currentBalance = (customer.currentBalance ?? 0) + SIGNUP_BONUS_POINTS;
    log.success(`Awarded ${SIGNUP_BONUS_POINTS} signup pts to customer ${gid}`);
  } else {
    log.info(`Customer ${gid} already has signup bonus — skipping`);
  }

  return customer;
}

/**
 * App Proxy Route (Splat Route)
 *
 * Storefront URL: https://{shop}/apps/loyalty/*
 * Proxies to: https://{app-url}/proxy/*
 *
 * Available paths:
 * - GET  /apps/loyalty/customer - Get customer points balance
 * - GET  /apps/loyalty/rewards - Get available rewards
 * - POST /apps/loyalty/redeem - Redeem points for a reward
 * - GET  /apps/loyalty/transactions - Get transaction history
 */

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  // logged_in_customer_id is set by App Proxy for theme/storefront requests.
  // Checkout UI extensions pass a session token via ?token= query param instead.
  const customerId =
    url.searchParams.get("logged_in_customer_id") ||
    extractCustomerGidFromToken(url.searchParams.get("token"));
  const path = params["*"]; // Get the splat path

  log.info(`GET /${path} shop=${shop} customerId=${customerId || "guest"}`);

  try {
    let gid = customerId;
    if (customerId && !customerId.startsWith("gid://")) {
      gid = `gid://shopify/Customer/${customerId}`;
    }

    // GET /apps/loyalty/customer - Get customer points balance
    if (path === "customer" && gid && shop) {
      // Try Redis cache first
      const cached = await getCachedBalance(gid, shop);
      if (cached !== null) {
        log.info(`Cache HIT for ${gid} — balance=${cached}`);
        const customer = await prisma.customer.findFirst({
          where: { shopifyCustomerId: gid, shopId: shop },
          select: { id: true, customerTags: true, emailMarketingConsent: true },
        });
        if (customer) {
          return corsJson({ success: true, customer: { ...customer, currentBalance: cached } });
        }
      }

      log.info(`Cache MISS for ${gid} — querying DB`);
      let customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: gid, shopId: shop },
        select: { id: true, currentBalance: true, customerTags: true, emailMarketingConsent: true },
      });

      if (!customer) {
        log.warn(`Customer ${gid} not found — auto-creating`);
        const created = await getOrCreateCustomer(gid, shop);
        customer = {
          id: created.id,
          currentBalance: created.currentBalance,
          customerTags: created.customerTags,
          emailMarketingConsent: created.emailMarketingConsent,
        };
      }

      // Populate cache for next request
      await setCachedBalance(gid, shop, customer.currentBalance ?? 0);
      log.info(`Returned customer ${gid} balance=${customer.currentBalance}`);

      return corsJson({ success: true, customer });
    }

    // GET /apps/loyalty/rewards - Get available rewards for shop
    if (path === "rewards" && shop) {
      const rewards = await prisma.reward.findMany({
        where: { shopId: shop, isActive: true },
        select: { id: true, name: true, description: true, imageUrl: true, pointsCost: true, discountType: true, discountValue: true, minimumCartValue: true },
        orderBy: { pointsCost: "asc" },
      });
      log.info(`Returned ${rewards.length} rewards for shop=${shop}`);
      return corsJson({ success: true, rewards });
    }

    // GET /apps/loyalty/reward-products — list active reward products (variant IDs)
    if (path === "reward-products" && shop) {
      const rewardProducts = await prisma.rewardProduct.findMany({
        where: { shopId: shop, isActive: true },
        select: { id: true, shopifyVariantId: true, shopifyProductTitle: true, pointsCost: true },
        orderBy: { pointsCost: "asc" },
      });
      log.info(`Returned ${rewardProducts.length} reward products for shop=${shop}`);
      return corsJson({ success: true, rewardProducts });
    }

    // GET /apps/loyalty/transactions - Get customer transaction history
    if (path === "transactions" && gid) {
      const customer = await prisma.customer.findFirst({ where: { shopifyCustomerId: gid } });

      if (!customer) {
        log.warn(`Transactions: customer ${gid} not found`);
        return corsJson({ success: false, error: "Customer not found" });
      }

      const transactions = await prisma.ledger.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          amount: true,
          reason: true,
          createdAt: true,
        },
      });

      return corsJson({
        success: true,
        transactions: transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          reason: t.reason,
          date: t.createdAt?.toISOString(),
        })),
      });
    }

    // GET /apps/loyalty/redemptions - Get customer redemptions (My Rewards)
    if (path === "redemptions" && gid) {
      log.info(`Redemptions lookup: gid=${gid} shop=${shop}`);

      let customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: gid, ...(shop && { shopId: shop }) },
      });

      if (!customer) {
        log.warn(`Redemptions: customer ${gid} not found — auto-creating`);
        customer = await getOrCreateCustomer(gid, shop!);
      } else {
        log.info(`Redemptions: customer found id=${customer.id} balance=${customer.currentBalance}`);
      }

      const redemptions = await prisma.redemption.findMany({
        where: { customerId: customer.id },
        include: {
          reward: {
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
              discountType: true,
              discountValue: true,
              minimumCartValue: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20, // Limit to last 20 redemptions for performance
      });

      // Build usage map from our own ledger (written by orders/paid webhook instantly)
      const usageMap: Record<string, boolean> = {};
      try {
        const usedEntries = await prisma.ledger.findMany({
          where: { customerId: customer.id, reason: "discount_code_used" },
          select: { metadata: true },
        });
        for (const entry of usedEntries) {
          const meta = entry.metadata as { discountCode?: string } | null;
          if (meta?.discountCode) {
            usageMap[meta.discountCode] = true;
          }
        }
      } catch (err) {
        console.error("Failed to fetch discount usage from ledger:", err);
      }

      return corsJson({
        success: true,
        redemptions: redemptions.map((r) => {
          const isUsed = r.shopifyDiscountCode ? !!usageMap[r.shopifyDiscountCode] : false;

          const createdAt = r.createdAt ?? new Date();
          const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

          return {
            id: r.id,
            discountCode: r.shopifyDiscountCode,
            pointsSpent: r.pointsSpent,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            used: isUsed,
            // Use linked reward data if available, otherwise use stored name
            reward: r.reward
              ? {
                id: r.reward.id,
                name: r.reward.name,
                description: r.reward.description,
                imageUrl: r.reward.imageUrl,
                discountType: r.reward.discountType,
                discountValue: r.reward.discountValue,
                minimumCartValue: r.reward.minimumCartValue,
              }
              : {
                name: r.rewardName || "Unknown Reward",
                description: null,
                imageUrl: null,
                discountType: "fixed_amount",
                discountValue: 0,
                minimumCartValue: null,
              },
          };
        }),
      });
    }

    return corsJson({
      success: false,
      error: "Invalid endpoint",
      path,
    });
  } catch (error) {
    log.error("Proxy loader error:", error);
    return corsJson({ success: false, error: "Internal server error" }, { status: 500 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const path = params["*"];

  // Parse body once — handles both application/json and text/plain (checkout extensions
  // send text/plain to avoid CORS preflight)
  let parsedBody: Record<string, any> = {};
  try {
    const raw = await request.text();
    if (raw) parsedBody = JSON.parse(raw);
  } catch { /* empty body or non-JSON */ }

  // Resolve customer ID: App Proxy sets logged_in_customer_id for storefront;
  // checkout extensions pass a session token via ?token= or body.token
  const customerId =
    url.searchParams.get("logged_in_customer_id") ||
    extractCustomerGidFromToken(url.searchParams.get("token") || parsedBody.token || null);

  log.info(`POST /${path} shop=${shop} customerId=${customerId || "guest"}`);

  try {
    // POST /apps/loyalty/redeem - Redeem points for a reward
    if (path === "redeem") {
      const { rewardId, cartTotal } = parsedBody;
      log.info(`Redeem request: rewardId=${rewardId} cartTotal=${cartTotal} customer=${customerId}`);

      if (!rewardId) {
        log.warn("Redeem: missing rewardId");
        return corsJson({ success: false, error: "rewardId is required" }, { status: 400 });
      }

      if (!customerId) {
        log.warn("Redeem: customer not logged in");
        return corsJson({ success: false, error: "Customer must be logged in to redeem points", requiresLogin: true }, { status: 401 });
      }

      if (!shop) {
        log.warn("Redeem: missing shop param");
        return corsJson({ success: false, error: "Shop parameter missing" }, { status: 400 });
      }

      let gid = customerId;
      if (customerId && !customerId.startsWith("gid://")) {
        gid = `gid://shopify/Customer/${customerId}`;
      }

      const result = await processRedemption(gid, rewardId, shop, cartTotal);
      log.success(`Redeem result: success=${result.success} code=${(result as any).discountCode || "N/A"}`);
      return corsJson(result, { status: result.status || (result.success ? 200 : 400) });
    }

    // POST /apps/loyalty/subscribe-newsletter - Subscribe email to newsletter via Admin API
    if (path === "subscribe-newsletter") {
      const { email } = parsedBody;
      log.info(`Newsletter subscribe: email=${email}`);

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return corsJson({ success: false, error: "Valid email is required" }, { status: 400 });
      }

      if (!shop) {
        return corsJson({ success: false, error: "Shop parameter missing" }, { status: 400 });
      }

      const { admin } = await shopify.unauthenticated.admin(shop);

      // Search for existing customer by email
      const searchRes = await admin.graphql(
        `#graphql
        query FindCustomerByEmail($query: String!) {
          customers(first: 1, query: $query) {
            edges {
              node {
                id
                email
                emailMarketingConsent {
                  marketingState
                }
              }
            }
          }
        }`,
        { variables: { query: `email:${email}` } }
      );
      const searchData = await searchRes.json();
      const existingNode = searchData.data?.customers?.edges?.[0]?.node;

      if (existingNode) {
        const alreadySubscribed = existingNode.emailMarketingConsent?.marketingState === "SUBSCRIBED";
        if (alreadySubscribed) {
          return corsJson({ success: true, alreadySubscribed: true });
        }

        // Update existing customer's email marketing consent
        const updateRes = await admin.graphql(
          `#graphql
          mutation UpdateEmailConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
            customerEmailMarketingConsentUpdate(input: $input) {
              customer { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              input: {
                customerId: existingNode.id,
                emailMarketingConsent: {
                  marketingState: "SUBSCRIBED",
                  marketingOptInLevel: "SINGLE_OPT_IN",
                  consentUpdatedAt: new Date().toISOString(),
                },
              },
            },
          }
        );
        const updateData = await updateRes.json();
        const updateErrors = updateData.data?.customerEmailMarketingConsentUpdate?.userErrors ?? [];
        if (updateErrors.length > 0) {
          console.error("[subscribe-newsletter] Update errors:", updateErrors);
          return corsJson({ success: false, error: updateErrors[0]?.message }, { status: 422 });
        }
      } else {
        // Create new customer with email marketing opted in
        const createRes = await admin.graphql(
          `#graphql
          mutation CreateSubscriber($input: CustomerInput!) {
            customerCreate(input: $input) {
              customer { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              input: {
                email,
                emailMarketingConsent: {
                  marketingState: "SUBSCRIBED",
                  marketingOptInLevel: "SINGLE_OPT_IN",
                  consentUpdatedAt: new Date().toISOString(),
                },
              },
            },
          }
        );
        const createData = await createRes.json();
        const createErrors = createData.data?.customerCreate?.userErrors ?? [];
        if (createErrors.length > 0) {
          const emailTaken = createErrors.some((e: { message?: string }) =>
            e.message?.toLowerCase().includes("email") && e.message?.toLowerCase().includes("taken")
          );
          if (!emailTaken) {
            log.error("subscribe-newsletter create errors:", createErrors);
            return corsJson({ success: false, error: createErrors[0]?.message }, { status: 422 });
          }
        }
      }

      log.success(`Newsletter subscription processed for email=${email}`);
      return corsJson({ success: true });
    }

    log.warn(`Unknown proxy action path: /${path}`);
    return corsJson({ success: false, error: "Invalid endpoint" }, { status: 404 });
  } catch (error) {
    log.error("Proxy action error:", error);
    return corsJson({ success: false, error: "Internal server error" }, { status: 500 });
  }
};

