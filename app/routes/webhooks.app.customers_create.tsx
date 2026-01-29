import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic } = await authenticate.webhook(request);
    const customer = payload as any; // Using any for payload type flexibility

    console.log(`Received ${topic} webhook for ${shop}`);

    if (!customer.id) {
        return new Response("No customer ID found", { status: 400 });
    }

    // Find shop based on shop domain
    const shopRecord = await prisma.session.findFirst({
        where: { shop },
    });

    // Note: We might need a better way to map shop domain to shopId if session table isn't the primary source of truth for "Shop" entity
    // But usually in single-shop apps or standard setups, the shop domain is sufficient context.
    // However, our `Customer` model uses `shopId` which seems to be the myshopify domain in `getCustomers.ts`: "const shopId = session.shop;"
    // So we can use `shop` directly.

    try {
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

        console.log(`Processed customer create/update for ID ${customer.id}`);
    } catch (error) {
        console.error(`Error processing customer webhook: ${error}`);
        return new Response();
    }

    return new Response();
};
