/**
 * Ensures the loyalty discount function is registered as an automatic discount
 * in the Shopify store with the correct discountClasses.
 *
 * Without discountClasses: [PRODUCT, ORDER, SHIPPING] the function never
 * receives the Product class and cannot apply 100% off to free loyalty items.
 */

const DISCOUNT_TITLE = "Loyalty Free Products (auto)";
const FUNCTION_HANDLE = "discount-function-rs";

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

    console.log(
      "[ensureDiscountFunction] Found functions:",
      fns.map((f) => `${f.title} (${f.apiType})`).join(", "),
    );

    const match = fns.find(
      (fn) => fn.apiType === "cart_lines_discounts_generate_run",
    );
    return match?.id ?? null;
  } catch (err) {
    console.error("[ensureDiscountFunction] Failed to query functions:", err);
    return null;
  }
}

async function findExistingDiscount(admin: any): Promise<{
  exists: boolean;
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

    console.log(
      "[ensureDiscountFunction] All discounts:",
      JSON.stringify(
        nodes.map((n: any) => ({
          id: n.id,
          title: n.automaticDiscount?.title,
          type: n.automaticDiscount?.__typename,
          status: n.automaticDiscount?.status,
          classes: n.automaticDiscount?.discountClasses,
        })),
      ),
    );

    let isCorrect = false;
    const staleIds: string[] = [];

    for (const node of nodes) {
      const d = node.automaticDiscount;
      if (d?.__typename !== "DiscountAutomaticApp") continue;
      if (d?.title !== DISCOUNT_TITLE) continue;

      const classes: string[] = d?.discountClasses ?? [];
      if (
        classes.includes("PRODUCT") &&
        classes.includes("ORDER") &&
        d?.status !== "EXPIRED"
      ) {
        isCorrect = true;
      } else {
        staleIds.push(node.id);
      }
    }

    return { exists: isCorrect || staleIds.length > 0, isCorrect, staleIds };
  } catch (err) {
    console.error("[ensureDiscountFunction] Failed to check discounts:", err);
    return { exists: false, isCorrect: false, staleIds: [] };
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

async function createDiscount(
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

  const input: Record<string, any> = {
    title: DISCOUNT_TITLE,
    functionId,
    discountClasses: ["PRODUCT", "ORDER", "SHIPPING"],
    startsAt: new Date().toISOString(),
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true,
    },
  };

  console.log(
    "[ensureDiscountFunction] Creating discount with input:",
    JSON.stringify(input),
  );

  try {
    const res = await admin.graphql(mutation, {
      variables: { input },
    });

    const data = await res.json();
    const errors = data.data?.discountAutomaticAppCreate?.userErrors ?? [];

    if (errors.length > 0) {
      console.error("[ensureDiscountFunction] Creation userErrors:", JSON.stringify(errors));

      // If functionId fails, try with functionHandle instead
      if (errors.some((e: any) => e.field?.includes("functionId"))) {
        console.log("[ensureDiscountFunction] Retrying with functionHandle...");
        input.functionHandle = FUNCTION_HANDLE;
        delete input.functionId;

        const res2 = await admin.graphql(mutation, {
          variables: { input },
        });
        const data2 = await res2.json();
        const errors2 = data2.data?.discountAutomaticAppCreate?.userErrors ?? [];
        if (errors2.length > 0) {
          console.error("[ensureDiscountFunction] Retry userErrors:", JSON.stringify(errors2));
          return false;
        }
        const created2 = data2.data?.discountAutomaticAppCreate?.automaticAppDiscount;
        console.log(
          `✓ Created loyalty discount (handle): ${created2?.title} classes=${created2?.discountClasses}`,
        );
        return true;
      }
      return false;
    }

    const created = data.data?.discountAutomaticAppCreate?.automaticAppDiscount;
    console.log(
      `✓ Created loyalty discount: ${created?.title} (${created?.status}) classes=${created?.discountClasses}`,
    );
    return true;
  } catch (err) {
    console.error("[ensureDiscountFunction] Failed to create:", err);
    return false;
  }
}

export async function ensureLoyaltyDiscountFunction(admin: any): Promise<void> {
  try {
    console.log("[ensureDiscountFunction] Checking...");

    const { isCorrect, staleIds } = await findExistingDiscount(admin);

    if (isCorrect) {
      console.log("[ensureDiscountFunction] Correct discount already exists.");
      return;
    }

    // Delete any stale/broken discounts
    for (const id of staleIds) {
      await deleteDiscount(admin, id);
    }

    // Find the function ID
    const functionId = await getLoyaltyFunctionId(admin);
    if (!functionId) {
      console.warn(
        "[ensureDiscountFunction] Function not found. Run `shopify app deploy` first.",
      );
      return;
    }
    console.log("[ensureDiscountFunction] Found functionId:", functionId);

    await createDiscount(admin, functionId);
  } catch (err) {
    console.error("[ensureDiscountFunction] Unexpected error:", err);
  }
}
