import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { importAllCustomers } from "../utils/importCustomers";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);

    if (request.method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const count = await importAllCustomers(admin, session.shop);

        return Response.json({
            success: true,
            message: `Successfully started import. Processed ${count} customers.`
        });
    } catch (error) {
        console.error("Import customers error:", error);
        return Response.json({
            success: false,
            error: "Failed to import customers"
        }, { status: 500 });
    }
};
