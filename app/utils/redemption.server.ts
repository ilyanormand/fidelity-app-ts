import shopify, { sessionStorage } from "../shopify.server";
import prisma from "../db.server";
import { createLoyaltyDiscount } from "./createShopifyDiscount.server";
import { syncBalanceToShopify } from "./metafields.server";

export interface RedemptionResult {
    success: boolean;
    error?: string;
    status?: number;
    discountCode?: string;
    newBalance?: number;
    redemption?: any;
    required?: number;
    current?: number;
    shopifyDiscountCreated?: boolean;
}

/**
 * Shared logic for processing a reward redemption
 * 
 * Can be called from:
 * 1. Proxy (customer context) - needs internal session lookup
 * 2. API (admin context) - might already have admin session
 */
export async function processRedemption(
    shopifyCustomerId: string,
    rewardId: string,
    shop: string,
    cartTotal: number = 0,
    existingAdminClient?: any
): Promise<RedemptionResult> {
    try {
        // 1. Validate inputs
        if (!shopifyCustomerId || !rewardId || !shop) {
            return {
                success: false,
                error: "shopifyCustomerId, rewardId, and shop are required",
                status: 400
            };
        }

        // 2. Get Admin Client (if not provided)
        let admin = existingAdminClient;

        if (!admin) {
            try {
                // Use unauthenticated.admin to get the offline admin context correctly
                const context = await shopify.unauthenticated.admin(shop);
                admin = context.admin;
            } catch (error) {
                console.warn("Could not get admin context for shop:", shop, error);
                // We will proceed without it, meaning we can't create the Shopify discount
            }
        }

        // 3. Find Customer
        console.log(`🔍 Looking up customer: shop=${shop}, shopifyCustomerId=${shopifyCustomerId}`);
        let customer = await prisma.customer.findFirst({
            where: {
                shopifyCustomerId,
                shopId: shop,
            },
        });
        if (!customer) {
            console.warn(`⚠️ Customer not found. Auto-creating customer record for ${shopifyCustomerId}`);
            try {
                customer = await prisma.customer.create({
                    data: {
                        shopifyCustomerId,
                        shopId: shop,
                        currentBalance: 0,
                        customerTags: [],
                    }
                });
                console.log(`✅ Created new customer record: ${customer.id}`);
            } catch (createError) {
                console.error("Failed to auto-create customer:", createError);
                return { success: false, error: "Customer not found and creation failed", status: 500 };
            }
        }

        // 4. Find Reward
        const reward = await prisma.reward.findUnique({
            where: { id: rewardId },
        });

        if (!reward || !reward.isActive) {
            return { success: false, error: "Reward not available", status: 404 };
        }

        // 5. Validate Points
        if ((customer.currentBalance || 0) < reward.pointsCost) {
            return {
                success: false,
                error: "Insufficient points",
                required: reward.pointsCost,
                current: customer.currentBalance || 0,
                status: 400
            };
        }

        // 6. Minimum cart validation is handled by Shopify via the discount code's
        //    minimumRequirement field (set in createLoyaltyDiscount). No need to
        //    block redemption here — the customer gets the code and Shopify enforces
        //    the minimum at checkout.

        // 7. Create Discount Code in Shopify
        let discountResult: {
            success: boolean;
            code: string;
            discountId?: string;
            error?: string;
        } = {
            success: false,
            code: `LOYAL${shopifyCustomerId.slice(-4)}_${Date.now().toString(36).toUpperCase()}`,
        };

        if (admin) {
            discountResult = await createLoyaltyDiscount(
                admin,
                shopifyCustomerId,
                reward,
                30 // 30 days expiration
            );

            if (!discountResult.success && discountResult.error) {
                console.error("Failed to create Shopify discount:", discountResult.error);
                // Continue anyway - customer gets code, but it won't work in Shopify yet
                // A background job could potentially fix this later
            }
        } else {
            console.warn("No admin session - discount code generated but not created in Shopify");
        }

        // 8. Transaction: Create Redemption, Ledger, Update Balance
        const result = await prisma.$transaction(async (tx) => {
            // Create redemption
            const redemption = await tx.redemption.create({
                data: {
                    customerId: customer.id,
                    rewardId: reward.id,
                    rewardName: reward.name,
                    shopifyDiscountCode: discountResult.code,
                    pointsSpent: reward.pointsCost,
                },
            });

            // Create ledger entry
            await tx.ledger.create({
                data: {
                    customerId: customer.id,
                    amount: -reward.pointsCost,
                    reason: "redemption",
                    metadata: {
                        redemptionId: redemption.id,
                        rewardName: reward.name,
                        discountCode: discountResult.code,
                    },
                },
            });

            // Update customer balance
            const updatedCustomer = await tx.customer.update({
                where: { id: customer.id },
                data: {
                    currentBalance: {
                        decrement: reward.pointsCost,
                    },
                },
            });

            return { redemption, updatedCustomer };
        });

        // 9. Sync Metafield (Fire and forget)
        if (admin) {
            syncBalanceToShopify(admin, shopifyCustomerId, result.updatedCustomer.currentBalance || 0)
                .then(res => {
                    if (!res.success) console.warn("Metafield sync failed after redemption:", res.error);
                })
                .catch(err => console.error("Metafield sync error:", err));
        } else {
            // Try to get unauthenticated admin if we didn't have it (though step 2 should have caught this)
            try {
                const context = await shopify.unauthenticated.admin(shop);
                await syncBalanceToShopify(context.admin, shopifyCustomerId, result.updatedCustomer.currentBalance || 0);
            } catch (err) {
                console.warn("Could not sync metafield (no admin context):", err);
            }
        }

        // 9. Return Success Response
        return {
            success: true,
            discountCode: discountResult.code,
            newBalance: result.updatedCustomer.currentBalance || 0,
            redemption: {
                id: result.redemption.id,
                rewardName: reward.name,
                pointsSpent: reward.pointsCost,
            },
            shopifyDiscountCreated: discountResult.success,
            status: 200
        };

    } catch (error) {
        console.error("processRedemption error:", error);
        return { success: false, error: "Internal server error", status: 500 };
    }
}
