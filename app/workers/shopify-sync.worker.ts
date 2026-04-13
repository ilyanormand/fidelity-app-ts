import { Worker, Job } from "bullmq";
import { getRedis } from "../utils/redis.server";
import { createLogger } from "../utils/logger.server";
import type { SyncMetafieldPayload } from "../queues/shopify-sync.queue";

const log = createLogger("worker:shopify-sync");

// Lazily resolved so env vars are populated before shopify.server.ts is evaluated
let _shopify: Awaited<typeof import("../shopify.server")>["default"] | null = null;
let _syncBalance: typeof import("../utils/metafields.server")["syncBalanceToShopify"] | null = null;

async function getShopifyDeps() {
  if (!_shopify || !_syncBalance) {
    log.info("Lazy-loading shopify.server and metafields.server...");
    const [shopifyMod, metaMod] = await Promise.all([
      import("../shopify.server.js"),
      import("../utils/metafields.server.js"),
    ]);
    _shopify = shopifyMod.default;
    _syncBalance = metaMod.syncBalanceToShopify;
    log.success("Shopify deps loaded successfully");
  }
  return { shopify: _shopify!, syncBalanceToShopify: _syncBalance! };
}

async function handleSyncMetafield(job: Job<SyncMetafieldPayload>) {
  const { shopifyCustomerId, balance, shop } = job.data;
  const start = Date.now();

  log.info(`Job #${job.id} — syncMetafield | shop=${shop} customer=${shopifyCustomerId} balance=${balance}`);

  const { shopify, syncBalanceToShopify } = await getShopifyDeps();
  const { admin } = await shopify.unauthenticated.admin(shop);
  const result = await syncBalanceToShopify(admin, shopifyCustomerId, balance);

  if (!result.success) {
    log.error(`Job #${job.id} — metafield sync failed: ${JSON.stringify(result.error)}`);
    throw new Error(`Metafield sync failed: ${JSON.stringify(result.error)}`);
  }

  const ms = Date.now() - start;
  log.success(`Job #${job.id} — synced balance=${balance} for ${shopifyCustomerId} (${ms}ms)`);
  return { synced: true, shopifyCustomerId, balance };
}

export function startSyncWorker() {
  const worker = new Worker<SyncMetafieldPayload>(
    "shopify-sync",
    async (job) => {
      switch (job.name) {
        case "syncMetafield":
          return handleSyncMetafield(job);
        default:
          log.warn(`Unknown job name: ${job.name} (id=${job.id})`);
      }
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on("completed", (job) => {
    log.success(`Job #${job.id} completed in ${job.processedOn! - job.timestamp}ms`);
  });

  worker.on("failed", (job, err) => {
    log.error(`Job #${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}): ${err.message}`);
  });

  worker.on("stalled", (jobId) => {
    log.warn(`Job #${jobId} stalled — will be retried`);
  });

  worker.on("error", (err) => {
    log.error("Worker error:", err.message);
  });

  log.success("Shopify sync worker started (concurrency: 5, rate: 10 jobs/s)");
  return worker;
}
