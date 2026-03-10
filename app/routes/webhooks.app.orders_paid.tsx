import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueSyncBalance } from "../queues/shopify-sync.queue";
import { invalidateBalance } from "../utils/cache.server";

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
        subtotal_price: string;
        current_subtotal_price: string;
        currency: string;
        financial_status: string;
        cancelled_at: string | null;
        refunds: unknown[];
        discount_codes: Array<{ code: string; amount: string; type: string }>;
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

        await enqueueSyncBalance(shopifyCustomerId, updatedCustomer.currentBalance ?? 0, shop!);
        await invalidateBalance(shopifyCustomerId, shop!);
    } catch (error) {
        console.error(`[orders/paid] Error processing order ${shopifyOrderId}:`, error);
        return new Response();
    }

    // Track which loyalty discount codes were used in this order
    if (order.discount_codes?.length > 0) {
        try {
            const customer = await prisma.customer.findUnique({
                where: { shopifyCustomerId_shopId: { shopifyCustomerId, shopId: shop } },
            });

            if (customer) {
                for (const dc of order.discount_codes) {
                    const idempotencyKey = `order_${shopifyOrderId}_code_${dc.code}`;

                    const alreadyTracked = await prisma.ledger.findFirst({
                        where: { customerId: customer.id, reason: "discount_code_used", externalId: idempotencyKey },
                    });

                    if (!alreadyTracked) {
                        const redemption = await prisma.redemption.findFirst({
                            where: { customerId: customer.id, shopifyDiscountCode: dc.code },
                        });

                        if (redemption) {
                            await prisma.ledger.create({
                                data: {
                                    customerId: customer.id,
                                    amount: 0,
                                    reason: "discount_code_used",
                                    externalId: idempotencyKey,
                                    metadata: {
                                        discountCode: dc.code,
                                        orderId: shopifyOrderId,
                                        redemptionId: redemption.id,
                                    },
                                },
                            });
                            console.log(`✅ [orders/paid] Marked discount code ${dc.code} as used for customer ${customer.id}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`[orders/paid] Error tracking discount code usage:`, error);
        }
    }

    return new Response();
};
