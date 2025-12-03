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

    const freeProductLines = input.cart.lines.filter((line) => {
      if (line.merchandise.__typename !== "ProductVariant") {
        return false;
      }
      const variantId = line.merchandise.id;
      return (
        freeItemsMap[variantId] !== undefined &&
        freeItemsMap[variantId].quantity > 0
      );
    });

    if (freeProductLines.length > 0) {
      const candidates = freeProductLines.map((line) => ({
        message: "FREE - Loyalty Reward",
        targets: [
          {
            cartLine: {
              id: line.id,
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
