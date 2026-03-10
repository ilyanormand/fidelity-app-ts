import { Queue } from "bullmq";
import { getRedis } from "../utils/redis.server";

let syncQueue: Queue | null = null;

export function getSyncQueue(): Queue {
  if (!syncQueue) {
    syncQueue = new Queue("shopify-sync", {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      },
    });
  }
  return syncQueue;
}

export interface SyncMetafieldPayload {
  shopifyCustomerId: string;
  balance: number;
  shop: string;
}

export async function enqueueSyncBalance(
  shopifyCustomerId: string,
  balance: number,
  shop: string
): Promise<void> {
  try {
    await getSyncQueue().add("syncMetafield", {
      shopifyCustomerId,
      balance,
      shop,
    } satisfies SyncMetafieldPayload);
  } catch (err) {
    console.error("[Queue] Failed to enqueue sync job:", err);
  }
}
