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
    // @ts-ignore
    const freeItemsAttr = input.cart.freeItemsAttr;
    let freeItemsVariantIds: string[] = [];

    if (freeItemsAttr?.value) {
      try {
        freeItemsVariantIds = JSON.parse(freeItemsAttr.value);
      } catch (e) {}
    }

    const freeProductLines = input.cart.lines.filter((line) => {
      if (line.merchandise.__typename !== "ProductVariant") {
        return false;
      }
      const variantId = line.merchandise.id;
      return freeItemsVariantIds.includes(variantId);
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
    // @ts-ignore
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
