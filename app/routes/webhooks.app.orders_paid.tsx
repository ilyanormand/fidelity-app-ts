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
        note_attributes: Array<{ name: string; value: string }>;
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

    // Process free product redemptions from cart attributes (_loyalty_free_items)
    // Points are now deducted at checkout confirm time (confirm-product-redemption),
    // so this webhook only needs to stamp the order ID onto existing records.
    // If for some reason the confirm didn't happen, fall back to deducting here.
    try {
        const noteAttrs: Record<string, string> = {};
        (order.note_attributes || []).forEach((a) => {
            noteAttrs[a.name] = a.value;
        });

        const freeItemsRaw = noteAttrs["_loyalty_free_items"];
        const pointsSpentRaw = noteAttrs["_loyalty_points_spent"];

        if (freeItemsRaw && pointsSpentRaw) {
            const totalPointsSpent = parseInt(pointsSpentRaw, 10) || 0;
            if (totalPointsSpent <= 0) {
                console.log(`[orders/paid] _loyalty_points_spent is 0 — skipping free product processing.`);
            } else {
                const customer = await prisma.customer.findUnique({
                    where: { shopifyCustomerId_shopId: { shopifyCustomerId, shopId: shop } },
                });

                if (customer) {
                    // Check if points were already deducted at confirm time
                    // (confirm-product-redemption creates entries with reason "free_product_redemption"
                    //  and source "checkout_confirm" in metadata)
                    const recentDeductions = await prisma.ledger.findMany({
                        where: {
                            customerId: customer.id,
                            reason: "free_product_redemption",
                            amount: { lt: 0 },
                            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
                        },
                        orderBy: { createdAt: "desc" },
                        take: 10,
                    });

                    const alreadyDeducted = recentDeductions.some((entry) => {
                        const meta = entry.metadata as any;
                        return meta?.source === "checkout_confirm";
                    });

                    const orderIdempotencyKey = `order_${shopifyOrderId}_free_items`;
                    const webhookAlreadyProcessed = await prisma.ledger.findFirst({
                        where: { externalId: orderIdempotencyKey, reason: "free_product_redemption" },
                    });

                    if (alreadyDeducted) {
                        // Points were already deducted at confirm time — just stamp the order ID
                        // on the most recent confirm entry so we can trace it
                        const latestConfirm = recentDeductions.find((e) => (e.metadata as any)?.source === "checkout_confirm");
                        if (latestConfirm && !latestConfirm.shopifyOrderId) {
                            await prisma.ledger.update({
                                where: { id: latestConfirm.id },
                                data: { shopifyOrderId: BigInt(shopifyOrderId), externalId: orderIdempotencyKey },
                            });
                        }
                        console.log(`✅ [orders/paid] Free product points already deducted at confirm time for order ${shopifyOrderId} — linked.`);
                    } else if (!webhookAlreadyProcessed) {
                        // Fallback: points were NOT deducted at confirm time — deduct now
                        let freeItemsMap: Record<string, { quantity: number; spent: number }> = {};
                        try {
                            const parsed = JSON.parse(freeItemsRaw);
                            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                                freeItemsMap = parsed;
                            }
                        } catch {
                            console.warn(`[orders/paid] Could not parse _loyalty_free_items for order ${shopifyOrderId}`);
                        }

                        if (Object.keys(freeItemsMap).length > 0) {
                            const safeDeduction = Math.min(totalPointsSpent, customer.currentBalance ?? 0);

                            await prisma.$transaction(async (tx) => {
                                await tx.ledger.create({
                                    data: {
                                        customerId: customer.id,
                                        amount: -safeDeduction,
                                        reason: "free_product_redemption",
                                        externalId: orderIdempotencyKey,
                                        shopifyOrderId: BigInt(shopifyOrderId),
                                        metadata: {
                                            orderId: shopifyOrderId,
                                            freeItems: freeItemsMap,
                                            pointsSpentAttr: totalPointsSpent,
                                            source: "webhook_fallback",
                                        },
                                    },
                                });

                                for (const [variantId, itemData] of Object.entries(freeItemsMap)) {
                                    if (typeof itemData?.quantity === "number" && itemData.quantity > 0) {
                                        await tx.redemption.create({
                                            data: {
                                                customerId: customer.id,
                                                rewardName: `free_product:${variantId}:qty${itemData.quantity}`,
                                                pointsSpent: typeof itemData.spent === "number" ? itemData.spent : 0,
                                                shopifyDiscountCode: null,
                                            },
                                        });
                                    }
                                }

                                await tx.customer.update({
                                    where: { id: customer.id },
                                    data: { currentBalance: { decrement: safeDeduction } },
                                });
                            });

                            const updatedCustomer = await prisma.customer.findUnique({
                                where: { id: customer.id },
                                select: { currentBalance: true },
                            });

                            console.log(
                                `✅ [orders/paid] Fallback: deducted ${safeDeduction} pts for free products on order ${shopifyOrderId}. New balance: ${updatedCustomer?.currentBalance}`
                            );

                            await enqueueSyncBalance(shopifyCustomerId, updatedCustomer?.currentBalance ?? 0, shop!);
                            await invalidateBalance(shopifyCustomerId, shop!);
                        }
                    } else {
                        console.log(`[orders/paid] Free product redemption already processed for order ${shopifyOrderId} — skipping.`);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`[orders/paid] Error processing free product redemptions for order ${shopifyOrderId}:`, error);
    }

    return new Response();
};
