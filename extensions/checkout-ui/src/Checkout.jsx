import "@shopify/ui-extensions/preact";
import { render } from "preact";
import Login from "./login";
import ChangePointsToItem from "./changePointsToItem";
import { useState, useEffect, useRef } from "preact/hooks";
import {
  useAppMetafields,
  useApplyCartLinesChange,
  useApplyDiscountCodeChange,
} from "@shopify/ui-extensions/checkout/preact";
import { getBalanceFromMetafields, validataAllDataOfLoyalty, parseFreeItemsAttribute } from "./utils";
import RewardSelect from "./RewardSelect";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  if (!shopify.instructions.value.attributes.canUpdateAttributes) {
    return (
      <s-banner heading="Loyalty" tone="warning">
        {shopify.i18n.translate("attributeChangesAreNotSupported")}
      </s-banner>
    );
  }

  if (!shopify.buyerIdentity?.email?.value) {
    return <Login shopify={shopify} />;
  }

  const initialBalanceValue = getBalanceFromMetafields(useAppMetafields);
  const [balance, setBalance] = useState(initialBalanceValue);
  const applyDiscountCodeChange = useApplyDiscountCodeChange();
  const applyCartLinesChange = useApplyCartLinesChange();

  const shopDomain = shopify.shop?.myshopifyDomain ?? "";

  // Ref to track free item line IDs added during THIS checkout session.
  // ChangePointsToItem will push to this via the callback.
  const freeLineIdsRef = useRef([]);
  // Track whether the buyer completed checkout (order placed).
  const orderCompletedRef = useRef(false);

  // ── CLEANUP ON MOUNT: remove leftover free items from a previous session ──
  useEffect(() => {
    async function cleanupLeftovers() {
      const cartLines = shopify.lines?.current || [];
      const attrsArray = shopify.attributes?.current || [];
      const attrsMap = {};
      attrsArray.forEach((a) => { if (a?.key) attrsMap[a.key] = a.value; });
      const freeItemsRaw = attrsMap["_loyalty_free_items"];
      if (!freeItemsRaw) return;

      const freeItemsMap = parseFreeItemsAttribute(freeItemsRaw);
      const variantIds = Object.keys(freeItemsMap);
      if (!variantIds.length) return;

      let cleaned = 0;
      for (const line of cartLines) {
        const vid = line.merchandise?.id;
        if (!vid || !variantIds.includes(vid)) continue;

        const freeQty = freeItemsMap[vid]?.quantity || 0;
        if (freeQty <= 0) continue;

        try {
          if (freeQty >= line.quantity) {
            await applyCartLinesChange({
              type: "removeCartLine",
              id: line.id,
              quantity: line.quantity,
            });
          } else {
            await applyCartLinesChange({
              type: "updateCartLine",
              id: line.id,
              quantity: line.quantity - freeQty,
            });
          }
          cleaned++;
        } catch (e) {
          console.warn("[Checkout] Failed to clean leftover free item:", e);
        }
      }

      if (cleaned > 0) {
        await shopify.applyAttributeChange({
          type: "updateAttribute",
          key: "_loyalty_free_items",
          value: "",
        });
        await shopify.applyAttributeChange({
          type: "updateAttribute",
          key: "_loyalty_points_spent",
          value: "",
        });
        console.log("[Checkout] Cleaned up", cleaned, "leftover free item(s).");
      }
    }
    cleanupLeftovers();
  }, []);

  // ── CLEANUP ON UNMOUNT: user leaving checkout without completing order ─────
  useEffect(() => {
    return () => {
      if (orderCompletedRef.current) return;

      const lineIds = freeLineIdsRef.current;
      if (!lineIds.length) return;

      // Fire-and-forget: remove all free items we added this session
      for (const { id, quantity } of lineIds) {
        applyCartLinesChange({
          type: "removeCartLine",
          id,
          quantity,
        }).catch(() => {});
      }

      // Clear attributes
      shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_free_items",
        value: "",
      }).catch(() => {});
      shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_points_spent",
        value: "",
      }).catch(() => {});

      console.log("[Checkout] Unmount cleanup: removing", lineIds.length, "free item(s).");
    };
  }, []);

  // ── DETECT ORDER COMPLETED ─────────────────────────────────────────────────
  useEffect(() => {
    // `shopify.buyerJourney` exposes the completed state.
    // When the buyer submits the order, set the flag so we skip cleanup.
    const unsubscribe = shopify.buyerJourney?.completed?.subscribe((completed) => {
      if (completed) {
        orderCompletedRef.current = true;
      }
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, []);

  // Balance sync
  useEffect(() => {
    if (initialBalanceValue !== undefined && initialBalanceValue !== null) {
      validataAllDataOfLoyalty(shopify, () => {}, initialBalanceValue, setBalance);
    }
  }, [initialBalanceValue, shopify?.attributes?.current]);

  // Callback for ChangePointsToItem to register added free item line IDs
  const registerFreeLineId = (lineId, quantity) => {
    freeLineIdsRef.current.push({ id: lineId, quantity });
  };

  /** @type {Record<string, any>} */
  const s = shopify.settings?.current || {};
  const t = (key, fallback) => shopify.i18n.translate(key) || fallback;

  const titleText = s.loyalty_program_title || t("loyaltyProgram", "Programme de fidélité");
  const balanceLabel = s.balance_label || t("balance", "Balance:");
  const pointsLabel = s.points_label || t("points", "Points");

  return (
    <s-grid gap="base">
      <s-text type="strong">{titleText}</s-text>
      <s-box>
        <s-stack gap="base">
          <s-stack gap="small-100">
            <s-text>
              {balanceLabel}
              <s-text tone="info">
                {" "}
                {balance} {pointsLabel}
              </s-text>
            </s-text>
          </s-stack>
          <s-divider />
          {balance > 0 && (
            <s-stack gap="base">
              <RewardSelect
                shopify={shopify}
                shopDomain={shopDomain}
                balance={balance}
                setBalance={setBalance}
                applyDiscountCodeChange={applyDiscountCodeChange}
                settings={s}
              />
              <ChangePointsToItem
                shopify={shopify}
                balance={balance}
                setBalance={setBalance}
                registerFreeLineId={registerFreeLineId}
                settings={s}
              />
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-grid>
  );
}
