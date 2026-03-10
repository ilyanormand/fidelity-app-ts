import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueSyncBalance } from "../queues/shopify-sync.queue";
import { invalidateBalance } from "../utils/cache.server";

/**
 * orders/cancelled webhook
 *
 * Fires when an order is cancelled.
 * Reverses the loyalty points that were awarded when the order was paid.
 *
 * Idempotency: checks for an existing "purchase_refund" ledger entry with
 * the same shopifyOrderId so re-delivery never deducts twice.
 */

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic, admin } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const order = payload as {
        id: number;
        admin_graphql_api_id: string;
        customer: { id: number } | null;
        cancelled_at: string | null;
    };

    if (!order.customer?.id) {
        console.log(`[orders/cancelled] No customer on order ${order.id} — skipping.`);
        return new Response();
    }

    const shopifyOrderId = order.id;
    const shopifyCustomerId = `gid://shopify/Customer/${order.customer.id}`;

    try {
        // Find the original points-earned ledger entry for this order
        const originalEntry = await prisma.ledger.findFirst({
            where: {
                shopifyOrderId: BigInt(shopifyOrderId),
                reason: "purchase",
            },
        });

        if (!originalEntry) {
            console.log(`[orders/cancelled] No purchase entry found for order ${shopifyOrderId} — nothing to reverse.`);
            return new Response();
        }

        // Idempotency: already reversed?
        const alreadyReversed = await prisma.ledger.findFirst({
            where: {
                shopifyOrderId: BigInt(shopifyOrderId),
                reason: "purchase_refund",
            },
        });

        if (alreadyReversed) {
            console.log(`[orders/cancelled] Points already reversed for order ${shopifyOrderId} — skipping.`);
            return new Response();
        }

        const pointsToDeduct = originalEntry.amount; // positive number (e.g. 30)

        const customer = await prisma.customer.findUnique({
            where: { shopifyCustomerId_shopId: { shopifyCustomerId, shopId: shop } },
        });

        if (!customer) {
            console.warn(`[orders/cancelled] Customer ${order.customer.id} not found — skipping reversal.`);
            return new Response();
        }

        // Reverse points in a transaction
        const updatedCustomer = await prisma.$transaction(async (tx) => {
            const updated = await tx.customer.update({
                where: { id: customer.id },
                data: {
                    currentBalance: {
                        // Don't go below 0
                        decrement: Math.min(pointsToDeduct, customer.currentBalance ?? 0),
                    },
                },
            });

            await tx.ledger.create({
                data: {
                    customerId: customer.id,
                    amount: -pointsToDeduct,
                    reason: "purchase_refund",
                    shopifyOrderId: BigInt(shopifyOrderId),
                    metadata: {
                        orderGid: order.admin_graphql_api_id,
                        originalLedgerEntryId: originalEntry.id,
                        note: "Points reversed due to order cancellation",
                    },
                },
            });

            return updated;
        });

        console.log(
            `✅ [orders/cancelled] Reversed ${pointsToDeduct} pts from customer ${order.customer.id} for cancelled order ${shopifyOrderId}. New balance: ${updatedCustomer.currentBalance}`
        );

        await enqueueSyncBalance(shopifyCustomerId, updatedCustomer.currentBalance ?? 0, shop!);
        await invalidateBalance(shopifyCustomerId, shop!);
    } catch (error) {
        console.error(`[orders/cancelled] Error processing order ${shopifyOrderId}:`, error);
        return new Response();
    }

    return new Response();
};
