/**
 * Ensures the loyalty discount function is registered as an automatic discount
 * in the Shopify store.
 *
 * The Shopify Function (discount-function-rs) only runs when there is an
 * active automatic discount that references it AND specifies the correct
 * discountClasses (PRODUCT, ORDER, SHIPPING).
 *
 * This utility idempotently creates / re-creates that discount if it doesn't
 * already exist or is misconfigured.
 */

const DISCOUNT_TITLE = "Loyalty Free Products (auto)";

// The handle is defined in extensions/discount-function/shopify.extension.toml
const FUNCTION_HANDLE = "discount-function-rs";

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
              discountClasses
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
    return nodes.some((n: any) => {
      const d = n.automaticDiscount;
      if (d?.title !== DISCOUNT_TITLE) return false;
      if (d?.status === "EXPIRED") return false;
      // Verify it has the required discount classes
      const classes: string[] = d?.discountClasses ?? [];
      return classes.includes("PRODUCT") && classes.includes("ORDER");
    });
  } catch (err) {
    console.error(
      "[ensureDiscountFunction] Failed to check existing discounts:",
      err,
    );
    return false;
  }
}

/**
 * Create the automatic discount linked to the loyalty function via
 * the stable function handle (no need to query for function ID).
 */
async function createLoyaltyDiscountFunction(admin: any): Promise<boolean> {
  const mutation = `
    mutation CreateLoyaltyAutoDiscount($input: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $input) {
        automaticAppDiscount {
          discountId
          title
          status
          discountClasses
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
          functionHandle: FUNCTION_HANDLE,
          discountClasses: ["PRODUCT", "ORDER", "SHIPPING"],
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
      `✓ Created loyalty discount function: ${created?.title} (${created?.status}) classes=${created?.discountClasses}`,
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
 * Delete any stale/broken automatic discounts with our title so we can
 * re-create them with the correct discountClasses.
 */
async function deleteStaleLoyaltyDiscounts(admin: any): Promise<void> {
  const query = `
    query StaleLoyaltyDiscounts {
      automaticDiscountNodes(first: 25, query: "title:${DISCOUNT_TITLE}") {
        nodes {
          id
          automaticDiscount {
            __typename
            ... on DiscountAutomaticApp {
              title
              status
              discountClasses
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

    for (const node of nodes) {
      const d = node.automaticDiscount;
      if (d?.title !== DISCOUNT_TITLE) continue;

      // Delete discounts that are missing PRODUCT class (broken)
      const classes: string[] = d?.discountClasses ?? [];
      if (!classes.includes("PRODUCT")) {
        console.log(
          `[ensureDiscountFunction] Deleting stale discount ${node.id} (classes: ${classes.join(",") || "none"})`,
        );
        await admin.graphql(
          `mutation DeleteDiscount($id: ID!) {
            discountAutomaticDelete(id: $id) {
              deletedAutomaticDiscountId
              userErrors { field message }
            }
          }`,
          { variables: { id: node.id } },
        );
      }
    }
  } catch (err) {
    console.warn("[ensureDiscountFunction] Failed to clean stale discounts:", err);
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

    // Delete any stale/misconfigured discounts before re-creating
    await deleteStaleLoyaltyDiscounts(admin);

    console.log("[ensureDiscountFunction] Creating discount with handle:", FUNCTION_HANDLE);
    await createLoyaltyDiscountFunction(admin);
  } catch (err) {
    console.error("[ensureDiscountFunction] Unexpected error:", err);
  }
}
