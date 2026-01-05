import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { serialize } from "../utils/serialize";
import { syncBalanceToShopify } from "../utils/metafields.server";
import { authenticate } from "../shopify.server";

// GET /api/ledger - Get ledger entries
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const reason = url.searchParams.get("reason");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  try {
    const entries = await prisma.ledger.findMany({
      where: {
        ...(customerId && { customerId }),
        ...(reason && { reason }),
      },
      include: {
        customer: {
          select: {
            id: true,
            shopifyCustomerId: true,
            shopId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Calculate totals
    const totals = await prisma.ledger.aggregate({
      where: {
        ...(customerId && { customerId }),
        ...(reason && { reason }),
      },
      _sum: { amount: true },
      _count: true,
    });

    return Response.json(serialize({
      entries,
      count: entries.length,
      totals: {
        sum: totals._sum.amount || 0,
        count: totals._count,
      },
    }));
  } catch (error) {
    console.error("Error fetching ledger:", error);
    return Response.json({ error: "Failed to fetch ledger entries" }, { status: 500 });
  }
};

// POST /api/ledger - Create a new ledger entry (add/deduct points)
// DELETE /api/ledger - Delete a ledger entry
export const action = async ({ request }: ActionFunctionArgs) => {
  const method = request.method;
  
  // Try to get admin context for metafield sync (optional)
  let admin;
  try {
    const auth = await authenticate.admin(request);
    admin = auth.admin;
  } catch (e) {
    // If not admin context, continue without sync
    console.log("No admin context for metafield sync");
  }

  try {
    if (method === "POST") {
      const body = await request.json();
      const { customerId, amount, reason, externalId, metadata, shopifyOrderId, syncToShopify = false } = body;

      if (!customerId || amount === undefined || !reason) {
        return Response.json(
          { error: "customerId, amount, and reason are required" },
          { status: 400 }
        );
      }

      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      // Create ledger entry and update customer balance in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const entry = await tx.ledger.create({
          data: {
            customerId,
            amount,
            reason,
            externalId,
            metadata,
            shopifyOrderId: shopifyOrderId ? BigInt(shopifyOrderId) : null,
          },
        });

        const updatedCustomer = await tx.customer.update({
          where: { id: customerId },
          data: {
            currentBalance: {
              increment: amount,
            },
          },
        });

        return { entry, updatedCustomer };
      });

      // Optionally sync to Shopify metafield
      if (syncToShopify && admin && customer.shopifyCustomerId) {
        try {
          await syncBalanceToShopify(
            admin,
            customer.shopifyCustomerId,
            result.updatedCustomer.currentBalance || 0
          );
        } catch (syncError) {
          console.error("Failed to sync to Shopify (non-critical):", syncError);
          // Continue - DB is updated, Shopify sync can be retried later
        }
      }

      return Response.json(
        serialize({
          entry: result.entry,
          newBalance: result.updatedCustomer.currentBalance,
          message: amount > 0 ? "Points added" : "Points deducted",
          shopifySynced: syncToShopify,
        }),
        { status: 201 }
      );
    }

    if (method === "DELETE") {
      const body = await request.json();
      const { id } = body;

      if (!id) {
        return Response.json({ error: "Ledger entry id is required" }, { status: 400 });
      }

      // Get entry first to reverse the balance
      const entry = await prisma.ledger.findUnique({
        where: { id },
      });

      if (!entry) {
        return Response.json({ error: "Ledger entry not found" }, { status: 404 });
      }

      // Delete entry and reverse customer balance
      await prisma.$transaction(async (tx) => {
        await tx.ledger.delete({
          where: { id },
        });

        await tx.customer.update({
          where: { id: entry.customerId },
          data: {
            currentBalance: {
              decrement: entry.amount,
            },
          },
        });
      });

      return Response.json({ message: "Ledger entry deleted and balance reversed" });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Ledger action error:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
};

