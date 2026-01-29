import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import shopify, { sessionStorage } from "../shopify.server";
import prisma from "../db.server";
import { createLoyaltyDiscount } from "../utils/createShopifyDiscount.server";
import { processRedemption } from "../utils/redemption.server";

/**
 * Internal API for creating redemptions with Shopify discount codes
 * Called by app proxy - uses shop domain to get session
 * 
 * GET /api/redeem - Not supported (returns error)
 * POST /api/redeem - Create a redemption
 */

// Handle GET requests (not supported)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return Response.json(
    {
      success: false,
      error: "This endpoint only accepts POST requests",
      method: "POST",
      requiredFields: ["shopifyCustomerId", "rewardId", "shop", "cartTotal"]
    },
    { status: 405 }
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json();
    const { shopifyCustomerId, rewardId, cartTotal, shop } = body;

    // We pass existingAdminClient=undefined so processRedemption handles the lookup using correct unauthenticated method
    const result = await processRedemption(
      shopifyCustomerId,
      rewardId,
      shop,
      cartTotal,
      undefined
    );

    return Response.json(result, { status: result.status || (result.success ? 200 : 400) });
  } catch (error) {
    console.error("Redeem error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
};

