import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { importAllCustomers } from "../utils/importCustomers";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);

    if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const body = request.headers.get("content-type")?.includes("json")
            ? await request.json().catch(() => ({}))
            : {};
        const syncMetafields = body.syncMetafields !== false; // default true

        const result = await importAllCustomers(admin, session.shop, syncMetafields);

        return Response.json({
            success: true,
            message: `Imported ${result.importedCount} customers, synced ${result.metafieldsSynced} metafields.`,
            importedCount: result.importedCount,
            metafieldsSynced: result.metafieldsSynced,
        });
    } catch (error) {
        console.error("Import customers error:", error);
        return Response.json({
            success: false,
            error: "Failed to import customers"
        }, { status: 500 });
    }
};
