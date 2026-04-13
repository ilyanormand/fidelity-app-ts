import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export function getRedis(): Redis {
  if (!global.__redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    global.__redis = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 200, 5000);
      },
    });

    global.__redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });
  }

  return global.__redis;
}
