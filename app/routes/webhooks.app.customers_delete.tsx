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
        await prisma.customer.deleteMany({
            where: {
                shopifyCustomerId: `gid://shopify/Customer/${customer.id}`,
                shopId: shop,
            },
        });

        console.log(`Processed customer delete for ID ${customer.id}`);
    } catch (error) {
        console.error(`Error processing customer webhook: ${error}`);
        return new Response();
    }

    return new Response();
};
