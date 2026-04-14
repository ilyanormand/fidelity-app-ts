/**
 * Ensures the loyalty discount function is registered as an automatic discount
 * in the Shopify store with the correct discountClasses.
 *
 * Without discountClasses: [PRODUCT, ORDER] the function never
 * receives the Product class and cannot apply 100% off to free loyalty items.
 */

const DISCOUNT_TITLE = "Loyalty Free Products (auto)";
const FUNCTION_HANDLE = "discount-function-rs";

async function findExistingDiscount(admin: any): Promise<{
  isCorrect: boolean;
  staleIds: string[];
}> {
  const query = `
    query CheckLoyaltyDiscount {
      automaticDiscountNodes(first: 50) {
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

    let isCorrect = false;
    const staleIds: string[] = [];

    for (const node of nodes) {
      const d = node.automaticDiscount;
      if (d?.__typename !== "DiscountAutomaticApp") continue;
      if (d?.title !== DISCOUNT_TITLE) continue;

      const classes: string[] = d?.discountClasses ?? [];
      const hasRequired = classes.includes("PRODUCT") && classes.includes("ORDER");
      const hasShipping = classes.includes("SHIPPING");
      if (
        hasRequired &&
        !hasShipping &&
        d?.status !== "EXPIRED"
      ) {
        isCorrect = true;
      } else {
        staleIds.push(node.id);
      }
    }

    return { isCorrect, staleIds };
  } catch (err) {
    console.error("[ensureDiscountFunction] Failed to check discounts:", err);
    return { isCorrect: false, staleIds: [] };
  }
}

async function deleteDiscount(admin: any, id: string): Promise<void> {
  try {
    const res = await admin.graphql(
      `mutation DeleteDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors { field message }
        }
      }`,
      { variables: { id } },
    );
    const data = await res.json();
    const errors = data.data?.discountAutomaticDelete?.userErrors ?? [];
    if (errors.length > 0) {
      console.error("[ensureDiscountFunction] Delete errors:", errors);
    } else {
      console.log(`[ensureDiscountFunction] Deleted stale discount ${id}`);
    }
  } catch (err) {
    console.warn("[ensureDiscountFunction] Failed to delete:", err);
  }
}

async function createDiscount(admin: any): Promise<boolean> {
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

  const input = {
    title: DISCOUNT_TITLE,
    functionHandle: FUNCTION_HANDLE,
    discountClasses: ["PRODUCT", "ORDER"],
    startsAt: new Date().toISOString(),
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true,
    },
  };

  console.log(
    "[ensureDiscountFunction] Creating discount with functionHandle:",
    FUNCTION_HANDLE,
  );

  try {
    const res = await admin.graphql(mutation, {
      variables: { input },
    });

    const data = await res.json();
    const errors = data.data?.discountAutomaticAppCreate?.userErrors ?? [];

    if (errors.length > 0) {
      console.error(
        "[ensureDiscountFunction] Creation userErrors:",
        JSON.stringify(errors),
      );
      return false;
    }

    const created =
      data.data?.discountAutomaticAppCreate?.automaticAppDiscount;
    console.log(
      `✓ Created loyalty discount: ${created?.title} (${created?.status}) classes=${created?.discountClasses}`,
    );
    return true;
  } catch (err) {
    console.error("[ensureDiscountFunction] Failed to create:", err);
    return false;
  }
}

export async function ensureLoyaltyDiscountFunction(
  admin: any,
): Promise<void> {
  try {
    console.log("[ensureDiscountFunction] Checking...");

    const { isCorrect, staleIds } = await findExistingDiscount(admin);

    if (isCorrect) {
      console.log("[ensureDiscountFunction] Correct discount already exists.");
      return;
    }

    for (const id of staleIds) {
      await deleteDiscount(admin, id);
    }

    await createDiscount(admin);
  } catch (err) {
    console.error("[ensureDiscountFunction] Unexpected error:", err);
  }
}
