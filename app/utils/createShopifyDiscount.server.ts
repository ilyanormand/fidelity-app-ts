/**
 * Create unique discount codes in Shopify for loyalty redemptions
 */

interface Reward {
  name: string;
  discountType: string;
  discountValue: number;
  minimumCartValue: number | null;
}

interface DiscountResult {
  success: boolean;
  code: string;
  discountId?: string;
  error?: any;
}

/**
 * Create a unique, single-use discount code in Shopify
 */
export async function createLoyaltyDiscount(
  admin: any,
  customerId: string,
  reward: Reward,
  expirationDays: number = 30
): Promise<DiscountResult> {
  // Generate unique code
  const code = `LOYAL${customerId.slice(-4)}_${Date.now().toString(36).toUpperCase()}`;
  
  // Calculate dates
  const startsAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();

  const mutation = `
    mutation CreateLoyaltyDiscount($discount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $discount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
              title
              summary
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  // Build discount configuration
  const discountConfig: any = {
    title: `Loyalty Reward: ${reward.name}`,
    code: code,
    startsAt: startsAt,
    endsAt: expiresAt,
    customerSelection: {
      customers: {
        add: [`gid://shopify/Customer/${customerId}`]
      }
    },
    usageLimit: 1, // Single use only
    appliesOncePerCustomer: true,
  };

  // Configure discount value based on type
  if (reward.discountType === "percentage") {
    discountConfig.customerGets = {
      value: {
        percentage: reward.discountValue / 100 // Convert 10 to 0.1 (10%)
      },
      items: {
        all: true
      }
    };
  } else if (reward.discountType === "fixed_amount") {
    discountConfig.customerGets = {
      value: {
        discountAmount: {
          amount: (reward.discountValue / 100).toFixed(2), // Convert cents to dollars
          appliesOnEachItem: false
        }
      },
      items: {
        all: true
      }
    };
  } else if (reward.discountType === "free_shipping") {
    discountConfig.customerGets = {
      value: {
        percentage: 1.0 // 100% off shipping
      },
      items: {
        all: true
      },
      appliesOnOneTimePurchase: true,
      appliesOnSubscription: true
    };
    discountConfig.combinesWith = {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: false
    };
  }

  // Add minimum purchase requirement if specified
  if (reward.minimumCartValue) {
    discountConfig.minimumRequirement = {
      greaterThanOrEqualToSubtotal: {
        greaterThanOrEqualToSubtotal: (reward.minimumCartValue / 100).toFixed(2)
      }
    };
  }

  try {
    const response = await admin.graphql(mutation, {
      variables: { discount: discountConfig }
    });

    const data = await response.json();
    const errors = data.data?.discountCodeBasicCreate?.userErrors || [];

    if (errors.length > 0) {
      console.error("Error creating discount code:", errors);
      return {
        success: false,
        code: code,
        error: errors
      };
    }

    const discountId = data.data?.discountCodeBasicCreate?.codeDiscountNode?.id;

    return {
      success: true,
      code: code,
      discountId: discountId
    };
  } catch (error) {
    console.error("Failed to create discount code:", error);
    return {
      success: false,
      code: code,
      error: error
    };
  }
}

/**
 * Delete a discount code from Shopify (for cleanup)
 */
export async function deleteShopifyDiscount(
  admin: any,
  shopifyDiscountId: string
): Promise<boolean> {
  const mutation = `
    mutation DeleteDiscount($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: { id: shopifyDiscountId }
    });

    const data = await response.json();
    const errors = data.data?.discountCodeDelete?.userErrors || [];

    if (errors.length > 0) {
      console.error("Error deleting discount:", errors);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to delete discount:", error);
    return false;
  }
}

