import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { randomUUID } from "crypto";
import { serialize } from "../utils/serialize";

// GET /api/redemptions - Get redemptions
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  try {
    const redemptions = await prisma.redemption.findMany({
      where: customerId ? { customerId } : undefined,
      include: {
        customer: {
          select: {
            id: true,
            shopifyCustomerId: true,
            shopId: true,
            currentBalance: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Calculate totals
    const totals = await prisma.redemption.aggregate({
      where: customerId ? { customerId } : undefined,
      _sum: { pointsSpent: true },
      _count: true,
    });

    return Response.json({
      redemptions,
      count: redemptions.length,
      totals: {
        pointsSpent: totals._sum.pointsSpent || 0,
        count: totals._count,
      },
    });
  } catch (error) {
    console.error("Error fetching redemptions:", error);
    return Response.json({ error: "Failed to fetch redemptions" }, { status: 500 });
  }
};

// POST /api/redemptions - Create a new redemption
// DELETE /api/redemptions - Delete a redemption
export const action = async ({ request }: ActionFunctionArgs) => {
  const method = request.method;

  try {
    if (method === "POST") {
      const body = await request.json();
      const { customerId, rewardId, pointsSpent, shopifyDiscountCode } = body;

      if (!customerId || !pointsSpent) {
        return Response.json(
          { error: "customerId and pointsSpent are required" },
          { status: 400 }
        );
      }

      // Verify customer exists and has enough points
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      if ((customer.currentBalance || 0) < pointsSpent) {
        return Response.json(
          {
            error: "Insufficient points",
            currentBalance: customer.currentBalance,
            required: pointsSpent,
          },
          { status: 400 }
        );
      }

      // Generate discount code if not provided
      const discountCode =
        shopifyDiscountCode ||
        `LOYAL${customer.shopifyCustomerId.slice(-4)}_${randomUUID().slice(0, 8).toUpperCase()}`;

      // Create redemption, ledger entry, and update balance in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create redemption record
        const redemption = await tx.redemption.create({
          data: {
            customerId,
            rewardId: rewardId || randomUUID(),
            pointsSpent,
            shopifyDiscountCode: discountCode,
          },
        });

        // Create ledger entry for the deduction
        await tx.ledger.create({
          data: {
            customerId,
            amount: -pointsSpent,
            reason: "redemption",
            metadata: {
              redemptionId: redemption.id,
              discountCode,
            },
          },
        });

        // Update customer balance
        const updatedCustomer = await tx.customer.update({
          where: { id: customerId },
          data: {
            currentBalance: {
              decrement: pointsSpent,
            },
          },
        });

        return { redemption, updatedCustomer };
      });

      return Response.json(
        {
          redemption: result.redemption,
          discountCode,
          newBalance: result.updatedCustomer.currentBalance,
          message: "Redemption created successfully",
        },
        { status: 201 }
      );
    }

    if (method === "DELETE") {
      const body = await request.json();
      const { id, refund = false } = body;

      if (!id) {
        return Response.json({ error: "Redemption id is required" }, { status: 400 });
      }

      const redemption = await prisma.redemption.findUnique({
        where: { id },
      });

      if (!redemption) {
        return Response.json({ error: "Redemption not found" }, { status: 404 });
      }

      if (refund && redemption.customerId) {
        // Delete and refund points
        await prisma.$transaction(async (tx) => {
          await tx.redemption.delete({
            where: { id },
          });

          // Create refund ledger entry
          await tx.ledger.create({
            data: {
              customerId: redemption.customerId!,
              amount: redemption.pointsSpent,
              reason: "redemption_refund",
              metadata: {
                refundedRedemptionId: id,
              },
            },
          });

          await tx.customer.update({
            where: { id: redemption.customerId! },
            data: {
              currentBalance: {
                increment: redemption.pointsSpent,
              },
            },
          });
        });

        return Response.json({ message: "Redemption deleted and points refunded" });
      } else {
        // Just delete without refund
        await prisma.redemption.delete({
          where: { id },
        });

        return Response.json({ message: "Redemption deleted (no refund)" });
      }
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Redemption action error:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
};

