import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueSyncBalance } from "../queues/shopify-sync.queue";
import { invalidateBalance } from "../utils/cache.server";

const SIGNUP_BONUS_POINTS = 15;

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic, admin } = await authenticate.webhook(request);
    const customer = payload as any;

    console.log(`Received ${topic} webhook for ${shop}`);

    if (!customer.id) {
        return new Response("No customer ID found", { status: 400 });
    }

    const shopifyCustomerId = `gid://shopify/Customer/${customer.id}`;
    const displayName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.email;
    const tags = customer.tags ? customer.tags.split(",").map((t: string) => t.trim()) : [];

    try {
        // Check if customer already exists in our DB (e.g. imported before)
        const existing = await prisma.customer.findUnique({
            where: {
                shopifyCustomerId_shopId: { shopifyCustomerId, shopId: shop },
            },
        });

        if (existing) {
            // Customer already tracked — just sync profile data, no bonus
            await prisma.customer.update({
                where: { id: existing.id },
                data: { firstName: customer.first_name, lastName: customer.last_name, email: customer.email, displayName, customerTags: tags },
            });
            console.log(`Customer ${customer.id} already exists, updated profile only.`);
            return new Response();
        }

        // New customer — create record + signup bonus in a single transaction
        const newCustomer = await prisma.$transaction(async (tx) => {
            const created = await tx.customer.create({
                data: {
                    shopifyCustomerId,
                    shopId: shop,
                    currentBalance: SIGNUP_BONUS_POINTS,
                    firstName: customer.first_name,
                    lastName: customer.last_name,
                    email: customer.email,
                    displayName,
                    customerTags: tags,
                },
            });

            await tx.ledger.create({
                data: {
                    customerId: created.id,
                    amount: SIGNUP_BONUS_POINTS,
                    reason: "signup_bonus",
                    metadata: {
                        note: "Welcome bonus for new account",
                        shopifyCustomerId,
                    },
                },
            });

            return created;
        });

        console.log(`✅ New customer ${customer.id} created with ${SIGNUP_BONUS_POINTS} signup bonus points.`);

        await enqueueSyncBalance(shopifyCustomerId, SIGNUP_BONUS_POINTS, shop!);
        await invalidateBalance(shopifyCustomerId, shop!);
    } catch (error) {
        console.error(`Error processing customer create webhook: ${error}`);
        return new Response();
    }

    return new Response();
};
