import { format, subDays, subHours, startOfDay, startOfHour } from "date-fns";
import { getPeriod } from "./getPeriod";

export async function getPointsStats(shopId: string, range: string = "30d") {
  const { start, end, interval } = getPeriod(range);

  // Generate ~100 mock transactions distributed within the period
  const mockTransactions = Array.from({ length: 100 }, () => {
    const timeSpan = end.getTime() - start.getTime();
    const randomTime = start.getTime() + Math.random() * timeSpan;
    return {
      createdAt: new Date(randomTime),
      points: Math.floor(Math.random() * 100) + 10, // 10 to 110 points
    };
  });

  // Aggregate transactions by bucket
  const mapValues = new Map<string, number>();

  for (const t of mockTransactions) {
    let bucketDate: Date;
    // We want to group by the same interval logic as the display loop
    // The display loop iterates using UTC dates. 
    // Let's normalize transaction time to the bucket start.

    const bucket = new Date(t.createdAt);
    if (interval === "hour") {
      bucket.setUTCMinutes(0, 0, 0);
    } else {
      bucket.setUTCHours(0, 0, 0, 0);
    }

    const iso = bucket.toISOString();
    const current = mapValues.get(iso) ?? 0;
    mapValues.set(iso, current + t.points);
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

  // Generate random percentage
  const randomChange = (Math.random() * 200 - 100).toFixed(1); // -100 to +100
  const sign = Number(randomChange) >= 0 ? "+" : "";
  const percentage = `${sign}${randomChange}%`;

  return {
    range,
    data,
    percentage,
  };
}
