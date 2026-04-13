import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  OrderDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from "../generated/api";

/**
 * @param {CartInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    throw new Error("No cart lines found");
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );
  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );

  const operations = [];
  const POINTS_PER_EURO = 100;

  if (hasProductDiscountClass) {
    const freeItemsAttr = input.cart.freeItemsAttr;
    let freeItemsMap: Record<string, { quantity: number; spent: number }> = {};

    if (freeItemsAttr?.value) {
      try {
        const parsed = JSON.parse(freeItemsAttr.value);
        if (
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          parsed !== null
        ) {
          Object.entries(parsed).forEach(([key, value]) => {
            if (typeof key === "string" && key.length > 0) {
              if (
                typeof value === "object" &&
                value !== null &&
                !Array.isArray(value)
              ) {
                const data = value as any;
                if (
                  typeof data.quantity === "number" &&
                  typeof data.spent === "number" &&
                  data.quantity > 0
                ) {
                  freeItemsMap[key] = {
                    quantity: data.quantity,
                    spent: data.spent,
                  };
                }
              } else if (typeof value === "number" && value > 0) {
                freeItemsMap[key] = {
                  quantity: value,
                  spent: 0,
                };
              }
            }
          });
        } else if (Array.isArray(parsed)) {
          parsed.forEach((variantId: string) => {
            if (typeof variantId === "string" && variantId.length > 0) {
              freeItemsMap[variantId] = {
                quantity: 1,
                spent: 0,
              };
            }
          });
        }
      } catch (e) {}
    }

    const freeProductLines: Array<{
      lineId: string;
      freeQty: number;
    }> = [];

    for (const line of input.cart.lines) {
      if (line.merchandise.__typename !== "ProductVariant") continue;

      let freeQty = 0;

      // Line-level property: always 1 redeemed item per add
      if ((line as any).loyaltyFreeItem?.value === "true") {
        freeQty = 1;
      }

      // Cart-level map: use the stored redeemed quantity
      if (freeQty === 0) {
        const variantId = line.merchandise.id;
        const entry = freeItemsMap[variantId];
        if (entry && entry.quantity > 0) {
          freeQty = entry.quantity;
        }
      }

      if (freeQty > 0) {
        // Never discount more than the actual line quantity
        const cappedQty = Math.min(freeQty, line.quantity);
        freeProductLines.push({ lineId: line.id, freeQty: cappedQty });
      }
    }

    if (freeProductLines.length > 0) {
      const candidates = freeProductLines.map(({ lineId, freeQty }) => ({
        message: "FREE - Loyalty Reward",
        targets: [
          {
            cartLine: {
              id: lineId,
              quantity: freeQty,
            },
          },
        ],
        value: {
          percentage: {
            value: 100,
          },
        },
      }));

      operations.push({
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      });
    }
  }

  if (hasOrderDiscountClass) {
    const pointsToRedeemAttr = input.cart.pointsToRedeemAttr;

    if (pointsToRedeemAttr?.value) {
      const pointsToRedeem = Number(pointsToRedeemAttr.value) || 0;

      if (pointsToRedeem > 0) {
        const discountAmount = (pointsToRedeem / POINTS_PER_EURO).toFixed(2);

        operations.push({
          orderDiscountsAdd: {
            candidates: [
              {
                message: `Loyalty Points Discount: ${pointsToRedeem} points`,
                targets: [
                  {
                    orderSubtotal: {
                      excludedCartLineIds: [],
                    },
                  },
                ],
                value: {
                  fixedAmount: {
                    amount: discountAmount,
                  },
                },
              },
            ],
            selectionStrategy: OrderDiscountSelectionStrategy.First,
          },
        });
      }
    }
  }

  return {
    operations,
  };
}
