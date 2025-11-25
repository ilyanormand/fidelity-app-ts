import { format, subDays, subHours } from "date-fns";
import { getPeriod } from "./getPeriod";
import prisma from "../db.server";

export async function getPointsStats(shopId: string, range: string = "30d") {
  //logic to get points stats
  const { start, end, interval } = getPeriod(range);
  //POSTGREQ USE DATE_TRUNC TO GROUP BY DATE OR HOUR
  const trunc = interval === "hour" ? "hour" : "day";
  const testShopId = "test-shop.myshopify.com";
  const startDateStr = start.toISOString();
  const endDateStr = end.toISOString();
  console.log("Test work");
  const rows = await prisma.$queryRawUnsafe<
    Array<{ bucket: Date; value: bigint }>
  >(
    `
      SELECT
        DATE_TRUNC('${trunc}', "created_at") AS bucket,
        SUM(points) AS value
      FROM "Ledger"
      WHERE "created_at" >= '${startDateStr}'::timestamp
        AND "created_at" <= '${endDateStr}'::timestamp
        AND "shopId" = '${testShopId}'
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
  );

  const mapValues = new Map<string, number>();
  for (const row of rows) {
    const bucketDate = new Date(row.bucket);
    const iso = bucketDate.toISOString();
    mapValues.set(iso, Number(row.value));
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
    const value = mapValues.get(iso) ?? 0;
    const label =
      interval === "hour" ? format(cursor, "HH:mm") : format(cursor, "MMM d");
    data.push({ name: label, value });
    if (interval === "hour") {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const percentage = await getPointsTrend(shopId, start, end);

  return {
    range,
    data,
    percentage,
  };
}

//Get points trend for a given period
async function getPointsTrend(
  shopId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<string> {
  const testShopId = "test-shop.myshopify.com";
  const startStr = periodStart.toISOString();
  const endStr = periodEnd.toISOString();
  const startRows = await prisma.$queryRawUnsafe<Array<{ sum: bigint | null }>>(
    `
      SELECT SUM(points) AS sum
      FROM "Ledger"
      WHERE "shopId" = '${testShopId}'
        AND "created_at" < '${startStr}'::timestamp
    `,
  );

  const pointsStart = startRows[0]?.sum ? Number(startRows[0].sum) : 0;
  const endRows = await prisma.$queryRawUnsafe<Array<{ sum: bigint | null }>>(
    `
      SELECT SUM(points) AS sum
      FROM "Ledger"
      WHERE "shopId" = '${testShopId}'
        AND "created_at" <= '${endStr}'::timestamp
    `,
  );

  const pointsEnd = endRows[0]?.sum ? Number(endRows[0].sum) : 0;
  const difference = pointsEnd - pointsStart;

  console.log(`HERE START LOGS: Percentage change calculation:`);
  console.log(`  Period: ${startStr} - ${endStr}`);
  console.log(`  Balance at period start (before ${startStr}): ${pointsStart}`);
  console.log(`  Balance at period end (before ${endStr}): ${pointsEnd}`);
  console.log(
    `  Change for period: ${difference} (${
      pointsEnd > pointsStart
        ? "increase"
        : pointsEnd < pointsStart
          ? "decrease"
          : "no change"
    })`,
  );

  let percentage = "+0%";

  if (pointsStart > 0) {
    const change = (difference / pointsStart) * 100;
    const sign = change >= 0 ? "+" : "";
    percentage = `${sign}${change.toFixed(1)}%`;
    console.log(
      `  Formula: (${difference} / ${pointsStart}) * 100 = ${change.toFixed(1)}%`,
    );
  } else if (pointsEnd > 0) {
    const sign = difference >= 0 ? "+" : "";
    percentage = `${sign}${difference.toFixed(1)}%`;
    console.log(
      `  Initial balance = 0, change = ${difference} → ${percentage}`,
    );
  } else {
    console.log(`  Initial and final balance = 0 → +0%`);
  }

  console.log(`  Result: ${percentage}`);

  return percentage;
}
