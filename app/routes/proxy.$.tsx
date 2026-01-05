import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { processRedemption } from "../utils/redemption.server";
import { createLoyaltyDiscount } from "../utils/createShopifyDiscount.server";

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
    // GET /apps/loyalty/customer - Get customer balance and info
    if (path === "customer" && customerId && shop) {
      const customer = await prisma.customer.findFirst({
        where: {
          shopifyCustomerId: customerId,
          shopId: shop,
        },
        select: {
          id: true,
          currentBalance: true,
          customerTags: true,
        },
      });

      return Response.json({
        success: true,
        customer: customer || { currentBalance: 0, customerTags: [] },
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
    if (path === "transactions" && customerId) {
      const customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: customerId },
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
    if (path === "redemptions" && customerId) {
      const customer = await prisma.customer.findFirst({
        where: { shopifyCustomerId: customerId },
      });

      if (!customer) {
        return Response.json({
          success: false,
          error: "Customer not found",
        });
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
      });

      return Response.json({
        success: true,
        redemptions: redemptions.map((r) => ({
          id: r.id,
          discountCode: r.shopifyDiscountCode,
          pointsSpent: r.pointsSpent,
          createdAt: r.createdAt?.toISOString(),
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
        })),
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

      // Call shared utility directly to avoid internal network calls and 405 errors
      const result = await processRedemption(customerId, rewardId, shop, cartTotal);
      return Response.json(result, { status: result.status || (result.success ? 200 : 400) });
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

