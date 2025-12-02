export function getBalanceFromMetafields(useAppMetafields) {
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

export async function changePointsToMoney(shopify: any, points: number) {
  let status = false;
  const numericPoints = Number(points || 0);
  const result = await shopify.applyAttributeChange({
    type: "updateAttribute",
    key: "_loyalty_points_to_redeem",
    value: String(numericPoints),
  });

  if (result.type === "error") {
    return (status = false);
  }
  return (status = true);
}

export async function cancelPointsRedemption(shopify: any) {
  let status = false;
  const result = await shopify.applyAttributeChange({
    type: "updateAttribute",
    key: "_loyalty_points_to_redeem",
    value: "0",
  });

  if (result.type === "error") {
    return (status = false);
  }
  return (status = true);
}

export async function fetchRewardProducts(shopify) {
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

export async function validateCartWithFreeItems(shopify) {
  const cartLines = shopify.lines?.current || [];
  let ids = [];
  cartLines.forEach((line) => {
    ids.push(line.merchandise.id);
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

  let freeItemsArray: string[] = [];
  try {
    const parsed = JSON.parse(freeItemsAttr);
    if (Array.isArray(parsed)) {
      freeItemsArray = parsed;
    } else {
      return;
    }
  } catch (e) {
    return;
  }

  const validFreeItems = freeItemsArray.filter((variantId) =>
    ids.includes(variantId),
  );
  if (validFreeItems.length !== freeItemsArray.length) {
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "_loyalty_free_items",
      value: JSON.stringify(validFreeItems),
    });
  }
}

export async function validatePointsBalance(
  shopify,
  balance,
  setBalance,
  freeItems,
  initialBalance?,
  applyCartLinesChange?,
) {
  const allAttributes = shopify.attributes?.current || [];

  const cartAttributes: Record<string, string> = {};
  allAttributes.forEach((attr) => {
    if (attr && attr.key) {
      cartAttributes[attr.key] = attr.value;
    }
  });

  const spentPointsAttr = cartAttributes["_loyalty_points_spent"];
  const spentPoints = spentPointsAttr ? Number(spentPointsAttr) : 0;

  const pointsToRedeemAttr = cartAttributes["_loyalty_points_to_redeem"];
  const pointsToRedeem = pointsToRedeemAttr ? Number(pointsToRedeemAttr) : 0;

  const cartLines = shopify.lines?.current || [];

  const freeItemsAttr = cartAttributes["_loyalty_free_items"];
  let freeItemsArray: string[] = [];

  if (freeItemsAttr) {
    try {
      const parsed = JSON.parse(freeItemsAttr);
      if (Array.isArray(parsed)) {
        freeItemsArray = parsed;
      }
    } catch (e) {}
  }

  const pointsMapAttr = cartAttributes["_loyalty_points_map"];
  let pointsMap: Record<string, number> = {};

  if (pointsMapAttr) {
    try {
      const parsed = JSON.parse(pointsMapAttr);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        pointsMap = parsed;
      }
    } catch (e) {}
  }

  // Create an array of items purchased with points, including cost and quantity information
  const freeItemsLines = [];
  let totalCostFromCart = 0;

  cartLines.forEach((line) => {
    if (
      !line.merchandise ||
      (line.merchandise.__typename &&
        line.merchandise.__typename !== "ProductVariant")
    ) {
      return;
    }

    const variantId = line.merchandise.id;

    if (freeItemsArray.includes(variantId)) {
      const pointsCost = pointsMap[variantId] || 0;
      const quantity = line.quantity || 1;
      const lineTotalCost = pointsCost * quantity;

      // Extract ID from GID if needed (e.g., "gid://shopify/CartLine/123" -> "123")
      let lineId = String(line.id);
      if (lineId.startsWith("gid://")) {
        const parts = lineId.split("/");
        lineId = parts[parts.length - 1] || lineId;
      }

      freeItemsLines.push({
        lineId: lineId,
        variantId: variantId,
        pointsCost: pointsCost,
        quantity: quantity,
        totalCost: lineTotalCost,
      });

      totalCostFromCart += lineTotalCost;
    }
  });

  // Get available balance (source balance minus points spent on monetary discount)
  const sourceBalance = initialBalance !== undefined ? initialBalance : balance;
  const availableBalance = Math.max(0, sourceBalance - pointsToRedeem);

  // Don't remove items if balance is not loaded yet
  // Wait until initialBalance is available from metafields
  // Only remove items if we have a positive balance OR if initialBalance was explicitly passed and > 0
  const isBalanceLoaded =
    (initialBalance !== undefined && initialBalance > 0) || sourceBalance > 0;

  // If total cost of items exceeds available balance, remove items
  // But only if balance is loaded, otherwise wait for balance to load first
  if (
    totalCostFromCart > availableBalance &&
    applyCartLinesChange &&
    isBalanceLoaded
  ) {
    // Sort items by index in array (remove in order of addition)
    // or by cost (remove most expensive first)
    const sortedLines = [...freeItemsLines].sort(
      (a, b) => b.totalCost - a.totalCost,
    );

    let currentTotal = totalCostFromCart;
    const linesToRemove = [];
    const variantsToRemove = new Set<string>();
    const linesToUpdate = [];

    // Remove items until total becomes less than or equal to available balance
    for (const line of sortedLines) {
      if (currentTotal <= availableBalance) {
        break;
      }

      const neededReduction = currentTotal - availableBalance;
      const lineTotalCost = line.pointsCost * line.quantity;

      // If item cost is greater than or equal to needed reduction, remove entire line
      if (lineTotalCost >= neededReduction || line.quantity === 1) {
        linesToRemove.push(line);
        variantsToRemove.add(line.variantId);
        currentTotal -= lineTotalCost;
      } else {
        // Decrease item quantity
        const itemsToRemove = Math.ceil(neededReduction / line.pointsCost);
        const newQuantity = Math.max(0, line.quantity - itemsToRemove);

        if (newQuantity === 0) {
          linesToRemove.push(line);
          variantsToRemove.add(line.variantId);
          currentTotal -= lineTotalCost;
        } else {
          // Save information for update
          linesToUpdate.push({
            ...line,
            newQuantity: newQuantity,
          });
          currentTotal -= line.pointsCost * (line.quantity - newQuantity);
        }
      }
    }

    // First, update item quantities
    for (const line of linesToUpdate) {
      await applyCartLinesChange({
        type: "updateCartLine",
        cartLineId: line.lineId, // Already processed - extracted from GID if needed
        quantity: line.newQuantity,
      });
    }

    // Remove items from cart
    for (const line of linesToRemove) {
      await applyCartLinesChange({
        type: "removeCartLine",
        cartLineId: line.lineId, // Already processed - extracted from GID if needed
      });
    }

    // Update attributes: remove variantId from list
    const remainingFreeItems = freeItemsArray.filter(
      (variantId) => !variantsToRemove.has(variantId),
    );

    if (remainingFreeItems.length !== freeItemsArray.length) {
      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_free_items",
        value: JSON.stringify(remainingFreeItems),
      });

      // Update cost map, removing deleted items
      const remainingPointsMap = {};
      remainingFreeItems.forEach((variantId) => {
        if (pointsMap[variantId]) {
          remainingPointsMap[variantId] = pointsMap[variantId];
        }
      });

      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_points_map",
        value: JSON.stringify(remainingPointsMap),
      });
    }

    // Recalculate total cost after removal
    totalCostFromCart = currentTotal;
  }

  const difference = spentPoints - totalCostFromCart;
  const isMatch = Math.abs(difference) < 0.01;

  if (!isMatch) {
    await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "_loyalty_points_spent",
      value: String(totalCostFromCart),
    });
  }

  if (setBalance) {
    const sourceBalance =
      initialBalance !== undefined ? initialBalance : balance;

    const finalSpentPoints = isMatch ? spentPoints : totalCostFromCart;
    const totalSpentPoints = finalSpentPoints + pointsToRedeem;

    const newBalance = Math.max(0, sourceBalance - totalSpentPoints);

    if (Math.abs(newBalance - balance) > 0.01) {
      setBalance(newBalance);
    }
  }
}
