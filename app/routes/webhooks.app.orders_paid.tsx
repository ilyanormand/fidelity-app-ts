import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncBalanceToShopify } from "../utils/metafields.server";

/**
 * orders/paid webhook
 *
 * Fires when an order's financial_status becomes "paid".
 * Awards loyalty points at rate: 1 point per 1 EUR (rounded down).
 * Uses subtotal_price (excludes shipping and taxes) as the base.
 *
 * Idempotency: uses the Shopify order ID as externalId on the ledger entry
 * so re-delivery of the same webhook never double-awards points.
 */

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, payload, topic, admin } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const order = payload as {
        id: number;
        admin_graphql_api_id: string;
        customer: { id: number } | null;
        subtotal_price: string;       // e.g. "29.99"  — excludes shipping & taxes
        current_subtotal_price: string;
        currency: string;
        financial_status: string;     // "paid" | "refunded" | etc.
        cancelled_at: string | null;
        refunds: unknown[];
    };

    // Guard: must be a paid, non-cancelled order with a customer
    if (!order.customer?.id) {
        console.log(`[orders/paid] No customer on order ${order.id} — skipping.`);
        return new Response();
    }

    if (order.cancelled_at) {
        console.log(`[orders/paid] Order ${order.id} is already cancelled — skipping.`);
        return new Response();
    }

    const shopifyOrderId = order.id;
    const shopifyCustomerId = `gid://shopify/Customer/${order.customer.id}`;

    // 1 EUR = 1 point, rounded down
    const subtotal = parseFloat(order.subtotal_price || "0");
    const pointsToAward = Math.floor(subtotal);

    if (pointsToAward <= 0) {
        console.log(`[orders/paid] Order ${shopifyOrderId} subtotal is ${subtotal} — no points.`);
        return new Response();
    }

    try {
        // Idempotency check: if we already have a ledger entry for this order, skip
        const existing = await prisma.ledger.findFirst({
            where: {
                shopifyOrderId: BigInt(shopifyOrderId),
                reason: "purchase",
            },
        });

        if (existing) {
            console.log(`[orders/paid] Points already awarded for order ${shopifyOrderId} — skipping.`);
            return new Response();
        }

        // Find or auto-create customer record
        let customer = await prisma.customer.findUnique({
            where: { shopifyCustomerId_shopId: { shopifyCustomerId, shopId: shop } },
        });

        if (!customer) {
            console.warn(`[orders/paid] Customer ${order.customer.id} not in DB — auto-creating.`);
            customer = await prisma.customer.create({
                data: {
                    shopifyCustomerId,
                    shopId: shop,
                    currentBalance: 0,
                    customerTags: [],
                },
            });
        }

        // Award points in a transaction
        const updatedCustomer = await prisma.$transaction(async (tx) => {
            const updated = await tx.customer.update({
                where: { id: customer!.id },
                data: { currentBalance: { increment: pointsToAward } },
            });

            await tx.ledger.create({
                data: {
                    customerId: customer!.id,
                    amount: pointsToAward,
                    reason: "purchase",
                    shopifyOrderId: BigInt(shopifyOrderId),
                    metadata: {
                        orderGid: order.admin_graphql_api_id,
                        subtotal: order.subtotal_price,
                        currency: order.currency,
                        pointsRate: "1 point per 1 EUR",
                    },
                },
            });

            return updated;
        });

        console.log(
            `✅ [orders/paid] Awarded ${pointsToAward} pts to customer ${order.customer.id} for order ${shopifyOrderId}. New balance: ${updatedCustomer.currentBalance}`
        );

        // Sync new balance to Shopify metafield (fire-and-forget)
        if (admin) {
            syncBalanceToShopify(admin, shopifyCustomerId, updatedCustomer.currentBalance ?? 0)
                .then((res) => {
                    if (!res.success) console.warn("[orders/paid] Metafield sync failed:", res.error);
                })
                .catch((err) => console.error("[orders/paid] Metafield sync error:", err));
        }
    } catch (error) {
        console.error(`[orders/paid] Error processing order ${shopifyOrderId}:`, error);
        return new Response();
    }

    return new Response();
};
