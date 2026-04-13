import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { importCustomersFromCsv } from "../utils/importCustomersFromCsv";
import { createLogger } from "../utils/logger.server";

const log = createLogger("api:import-customers-csv");

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Failed to parse form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.endsWith(".csv")) {
    return Response.json({ error: "Only CSV files are supported" }, { status: 400 });
  }

  const csvText = await file.text();

  log.info(`Starting CSV import for shop ${shopId}, file=${file.name}, size=${file.size}b`);

  try {
    const result = await importCustomersFromCsv(shopId, csvText);

    log.success(
      `CSV import done: imported=${result.imported}, notFound=${result.notFound}, errors=${result.errors.length}`
    );

    return Response.json({ success: true, ...result });
  } catch (err) {
    log.error("CSV import failed:", err);
    return Response.json({ success: false, error: "Import failed" }, { status: 500 });
  }
};
