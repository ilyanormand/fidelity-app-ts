import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic } = await authenticate.webhook(request);
    const customer = payload as any;

    console.log(`Received ${topic} webhook for ${shop}`);

    if (!customer.id) {
        return new Response("No customer ID found", { status: 400 });
    }

    try {
        // Only update if exists, or create if missing (parity with create webhook)
        await prisma.customer.upsert({
            where: {
                shopifyCustomerId_shopId: {
                    shopifyCustomerId: `gid://shopify/Customer/${customer.id}`,
                    shopId: shop,
                },
            },
            create: {
                shopifyCustomerId: `gid://shopify/Customer/${customer.id}`,
                shopId: shop,
                currentBalance: 0,
                customerTags: customer.tags ? customer.tags.split(",").map((t: string) => t.trim()) : [],
                firstName: customer.first_name,
                lastName: customer.last_name,
                email: customer.email,
                displayName: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.email,
            },
            update: {
                customerTags: customer.tags ? customer.tags.split(",").map((t: string) => t.trim()) : [],
                firstName: customer.first_name,
                lastName: customer.last_name,
                email: customer.email,
                displayName: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.email,
            },
        });

        console.log(`Processed customer update for ID ${customer.id}`);
    } catch (error) {
        console.error(`Error processing customer webhook: ${error}`);
        return new Response();
    }

    return new Response();
};
