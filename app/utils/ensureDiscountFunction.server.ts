/**
 * Ensures the loyalty cart-lines discount function is registered as an
 * automatic discount in the Shopify store.
 *
 * The Shopify Function (discount-function-rs) only runs when there is an
 * active automatic discount that references it.  This utility idempotently
 * creates that discount if it doesn't already exist.
 */

const DISCOUNT_TITLE = "Loyalty Free Products (auto)";

/**
 * Find the function ID for the `cart.lines.discounts.generate.run` target
 * that belongs to this app.
 */
async function getLoyaltyFunctionId(admin: any): Promise<string | null> {
  const query = `
    query GetShopifyFunctions {
      shopifyFunctions(first: 25) {
        nodes {
          id
          apiType
          title
        }
      }
    }
  `;

  try {
    const res = await admin.graphql(query);
    const data = await res.json();
    const fns: Array<{ id: string; apiType: string; title: string }> =
      data.data?.shopifyFunctions?.nodes ?? [];

    const match = fns.find(
      (fn) => fn.apiType === "cart_lines_discounts_generate_run",
    );
    return match?.id ?? null;
  } catch (err) {
    console.error("[ensureDiscountFunction] Failed to query functions:", err);
    return null;
  }
}

/**
 * Check whether an active automatic app discount with our title already exists.
 */
async function loyaltyDiscountAlreadyExists(admin: any): Promise<boolean> {
  const query = `
    query CheckLoyaltyDiscount {
      automaticDiscountNodes(first: 25, query: "title:${DISCOUNT_TITLE}") {
        nodes {
          id
          automaticDiscount {
            __typename
            ... on DiscountAutomaticApp {
              title
              status
            }
          }
        }
      }
    }
  `;

  try {
    const res = await admin.graphql(query);
    const data = await res.json();
    const nodes = data.data?.automaticDiscountNodes?.nodes ?? [];
    return nodes.some(
      (n: any) =>
        n.automaticDiscount?.title === DISCOUNT_TITLE &&
        n.automaticDiscount?.status !== "EXPIRED",
    );
  } catch (err) {
    console.error(
      "[ensureDiscountFunction] Failed to check existing discounts:",
      err,
    );
    return false;
  }
}

/**
 * Create the automatic discount linked to the loyalty function.
 */
async function createLoyaltyDiscountFunction(
  admin: any,
  functionId: string,
): Promise<boolean> {
  const mutation = `
    mutation CreateLoyaltyAutoDiscount($input: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $input) {
        automaticAppDiscount {
          discountId
          title
          status
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  try {
    const res = await admin.graphql(mutation, {
      variables: {
        input: {
          title: DISCOUNT_TITLE,
          functionId,
          startsAt: new Date().toISOString(),
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: true,
            shippingDiscounts: true,
          },
        },
      },
    });

    const data = await res.json();
    const errors =
      data.data?.discountAutomaticAppCreate?.userErrors ?? [];

    if (errors.length > 0) {
      console.error(
        "[ensureDiscountFunction] Error creating discount:",
        errors,
      );
      return false;
    }

    const created = data.data?.discountAutomaticAppCreate?.automaticAppDiscount;
    console.log(
      `✓ Created loyalty discount function: ${created?.title} (${created?.status})`,
    );
    return true;
  } catch (err) {
    console.error(
      "[ensureDiscountFunction] Failed to create discount:",
      err,
    );
    return false;
  }
}

/**
 * Main entry point — call this from the dashboard loader.
 * Safe to call on every load; it checks before creating.
 */
export async function ensureLoyaltyDiscountFunction(admin: any): Promise<void> {
  try {
    const alreadyExists = await loyaltyDiscountAlreadyExists(admin);
    if (alreadyExists) {
      return;
    }

    const functionId = await getLoyaltyFunctionId(admin);
    if (!functionId) {
      console.warn(
        "[ensureDiscountFunction] Could not find cart_lines_discounts_generate_run function. " +
          "Make sure the app is deployed with `shopify app deploy`.",
      );
      return;
    }

    await createLoyaltyDiscountFunction(admin, functionId);
  } catch (err) {
    // Non-fatal — app still works without automatic discount, just won't apply free-product discounts
    console.error("[ensureDiscountFunction] Unexpected error:", err);
  }
}
