import prisma from "../db.server";

export async function getGeneralStats(shopId: string) {
  // Get customer count
  const customerCount = await prisma.customer.count({
    where: { shopId },
  });

  // Get points statistics
  const positivePoints = await prisma.ledger.aggregate({
    where: {
      amount: { gt: 0 },
      customer: { shopId },
    },
    _sum: { amount: true },
  });

  const negativePoints = await prisma.ledger.aggregate({
    where: {
      amount: { lt: 0 },
      customer: { shopId },
    },
    _sum: { amount: true },
  });

  // Get redemptions this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const redemptionsThisMonth = await prisma.redemption.count({
    where: {
      createdAt: { gte: startOfMonth },
      customer: { shopId },
    },
  });

  // Get last month's data for comparison
  const startOfLastMonth = new Date(startOfMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
  const endOfLastMonth = new Date(startOfMonth);
  endOfLastMonth.setMilliseconds(-1);

  const redemptionsLastMonth = await prisma.redemption.count({
    where: {
      createdAt: {
        gte: startOfLastMonth,
        lte: endOfLastMonth,
      },
      customer: { shopId },
    },
  });

  // Calculate deltas
  const totalIssued = positivePoints._sum.amount || 0;
  const totalRedeemed = Math.abs(negativePoints._sum.amount || 0);

  // Calculate percentage changes (mock previous period for now)
  const issuedDelta = "+5.2%"; // Would need historical data
  const redeemedDelta = "+8.1%";
  const membersDelta = "+1.2%";

  const redemptionsDelta =
    redemptionsLastMonth > 0
      ? (
          ((redemptionsThisMonth - redemptionsLastMonth) /
            redemptionsLastMonth) *
          100
        ).toFixed(1)
      : "0";

  const redemptionsDeltaStr =
    Number(redemptionsDelta) >= 0
      ? `+${redemptionsDelta}%`
      : `${redemptionsDelta}%`;

  return [
    {
      label: "Total points issued",
      value: totalIssued.toLocaleString("en-US"),
      delta: issuedDelta,
      positive: true,
    },
    {
      label: "Points redeemed",
      value: totalRedeemed.toLocaleString("en-US"),
      delta: redeemedDelta,
      positive: true,
    },
    {
      label: "Active loyalty members",
      value: customerCount.toLocaleString("en-US"),
      delta: membersDelta,
      positive: true,
    },
    {
      label: "Redemptions this month",
      value: redemptionsThisMonth.toString(),
      delta: redemptionsDeltaStr,
      positive: Number(redemptionsDelta) >= 0,
    },
  ];
}
