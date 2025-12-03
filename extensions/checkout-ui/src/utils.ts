//JSON PARSE PROTECTION
export function parseFreeItemsAttribute(
  value: string | null | undefined,
): Record<string, FreeItemData> {
  const result: Record<string, FreeItemData> = {};

  if (!value) {
    return result;
  }

  try {
    const parsed = JSON.parse(value);

    if (isValidFreeItemsMap(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed)) {
      parsed.forEach((variantId: unknown) => {
        if (typeof variantId === "string" && variantId.length > 0) {
          result[variantId] = { quantity: 1, spent: 0 };
        }
      });
      return result;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return result;
    }

    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof key !== "string" || key.length === 0) {
        return;
      }

      if (typeof value === "number" && value > 0) {
        result[key] = { quantity: value, spent: 0 };
        return;
      }

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const data = value as any;
        if (
          typeof data.quantity === "number" &&
          typeof data.spent === "number" &&
          data.quantity > 0 &&
          !isNaN(data.quantity) &&
          isFinite(data.quantity) &&
          !isNaN(data.spent) &&
          isFinite(data.spent) &&
          data.spent >= 0
        ) {
          result[key] = {
            quantity: data.quantity,
            spent: data.spent,
          };
        }
      }
    });
  } catch (e) {
    // Ignore parse errors
  }

  return result;
}

interface FreeItemData {
  quantity: number;
  spent: number;
}

//JSON PARSE PROTECTION
function isValidFreeItemsMap(
  value: any,
): value is Record<string, FreeItemData> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value.constructor !== Object
  ) {
    return false;
  }
  if ("__proto__" in value || "constructor" in value) {
    return false;
  }
  return Object.entries(value).every(([key, item]) => {
    if (typeof key !== "string" || key.length === 0) {
      return false;
    }
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      item.constructor !== Object
    ) {
      return false;
    }
    if ("__proto__" in item || "constructor" in item) {
      return false;
    }
    const data = item as any;
    return (
      typeof data.quantity === "number" &&
      !isNaN(data.quantity) &&
      isFinite(data.quantity) &&
      data.quantity > 0 &&
      typeof data.spent === "number" &&
      !isNaN(data.spent) &&
      isFinite(data.spent) &&
      data.spent >= 0
    );
  });
}

//FUNCTION FOR GET BALANCE FROM METAFIELDS
export function getBalanceFromMetafields(useAppMetafields) {
  if (!useAppMetafields || typeof useAppMetafields !== "function") {
    return 0;
  }
  const balanceMetafields = useAppMetafields({
    namespace: "loyalty",
    key: "balance",
    type: "customer",
  });
  const balanceMetafield = balanceMetafields.find(
    (entry) => entry.target?.type === "customer",
  );
  const metafieldsBalance = balanceMetafield?.metafield?.value
    ? Number(balanceMetafield.metafield.value)
    : 0;
  const metafieldsBalanceCheck = metafieldsBalance > 0 ? metafieldsBalance : 0;
  return metafieldsBalanceCheck;
}

//FUNCTION FOR CHANGE POINTS TO MONEY
export async function changePointsToMoney(shopify: any, points: number) {
  if (!shopify || typeof shopify.applyAttributeChange !== "function") {
    return {
      status: false,
      error:
        shopify.i18n?.translate("errors.errorChangePoints") ||
        "Error changing points to money",
    };
  }
  const numericPoints = Number(points || 0);
  const result = await shopify.applyAttributeChange({
    type: "updateAttribute",
    key: "_loyalty_points_to_redeem",
    value: String(numericPoints),
  });

  if (result.type === "error") {
    return {
      status: false,
      error:
        shopify.i18n?.translate("errors.errorChangePoints") ||
        "Error changing points to money",
    };
  }
  return {
    status: true,
    error: null,
  };
}

//FUNCTION FOR CANCEL POINTS TO MONEY
export async function cancelPointsRedemption(shopify: any) {
  if (!shopify || typeof shopify.applyAttributeChange !== "function") {
    return {
      status: false,
      error:
        shopify.i18n?.translate("errors.errorCancelChangePoints") ||
        "Error canceling points to money",
    };
  }
  const result = await shopify.applyAttributeChange({
    type: "updateAttribute",
    key: "_loyalty_points_to_redeem",
    value: "0",
  });

  if (result.type === "error") {
    return {
      status: false,
      error:
        shopify.i18n?.translate("errors.errorCancelChangePoints") ||
        "Error canceling points to money",
    };
  }
  return {
    status: true,
    error: null,
  };
}

//FUNCTION FOR FETCH REWARD PRODUCTS
export async function fetchRewardProducts(shopify) {
  if (!shopify || typeof shopify.query !== "function") {
    return [];
  }
  const query = `
    query rewardProducts {
      products(first: 50) {
        nodes {
          id
          title
          featuredImage { url }
          variants(first: 1) { nodes { id } }
          metafields(identifiers: [
            { namespace: "loyalty", key: "points_cost" }
          ]) {
            value
          }
        }
      }
    }
  `;

  const response = await shopify.query(query);
  const products = response?.data?.products?.nodes ?? [];
  const rewards = products
    .map((p) => {
      const mf = Array.isArray(p.metafields) ? p.metafields[0] : null;

      // metafield exists and has value
      if (!mf || mf.value == null) return null;

      // Check if variants exist and have at least one node
      if (
        !p.variants?.nodes ||
        !Array.isArray(p.variants.nodes) ||
        p.variants.nodes.length === 0 ||
        !p.variants.nodes[0]?.id
      ) {
        return null;
      }

      return {
        id: p.id,
        title: p.title,
        imageUrl: p.featuredImage?.url ?? null,
        variantId: p.variants.nodes[0].id,
        pointsCost: Number(mf.value),
      };
    })
    .filter(Boolean);
  return rewards;
}

//FUNCTION FOR VALIDATE CART WITH FREE ITEMS
//FOR EXAMPLE IF CUSTOMER DELETE ITEM FROM CART, WE NEED TO UPDATE ATTRIBUTES
export async function validateCartWithFreeItems(shopify) {
  if (!shopify) {
    return;
  }
  const cartLines = shopify.lines?.current || [];

  const cartLinesMap = new Map<string, number>();
  cartLines.forEach((line) => {
    if (line?.merchandise?.id) {
      const variantId = line.merchandise.id;
      const quantity = line.quantity || 1;
      cartLinesMap.set(variantId, quantity);
    }
  });

  const allAttributes = shopify.attributes?.current || [];

  const cartAttributes: Record<string, string> = {};
  allAttributes.forEach((attr) => {
    if (attr && attr.key) {
      cartAttributes[attr.key] = attr.value;
    }
  });
  const freeItemsAttr = cartAttributes["_loyalty_free_items"];

  if (!freeItemsAttr) {
    return;
  }

  const freeItemsMap = parseFreeItemsAttribute(freeItemsAttr);

  const validFreeItemsMap: Record<string, FreeItemData> = {};
  let needsUpdate = false;

  Object.entries(freeItemsMap).forEach(([variantId, itemData]) => {
    if (cartLinesMap.has(variantId)) {
      const cartQuantity = cartLinesMap.get(variantId) || 0;
      const finalQuantity = Math.min(itemData.quantity, cartQuantity);
      const pointsPerItem =
        itemData.quantity > 0 ? itemData.spent / itemData.quantity : 0;
      validFreeItemsMap[variantId] = {
        quantity: finalQuantity,
        spent: pointsPerItem * finalQuantity,
      };
      if (
        finalQuantity !== itemData.quantity ||
        finalQuantity !== cartQuantity
      ) {
        needsUpdate = true;
      }
    } else {
      needsUpdate = true;
    }
  });

  if (needsUpdate && shopify.applyAttributeChange) {
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "_loyalty_free_items",
      value: JSON.stringify(validFreeItemsMap),
    });

    const totalSpent = Object.values(validFreeItemsMap).reduce(
      (sum, item) => sum + item.spent,
      0,
    );
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "_loyalty_points_spent",
      value: String(totalSpent),
    });
  }
}

export async function validatePointsBalance(
  shopify,
  setAppliedDiscountPoints,
  initialBalance?,
  setBalance?,
) {
  if (!shopify) {
    return;
  }

  if (initialBalance === undefined || initialBalance === null) {
    return;
  }

  const allAttributes = shopify.attributes?.current || [];
  const cartAttributes: Record<string, string> = {};
  allAttributes.forEach((attr) => {
    if (attr && attr.key) {
      cartAttributes[attr.key] = attr.value;
    }
  });

  const pointsToRedeemAttr = cartAttributes["_loyalty_points_to_redeem"];
  const pointsToRedeem = pointsToRedeemAttr ? Number(pointsToRedeemAttr) : 0;

  const pointsSpentAttr = cartAttributes["_loyalty_points_spent"];
  const pointsSpent = pointsSpentAttr ? Number(pointsSpentAttr) : 0;

  const metafieldsBalance = initialBalance || 0;
  const totalSpent = pointsToRedeem + pointsSpent;

  if (initialBalance === 0) {
    return;
  }

  if (totalSpent > metafieldsBalance && shopify.applyAttributeChange) {
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "_loyalty_points_to_redeem",
      value: "0",
    });

    if (setAppliedDiscountPoints) {
      setAppliedDiscountPoints(0);
    }

    if (setBalance) {
      const availableBalance = Math.max(0, metafieldsBalance - pointsSpent);
      setBalance(availableBalance);
    }
  } else {
    if (setAppliedDiscountPoints) {
      setAppliedDiscountPoints(pointsToRedeem);
    }

    if (setBalance) {
      const availableBalance = Math.max(0, metafieldsBalance - totalSpent);
      setBalance(availableBalance);
    }
  }
}

export async function validataAllDataOfLoyalty(
  shopify,
  setAppliedDiscountPoints,
  initialBalance?,
  setBalance?,
) {
  await validateCartWithFreeItems(shopify);
  await validatePointsBalance(
    shopify,
    setAppliedDiscountPoints,
    initialBalance,
    setBalance,
  );
}
