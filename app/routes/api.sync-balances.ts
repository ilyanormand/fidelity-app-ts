import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncBalanceToShopify } from "../utils/metafields.server";
import { verifyAllBalances } from "../utils/balanceVerification.server";

/**
 * Background Sync Job
 * 
 * GET /api/sync-balances - Sync all customer balances to Shopify metafields
 * GET /api/sync-balances?verify=true - Verify and auto-correct all balances
 * GET /api/sync-balances?customerId=xxx - Sync single customer
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  const customerId = url.searchParams.get("customerId");
  const verify = url.searchParams.get("verify") === "true";

  try {
    // Sync single customer
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      const result = await syncBalanceToShopify(
        admin,
        customer.shopifyCustomerId,
        customer.currentBalance || 0
      );

      return Response.json({
        message: "Customer synced",
        customerId: customer.id,
        balance: customer.currentBalance,
        synced: result.success,
      });
    }

    // Verify all balances (recalculate from ledger)
    if (verify) {
      const verificationResult = await verifyAllBalances(admin);

      return Response.json({
        message: "Balance verification complete",
        ...verificationResult,
      });
    }

    // Sync all customers
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        shopifyCustomerId: true,
        currentBalance: true,
        shopId: true,
      },
    });

    let synced = 0;
    let errors = 0;
    const failedSyncs = [];

    for (const customer of customers) {
      try {
        const result = await syncBalanceToShopify(
          admin,
          customer.shopifyCustomerId,
          customer.currentBalance || 0
        );

        if (result.success) {
          synced++;
        } else {
          errors++;
          failedSyncs.push({
            customerId: customer.id,
            error: result.error,
          });
        }
      } catch (error) {
        errors++;
        failedSyncs.push({
          customerId: customer.id,
          error: String(error),
        });
      }

      // Rate limiting protection - wait 100ms between syncs
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return Response.json({
      message: "Sync complete",
      total: customers.length,
      synced,
      errors,
      failedSyncs: errors > 0 ? failedSyncs : undefined,
    });
  } catch (error) {
    console.error("Sync job error:", error);
    return Response.json({ error: "Sync job failed" }, { status: 500 });
  }
};

