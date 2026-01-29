import { format } from "date-fns";
import { getPeriod } from "./getPeriod";
import prisma from "../../db.server";

export async function getPointsStats(shopId: string, range: string = "30d") {
  const { start, end, interval } = getPeriod(range);

  // Fetch ledger entries within the date range
  const ledgerEntries = await prisma.ledger.findMany({
    where: {
      createdAt: {
        gte: start,
        lte: end,
      },
      customer: { shopId },
    },
    select: {
      createdAt: true,
      amount: true,
    },
  });

  // Aggregate transactions by bucket
  const creditMap = new Map<string, number>();
  const debitMap = new Map<string, number>();

  for (const entry of ledgerEntries) {
    if (!entry.createdAt) continue;

    const bucket = new Date(entry.createdAt);
    if (interval === "hour") {
      bucket.setUTCMinutes(0, 0, 0);
    } else {
      bucket.setUTCHours(0, 0, 0, 0);
    }

    const iso = bucket.toISOString();

    if (entry.amount >= 0) {
      const current = creditMap.get(iso) ?? 0;
      creditMap.set(iso, current + entry.amount);
    } else {
      const current = debitMap.get(iso) ?? 0;
      debitMap.set(iso, current + Math.abs(entry.amount));
    }
  }

  const data = [];
  const startNormalized = new Date(start);
  const endNormalized = new Date(end);

  if (interval === "hour") {
    startNormalized.setUTCMinutes(0, 0, 0);
    endNormalized.setUTCMinutes(0, 0, 0);
  } else {
    startNormalized.setUTCHours(0, 0, 0, 0);
    endNormalized.setUTCHours(0, 0, 0, 0);
  }

  let cursor = new Date(startNormalized);

  while (cursor <= endNormalized) {
    const iso = cursor.toISOString();
    const credited = creditMap.get(iso) ?? 0;
    const debited = debitMap.get(iso) ?? 0;
    const label =
      interval === "hour" ? format(cursor, "HH:mm") : format(cursor, "MMM d");

    data.push({
      name: label,
      value: credited, // For backwards compatibility
      credited,
      debited,
    });

    if (interval === "hour") {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Calculate total for current period
  const currentTotal = ledgerEntries
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);

  // Get previous period for comparison
  const periodLength = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - periodLength);
  const previousEnd = new Date(start.getTime() - 1);

  const previousEntries = await prisma.ledger.findMany({
    where: {
      createdAt: {
        gte: previousStart,
        lte: previousEnd,
      },
      customer: { shopId },
      amount: { gt: 0 },
    },
    select: {
      amount: true,
    },
  });

  const previousTotal = previousEntries.reduce((sum, e) => sum + e.amount, 0);

  // Calculate percentage change
  let percentage: string;
  if (previousTotal === 0) {
    percentage = currentTotal > 0 ? "+100%" : "0%";
  } else {
    const change = ((currentTotal - previousTotal) / previousTotal) * 100;
    const sign = change >= 0 ? "+" : "";
    percentage = `${sign}${change.toFixed(1)}%`;
  }

  return {
    range,
    data,
    percentage,
  };
}
