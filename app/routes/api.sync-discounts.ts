import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createLoyaltyDiscount } from "../utils/createShopifyDiscount.server";

/**
 * POST /api/sync-discounts
 * 
 * Finds redemptions that have a discount code but were never created in Shopify,
 * and creates them. Can sync for a specific customer or all customers.
 * 
 * Body: { customerId?: string }  (Prisma customer ID, optional)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);
  const body = await request.json().catch(() => ({}));
  const { customerId } = body;

  try {
    // Find all redemptions that need syncing
    const redemptions = await prisma.redemption.findMany({
      where: {
        ...(customerId && { customerId }),
        shopifyDiscountCode: { not: null },
      },
      include: {
        reward: true,
        customer: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (redemptions.length === 0) {
      return Response.json({
        success: true,
        message: "No redemptions found to sync",
        synced: 0,
        failed: 0,
      });
    }

    // Check which codes already exist in Shopify
    const codes = redemptions
      .map((r) => r.shopifyDiscountCode)
      .filter((c): c is string => !!c);
    const uniqueCodes = [...new Set(codes)];

    // Query Shopify to find which codes already exist
    const existingCodes = new Set<string>();
    
    // Check codes in batches (Shopify has alias limits)
    const BATCH_SIZE = 10;
    for (let i = 0; i < uniqueCodes.length; i += BATCH_SIZE) {
      const batch = uniqueCodes.slice(i, i + BATCH_SIZE);
      const queryParts = batch.map(
        (code, index) => `
          code_${i + index}: codeDiscountNodeByCode(code: "${code}") {
            id
          }
        `
      );

      try {
        const response = await admin.graphql(`
          query CheckDiscountCodes {
            ${queryParts.join("\n")}
          }
        `);
        const data = await response.json();

        if (data.data) {
          batch.forEach((code, index) => {
            const alias = `code_${i + index}`;
            if (data.data[alias]?.id) {
              existingCodes.add(code);
            }
          });
        }
      } catch (e) {
        console.warn("Error checking batch of discount codes:", e);
      }

      // Rate limit delay
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Create missing discount codes in Shopify
    let synced = 0;
    let failed = 0;
    const results: Array<{ code: string; status: string; error?: string }> = [];

    for (const redemption of redemptions) {
      const code = redemption.shopifyDiscountCode;
      if (!code || existingCodes.has(code)) {
        if (code && existingCodes.has(code)) {
          results.push({ code, status: "already_exists" });
        }
        continue;
      }

      // Need reward data to create the discount
      if (!redemption.reward) {
        results.push({
          code,
          status: "skipped",
          error: "Reward deleted, cannot recreate discount",
        });
        failed++;
        continue;
      }

      try {
        const discountResult = await createLoyaltyDiscount(
          admin,
          redemption.customer?.shopifyCustomerId || "",
          {
            name: redemption.reward.name,
            discountType: redemption.reward.discountType,
            discountValue: redemption.reward.discountValue,
            minimumCartValue: redemption.reward.minimumCartValue,
          },
          30, // 30 days expiration from now
          code // Pass the existing code from DB so Shopify uses the same one
        );

        if (discountResult.success) {
          synced++;
          results.push({ code, status: "created" });
        } else {
          failed++;
          results.push({
            code,
            status: "failed",
            error: JSON.stringify(discountResult.error),
          });
        }
      } catch (e: any) {
        failed++;
        results.push({ code, status: "failed", error: e.message });
      }

      // Rate limit delay
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return Response.json({
      success: true,
      message: `Synced ${synced} discount codes, ${failed} failed, ${existingCodes.size} already existed.`,
      synced,
      failed,
      alreadyExisted: existingCodes.size,
      total: redemptions.length,
      results,
    });
  } catch (error) {
    console.error("Sync discounts error:", error);
    return Response.json(
      { success: false, error: "Failed to sync discounts" },
      { status: 500 }
    );
  }
};
