import "dotenv/config";
import "@shopify/shopify-app-react-router/adapters/node";
import { startSyncWorker } from "./workers/shopify-sync.worker";

console.log("[Worker] Starting BullMQ worker process...");

const worker = startSyncWorker();

const shutdown = async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
