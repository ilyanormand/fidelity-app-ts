// @ts-nocheck
import "@shopify/ui-extensions/preact";
import {
  useBuyerJourney,
  useCartLines,
  useAppMetafields,
} from "@shopify/ui-extensions/checkout/preact";
import { useEffect, useMemo } from "preact/hooks";

import { validatePointsBalance } from "./validatePoints";

export default function ValidateSystem() {
  const buyerJourney = useBuyerJourney();
  const cartLines = useCartLines();

  const balanceMetafields = useAppMetafields({
    namespace: "loyalty",
    key: "balance",
    type: "customer",
  });
  const balanceMetafield = balanceMetafields.find(
    (entry) => entry.target?.type === "customer",
  );
  const userBalance = balanceMetafield?.metafield?.value
    ? Number(balanceMetafield.metafield.value)
    : 0;

  const allAttributes = shopify.attributes?.current || [];
  const cartAttributes: Record<string, string> = {};
  allAttributes.forEach((attr) => {
    if (attr && attr.key) {
      cartAttributes[attr.key] = attr.value;
    }
  });

  const spentPointsAttr = cartAttributes["_loyalty_points_spent"];
  const spentPoints = spentPointsAttr ? Number(spentPointsAttr) : 0;

  const availableBalance = Math.max(0, userBalance - spentPoints);

  const rewards = useMemo(() => {
    const freeItemsAttr = cartAttributes["_loyalty_free_items"];
    if (!freeItemsAttr) return [];

    const pointsMapAttr = cartAttributes["_loyalty_points_map"];
    let pointsMap: Record<string, number> = {};

    if (pointsMapAttr) {
      try {
        const parsed = JSON.parse(pointsMapAttr);
        if (typeof parsed === "object" && !Array.isArray(parsed)) {
          pointsMap = parsed;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    try {
      const freeItemsVariantIds = JSON.parse(freeItemsAttr);

      return cartLines
        .filter((line) => {
          if (
            !line.merchandise ||
            (line.merchandise.__typename &&
              line.merchandise.__typename !== "ProductVariant")
          ) {
            return false;
          }
          return (
            line.merchandise.id &&
            freeItemsVariantIds.includes(line.merchandise.id)
          );
        })
        .map((line) => {
          const variantId = line.merchandise.id;
          const pointsCost = pointsMap[variantId] || 0;

          return {
            id: line.id,
            variantId: variantId,
            pointsCost: pointsCost,
            quantity: line.quantity || 1,
          };
        })
        .filter((r) => r.pointsCost > 0);
    } catch (e) {
      return [];
    }
  }, [cartLines, allAttributes]);

  const result = validatePointsBalance(availableBalance, rewards);

  useEffect(() => {
    if (!buyerJourney.canBlockProgress) return;

    if (!result.isEnough && rewards.length > 0) {
      buyerJourney.intercept(() => {
        return {
          behavior: "block",
          reason: "Not enough points",
          errors: [
            {
              message:
                shopify.i18n?.translate("errors.notEnoughPointsForRedeem") ||
                `Not enough points for free items: required ${result.totalCost}, available ${availableBalance}.`,
            },
          ],
        };
      });
    } else {
      buyerJourney.clear();
    }

    // Cleanup
    return () => {
      buyerJourney.clear();
    };
  }, [result, buyerJourney, rewards.length, availableBalance]);

  if (rewards.length === 0 || result.isEnough) {
    return null;
  }

  return (
    <s-banner tone="critical">
      <s-text>
        {shopify.i18n?.translate("errors.notEnoughPointsForRedeem") ||
          `Not enough points for free items: required ${result.totalCost}, available ${availableBalance}. Missing ${result.missing} points.`}
      </s-text>
    </s-banner>
  );
}
