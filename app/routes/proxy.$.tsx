import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { processRedemption } from "../utils/redemption.server";
import { createLoyaltyDiscount } from "../utils/createShopifyDiscount.server";
import { syncBalanceToShopify } from "../utils/metafields.server";
import shopify from "../shopify.server";

const SIGNUP_BONUS_POINTS = 15;

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
    console.warn("[proxy] Could not fetch Shopify profile for auto-create:", e);
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
    console.log(`✅ [proxy] Awarded ${SIGNUP_BONUS_POINTS} signup pts to customer ${gid}.`);
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
  const customerId = url.searchParams.get("logged_in_customer_id");
  const path = params["*"]; // Get the splat path

  try {
    // Normalize customerId to GID if it's numeric (DB usually stores GID)
    let gid = customerId;
    if (customerId && !customerId.startsWith("gid://")) {
      gid = `gid://shopify/Customer/${customerId}`;
    }

    // GET /apps/loyalty/customer - Get customer points balance
    if (path === "customer" && gid && shop) {
      let customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: gid, shopId: shop },
        select: { id: true, currentBalance: true, customerTags: true, emailMarketingConsent: true },
      });

      if (!customer) {
        console.log(`[customer] Customer ${gid} not found — auto-creating.`);
        const created = await getOrCreateCustomer(gid, shop);
        customer = {
          id: created.id,
          currentBalance: created.currentBalance,
          customerTags: created.customerTags,
          emailMarketingConsent: created.emailMarketingConsent,
        };
      }

      // Fire-and-forget metafield sync
      shopify.unauthenticated.admin(shop).then(async ({ admin }) => {
        await syncBalanceToShopify(admin, gid, customer!.currentBalance || 0);
      }).catch(err => console.error("Proxy sync error:", err));

      return Response.json({
        success: true,
        customer,
      });
    }

    // GET /apps/loyalty/rewards - Get available rewards for shop
    if (path === "rewards" && shop) {
      const rewards = await prisma.reward.findMany({
        where: {
          shopId: shop,
          isActive: true,
        },
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

      return Response.json({
        success: true,
        rewards,
      });
    }

    // GET /apps/loyalty/transactions - Get customer transaction history
    if (path === "transactions" && gid) {
      const customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: gid },
      });

      if (!customer) {
        return Response.json({
          success: false,
          error: "Customer not found",
        });
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

      return Response.json({
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
      console.log(`[redemptions] Looking up customer: gid=${gid}, shop=${shop}`);

      let customer = await prisma.customer.findFirst({
        where: {
          shopifyCustomerId: gid,
          ...(shop && { shopId: shop }),
        },
      });

      console.log(`[redemptions] Customer found:`, customer ? `id=${customer.id}, balance=${customer.currentBalance}` : "NOT FOUND");

      if (!customer) {
        console.log(`[redemptions] Auto-creating customer ${gid}.`);
        customer = await getOrCreateCustomer(gid, shop!);
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

      // Fetch discount usage from Shopify to mark as used
      let usageMap: Record<string, boolean> = {};

      try {
        const { admin } = await shopify.unauthenticated.admin(shop!);
        const codes = redemptions
          .map(r => r.shopifyDiscountCode)
          .filter(c => c) as string[];

        if (codes.length > 0) {
          // Construct query with aliases to fetch all codes in one request
          // codeDiscountNodeByCode takes a single code, so we use aliases like code_0: ... code_1: ...
          // Deduplicate codes first
          const uniqueCodes = [...new Set(codes)];

          const queryParts = uniqueCodes.map((code, index) => `
            code_${index}: codeDiscountNodeByCode(code: "${code}") {
              codeDiscount {
                ... on DiscountCodeBasic {
                  codes(first: 1) {
                    edges {
                      node {
                        asyncUsageCount
                      }
                    }
                  }
                }
                ... on DiscountCodeBxgy {
                   codes(first: 1) {
                    edges {
                      node {
                        asyncUsageCount
                      }
                    }
                  }
                }
                ... on DiscountCodeFreeShipping {
                   codes(first: 1) {
                    edges {
                      node {
                        asyncUsageCount
                      }
                    }
                  }
                }
              }
            }
          `);

          const response = await admin.graphql(`
            query GetDiscountUsage {
              ${queryParts.join('\n')}
            }
          `);

          const data = await response.json();

          // Map results back to codes
          if (data.data) {
            uniqueCodes.forEach((code, index) => {
              const alias = `code_${index}`;
              const result = data.data[alias];

              if (result?.codeDiscount?.codes?.edges?.length > 0) {
                const usageCount = result.codeDiscount.codes.edges[0].node.asyncUsageCount;
                if (usageCount > 0) {
                  usageMap[code] = true;
                }
              }
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch discount usage:", err);
        // Continue without usage info (defaults to false)
      }

      return Response.json({
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

    return Response.json({
      success: false,
      error: "Invalid endpoint",
      path,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return Response.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerId = url.searchParams.get("logged_in_customer_id");
  const path = params["*"];

  // Get admin context for creating discounts (requires session)
  // Note: App proxy doesn't have admin session, so we'll use a different approach
  // For now, we'll generate codes without creating them in Shopify
  // You'll need to create them via webhook or separate admin endpoint

  try {
    // POST /apps/loyalty/redeem - Redeem points for a reward
    if (path === "redeem") {
      const body = await request.json();
      const { rewardId, cartTotal } = body;

      if (!rewardId) {
        return Response.json({
          success: false,
          error: "rewardId is required",
        }, { status: 400 });
      }

      // Check if customer is logged in
      if (!customerId) {
        return Response.json({
          success: false,
          error: "Customer must be logged in to redeem points",
          requiresLogin: true,
        }, { status: 401 });
      }

      if (!shop) {
        return Response.json({
          success: false,
          error: "Shop parameter missing",
        }, { status: 400 });
      }

      // Convert to GID for internal consistency
      let gid = customerId;
      if (customerId && !customerId.startsWith("gid://")) {
        gid = `gid://shopify/Customer/${customerId}`;
      }

      // Call shared utility directly to avoid internal network calls and 405 errors
      const result = await processRedemption(gid, rewardId, shop, cartTotal);
      return Response.json(result, { status: result.status || (result.success ? 200 : 400) });
    }

    // POST /apps/loyalty/subscribe-newsletter - Subscribe email to newsletter via Admin API
    if (path === "subscribe-newsletter") {
      const body = await request.json();
      const { email } = body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return Response.json({ success: false, error: "Valid email is required" }, { status: 400 });
      }

      if (!shop) {
        return Response.json({ success: false, error: "Shop parameter missing" }, { status: 400 });
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
          return Response.json({ success: true, alreadySubscribed: true });
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
          return Response.json({ success: false, error: updateErrors[0]?.message }, { status: 422 });
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
            console.error("[subscribe-newsletter] Create errors:", createErrors);
            return Response.json({ success: false, error: createErrors[0]?.message }, { status: 422 });
          }
        }
      }

      return Response.json({ success: true });
    }

    return Response.json({
      success: false,
      error: "Invalid endpoint",
    }, { status: 404 });
  } catch (error) {
    console.error("Proxy action error:", error);
    return Response.json({
      success: false,
      error: "Internal server error",
    }, { status: 500 });
  }
};

