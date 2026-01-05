import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

  try {
    // POST /apps/loyalty/redeem - Redeem points for a reward
    if (path === "redeem" && customerId && shop) {
      const body = await request.json();
      const { rewardId, cartTotal } = body;

      if (!rewardId) {
        return Response.json({
          success: false,
          error: "rewardId is required",
        }, { status: 400 });
      }

      // Find customer
      const customer = await prisma.customer.findFirst({
        where: {
          shopifyCustomerId: customerId,
          shopId: shop,
        },
      });

      if (!customer) {
        return Response.json({
          success: false,
          error: "Customer not found. Please sign up for loyalty program.",
        }, { status: 404 });
      }

      // Find reward
      const reward = await prisma.reward.findUnique({
        where: { id: rewardId },
      });

      if (!reward || !reward.isActive) {
        return Response.json({
          success: false,
          error: "Reward not available",
        }, { status: 404 });
      }

      // Check if customer has enough points
      if ((customer.currentBalance || 0) < reward.pointsCost) {
        return Response.json({
          success: false,
          error: "Insufficient points",
          required: reward.pointsCost,
          current: customer.currentBalance,
        }, { status: 400 });
      }

      // Check minimum cart value
      if (reward.minimumCartValue && cartTotal < reward.minimumCartValue) {
        return Response.json({
          success: false,
          error: "Cart total below minimum",
          minimumRequired: reward.minimumCartValue / 100,
        }, { status: 400 });
      }

      // Generate discount code
      const discountCode = `LOYAL${customerId.slice(-4)}_${Date.now().toString(36).toUpperCase()}`;

      // Create redemption and update balance in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create redemption
        const redemption = await tx.redemption.create({
          data: {
            customerId: customer.id,
            rewardName: reward.name,
            shopifyDiscountCode: discountCode,
            pointsSpent: reward.pointsCost,
          },
        });

        // Create ledger entry
        await tx.ledger.create({
          data: {
            customerId: customer.id,
            amount: -reward.pointsCost,
            reason: "redemption",
            metadata: {
              redemptionId: redemption.id,
              rewardName: reward.name,
            },
          },
        });

        // Update customer balance
        const updatedCustomer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            currentBalance: {
              decrement: reward.pointsCost,
            },
          },
        });

        return { redemption, updatedCustomer };
      });

      return Response.json({
        success: true,
        discountCode,
        newBalance: result.updatedCustomer.currentBalance,
        redemption: {
          id: result.redemption.id,
          rewardName: reward.name,
          pointsSpent: reward.pointsCost,
        },
      });
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

