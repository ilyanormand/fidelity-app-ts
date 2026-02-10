import { subHours, subDays } from "date-fns";

export function getPeriod(range: string) {
  const now = new Date();

  switch (range) {
    case "1d":
      return {
        start: subHours(now, 24),
        end: now,
        interval: "hour",
        expectedPoints: 24,
      };

    case "7d":
      return {
        start: subDays(now, 7),
        end: now,
        interval: "day",
        expectedPoints: 7,
      };

    case "14d":
      return {
        start: subDays(now, 14),
        end: now,
        interval: "day",
        expectedPoints: 14,
      };

    case "30d":
      return {
        start: subDays(now, 30),
        end: now,
        interval: "day",
        expectedPoints: 30,
      };

    default:
      throw new Error("Unknown range");
  }
}
