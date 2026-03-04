import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncBalanceToShopify } from "../utils/metafields.server";

const EMAIL_SUBSCRIPTION_BONUS = 100;

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic, admin } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Payload: { customer_id, email_address, email_marketing_consent: { state, opt_in_level, consent_updated_at } }
    const data = payload as {
        customer_id: number;
        email_address: string;
        email_marketing_consent: {
            state: string; // "subscribed" | "not_subscribed" | "pending" | "unsubscribed"
            opt_in_level: string | null;
            consent_updated_at: string | null;
        };
    };

    if (!data.customer_id) {
        return new Response("No customer ID in payload", { status: 400 });
    }

    const newState = data.email_marketing_consent?.state;
    const shopifyCustomerId = `gid://shopify/Customer/${data.customer_id}`;

    // Only proceed when customer actively subscribes
    if (newState !== "subscribed") {
        console.log(`Customer ${data.customer_id} consent state is "${newState}" — no bonus.`);
        return new Response();
    }

    try {
        const customer = await prisma.customer.findUnique({
            where: { shopifyCustomerId_shopId: { shopifyCustomerId, shopId: shop } },
            include: {
                ledgerEntries: {
                    where: { reason: "email_subscription_bonus" },
                    take: 1,
                },
            },
        });

        if (!customer) {
            console.warn(`Customer ${data.customer_id} not found in DB — skipping bonus.`);
            return new Response();
        }

        // Previous state was already "subscribed" — don't double-award
        if (customer.emailMarketingConsent === "subscribed") {
            console.log(`Customer ${data.customer_id} was already subscribed — skipping bonus.`);
            // Still update the stored state
            await prisma.customer.update({
                where: { id: customer.id },
                data: { emailMarketingConsent: newState },
            });
            return new Response();
        }

        // Check if they already received this bonus at any point
        if (customer.ledgerEntries.length > 0) {
            console.log(`Customer ${data.customer_id} already received email subscription bonus — skipping.`);
            await prisma.customer.update({
                where: { id: customer.id },
                data: { emailMarketingConsent: newState },
            });
            return new Response();
        }

        // Award 100 points in a transaction
        const updatedCustomer = await prisma.$transaction(async (tx) => {
            const updated = await tx.customer.update({
                where: { id: customer.id },
                data: {
                    emailMarketingConsent: newState,
                    currentBalance: { increment: EMAIL_SUBSCRIPTION_BONUS },
                },
            });

            await tx.ledger.create({
                data: {
                    customerId: customer.id,
                    amount: EMAIL_SUBSCRIPTION_BONUS,
                    reason: "email_subscription_bonus",
                    metadata: {
                        note: "Bonus for subscribing to email marketing",
                        previousState: customer.emailMarketingConsent ?? "unknown",
                        shopifyCustomerId,
                    },
                },
            });

            return updated;
        });

        console.log(
            `✅ Awarded ${EMAIL_SUBSCRIPTION_BONUS} pts to customer ${data.customer_id} for email subscription. New balance: ${updatedCustomer.currentBalance}`
        );

        // Sync new balance to Shopify metafield (fire-and-forget)
        if (admin) {
            syncBalanceToShopify(admin, shopifyCustomerId, updatedCustomer.currentBalance ?? 0)
                .then((res) => {
                    if (!res.success) console.warn("Metafield sync failed after email bonus:", res.error);
                })
                .catch((err) => console.error("Metafield sync error after email bonus:", err));
        }
    } catch (error) {
        console.error(`Error processing email marketing consent webhook: ${error}`);
        return new Response();
    }

    return new Response();
};
