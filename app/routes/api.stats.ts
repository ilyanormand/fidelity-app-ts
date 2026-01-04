import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

// GET /api/stats - Get database statistics
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shopId");

  try {
    // Get counts
    const [customerCount, ledgerCount, redemptionCount] = await Promise.all([
      prisma.customer.count({
        where: shopId ? { shopId } : undefined,
      }),
      prisma.ledger.count(),
      prisma.redemption.count(),
    ]);

    // Get points statistics
    const pointsStats = await prisma.ledger.aggregate({
      _sum: { amount: true },
    });

    const positivePoints = await prisma.ledger.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    });

    const negativePoints = await prisma.ledger.aggregate({
      where: { amount: { lt: 0 } },
      _sum: { amount: true },
    });

    // Get redemption statistics
    const redemptionStats = await prisma.redemption.aggregate({
      _sum: { pointsSpent: true },
      _avg: { pointsSpent: true },
    });

    // Get top customers by balance
    const topCustomers = await prisma.customer.findMany({
      where: shopId ? { shopId } : undefined,
      orderBy: { currentBalance: "desc" },
      take: 5,
      select: {
        id: true,
        shopifyCustomerId: true,
        currentBalance: true,
        customerTags: true,
      },
    });

    // Get recent activity
    const recentLedger = await prisma.ledger.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        customer: {
          select: {
            shopifyCustomerId: true,
          },
        },
      },
    });

    // Get points by reason
    const pointsByReason = await prisma.ledger.groupBy({
      by: ["reason"],
      _sum: { amount: true },
      _count: true,
    });

    return Response.json({
      counts: {
        customers: customerCount,
        ledgerEntries: ledgerCount,
        redemptions: redemptionCount,
      },
      points: {
        total: pointsStats._sum.amount || 0,
        credited: positivePoints._sum.amount || 0,
        debited: Math.abs(negativePoints._sum.amount || 0),
        netBalance: pointsStats._sum.amount || 0,
      },
      redemptions: {
        totalPointsSpent: redemptionStats._sum.pointsSpent || 0,
        averagePointsSpent: Math.round(redemptionStats._avg.pointsSpent || 0),
      },
      pointsByReason: pointsByReason.map((r) => ({
        reason: r.reason,
        totalPoints: r._sum.amount || 0,
        count: r._count,
      })),
      topCustomers,
      recentActivity: recentLedger.map((entry) => ({
        id: entry.id,
        customerId: entry.customer?.shopifyCustomerId,
        amount: entry.amount,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return Response.json({ error: "Failed to fetch statistics" }, { status: 500 });
  }
};

