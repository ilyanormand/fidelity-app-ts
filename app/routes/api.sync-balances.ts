import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueSyncBalance } from "../queues/shopify-sync.queue";
import { verifyAllBalances } from "../utils/balanceVerification.server";
import { createLogger } from "../utils/logger.server";

const log = createLogger("api:sync-balances");

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
  const done = log.request("GET", { customerId, verify });

  try {
    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });

      if (!customer) {
        done(404, "customer not found");
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      await enqueueSyncBalance(customer.shopifyCustomerId, customer.currentBalance || 0, customer.shopId);
      log.info(`Enqueued sync for customer ${customerId}, balance=${customer.currentBalance}`);
      done(200, `enqueued balance=${customer.currentBalance}`);
      return Response.json({ message: "Customer sync enqueued", customerId: customer.id, balance: customer.currentBalance, synced: true });
    }

    if (verify) {
      log.info("Starting full balance verification...");
      const verificationResult = await verifyAllBalances();
      log.success(`Verification done: ${JSON.stringify(verificationResult)}`);
      done(200, "verification complete");
      return Response.json({ message: "Balance verification complete", ...verificationResult });
    }

    const customers = await prisma.customer.findMany({
      select: { id: true, shopifyCustomerId: true, currentBalance: true, shopId: true },
    });

    for (const customer of customers) {
      await enqueueSyncBalance(customer.shopifyCustomerId, customer.currentBalance || 0, customer.shopId);
    }

    log.success(`Enqueued ${customers.length} bulk sync jobs`);
    done(200, `${customers.length} jobs enqueued`);
    return Response.json({ message: `Enqueued ${customers.length} sync jobs`, total: customers.length });
  } catch (error) {
    log.error("Sync job error:", error);
    done(500);
    return Response.json({ error: "Sync job failed" }, { status: 500 });
  }
};

