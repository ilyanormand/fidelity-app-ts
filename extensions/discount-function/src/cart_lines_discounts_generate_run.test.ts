import { describe, it, expect } from "vitest";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
} from "../generated/api";

describe("cartLinesDiscountsGenerateRun", () => {
  it("applies free discount to matching variant IDs", () => {
    const input: CartInput = {
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      cart: {
        attribute: {
          key: "_loyalty_free_items",
          value: JSON.stringify([
            "gid://shopify/ProductVariant/111",
            "gid://shopify/ProductVariant/222",
          ]),
        },
        lines: [
          {
            id: "line_1",
            merchandise: {
              __typename: "ProductVariant" as const,
              id: "gid://shopify/ProductVariant/111",
              product: {
                metafield: null,
              },
            },
          },
          {
            id: "line_2",
            merchandise: {
              __typename: "ProductVariant" as const,
              id: "gid://shopify/ProductVariant/999",
              product: {
                metafield: null,
              },
            },
          },
        ],
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);

    expect(result).toEqual({
      operations: [
        {
          productDiscountsAdd: {
            selectionStrategy: ProductDiscountSelectionStrategy.All,
            candidates: [
              {
                message: "FREE - Loyalty Reward",
                targets: [
                  {
                    cartLine: { id: "line_1" },
                  },
                ],
                value: {
                  percentage: { value: 100 },
                },
              },
            ],
          },
        },
      ],
    });
  });

  it("returns empty operations when no matching free items", () => {
    const input: CartInput = {
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      cart: {
        attribute: {
          key: "_loyalty_free_items",
          value: JSON.stringify(["gid://shopify/ProductVariant/123"]),
        },
        lines: [
          {
            id: "line_1",
            merchandise: {
              __typename: "ProductVariant" as const,
              id: "gid://shopify/ProductVariant/999",
              product: {
                metafield: null,
              },
            },
          },
        ],
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);

    expect(result.operations).toEqual([]);
  });

  it("throws error when no cart lines found", () => {
    const input: CartInput = {
      discount: {
        discountClasses: [DiscountClass.Product],
      },
      cart: {
        lines: [],
        attribute: null,
      },
    };

    expect(() => cartLinesDiscountsGenerateRun(input)).toThrow(
      "No cart lines found",
    );
  });
});
