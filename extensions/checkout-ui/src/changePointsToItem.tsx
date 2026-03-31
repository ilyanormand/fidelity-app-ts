import "@shopify/ui-extensions/preact";
import { useApplyCartLinesChange } from "@shopify/ui-extensions/checkout/preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { fetchRewardProducts, parseFreeItemsAttribute, RewardProduct } from "./utils";

const APP_BACKEND_URL = "https://staging.fwn-tech.com";

export default function ChangePointsToItem({ balance, setBalance, shopify, registerFreeLineId }) {
  const [rewards, setRewards] = useState<RewardProduct[]>([]);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const applyCartLinesChange = useApplyCartLinesChange();

  // Load available reward products from backend
  useEffect(() => {
    async function load() {
      try {
        const token = await shopify.sessionToken.get();
        const data = await fetchRewardProducts(token);
        setRewards(data);
      } catch {
        setRewards([]);
      }
    }
    load();
  }, []);

  // ── REDEEM ──────────────────────────────────────────────────────────────────
  const redeemProduct = useCallback(async (reward: RewardProduct) => {
    setRedeemingId(reward.id);
    setValidationError(null);

    try {
      if (balance < reward.pointsCost) return;

      // Confirm redemption: validates AND deducts points from DB + metafield
      let confirmResult: any = null;
      try {
        const token = await shopify.sessionToken.get();
        const res = await fetch(
          `${APP_BACKEND_URL}/api/checkout?path=confirm-product-redemption`,
          {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              variantId: reward.shopifyVariantId,
              pointsCost: reward.pointsCost,
              productTitle: reward.shopifyProductTitle,
              token,
            }),
          },
        );
        confirmResult = await res.json();
        if (!confirmResult.success) {
          const msg =
            confirmResult.error === "insufficient_points"
              ? shopify.i18n?.translate("notEnoughPoints") || "Points insuffisants"
              : shopify.i18n?.translate("errors.errorChangePoints") || "Erreur de validation";
          setValidationError(msg);
          return;
        }
      } catch {
        // fail-open — network error during confirmation
      }

      // Snapshot current cart lines before adding
      const linesBefore = (shopify.lines?.current || []).map(l => l.id);

      // Add the product to the cart with a line-level property for detection
      const addResult = await applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: reward.shopifyVariantId,
        quantity: 1,
        attributes: [{ key: "_loyalty_free_item", value: "true" }],
      });
      if (addResult.type === "error") return;

      // Find the newly added line and register it for cleanup on unmount
      const linesAfter = shopify.lines?.current || [];
      const newLine = linesAfter.find(l => !linesBefore.includes(l.id));
      if (newLine && registerFreeLineId) {
        registerFreeLineId(newLine.id, 1);
      }

      // Update _loyalty_free_items attribute (used for cleanup detection)
      const attrsArray = shopify.attributes?.current ?? [];
      const attrsMap: Record<string, string> = {};
      attrsArray.forEach((a: any) => { if (a?.key) attrsMap[a.key] = a.value; });
      const freeItemsMap = parseFreeItemsAttribute(attrsMap["_loyalty_free_items"]);

      const existing = freeItemsMap[reward.shopifyVariantId];
      freeItemsMap[reward.shopifyVariantId] = existing
        ? { quantity: existing.quantity + 1, spent: existing.spent + reward.pointsCost }
        : { quantity: 1, spent: reward.pointsCost };

      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_free_items",
        value: JSON.stringify(freeItemsMap),
      });

      const totalSpent = Object.values(freeItemsMap).reduce(
        (sum, item) => sum + item.spent,
        0,
      );
      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_points_spent",
        value: String(totalSpent),
      });

      // Update UI balance from confirmed server response
      if (confirmResult?.currentBalance !== undefined) {
        setBalance(confirmResult.currentBalance);
      }
    } catch (err) {
      console.error("[changePointsToItem] redeemProduct error:", err);
    } finally {
      setRedeemingId(null);
    }
  }, [balance, shopify, applyCartLinesChange, setBalance]);

  return (
    <s-stack gap="base">
      <s-text type="strong">
        {shopify.i18n.translate("pointsToItem")}
      </s-text>

      {validationError && (
        <s-banner tone="critical">
          <s-text>{validationError}</s-text>
        </s-banner>
      )}

      <s-scroll-box maxBlockSize="400px">
        <s-stack gap="base">
          {rewards.map((reward) => (
            <RewardOffer
              key={reward.id}
              reward={reward}
              onRedeem={redeemProduct}
              balance={balance}
              isRedeeming={redeemingId === reward.id}
              shopify={shopify}
            />
          ))}
        </s-stack>
      </s-scroll-box>
    </s-stack>
  );
}

function RewardOffer({
  reward,
  onRedeem,
  balance,
  isRedeeming,
  shopify,
}: {
  reward: RewardProduct;
  onRedeem: (r: RewardProduct) => void;
  balance: number;
  isRedeeming: boolean;
  shopify: any;
}) {
  const { shopifyProductTitle: title, pointsCost, shopifyProductImageUrl: imageUrl } = reward;
  const canAfford = balance >= pointsCost;

  return (
    <s-stack gap="small-200">
      <s-grid
        gap="base"
        gridTemplateColumns="64px 1fr auto"
        alignItems="center"
        padding="none large none none"
      >
        <s-image
          borderWidth="base"
          borderRadius="large-100"
          src={imageUrl}
          alt={title}
          aspectRatio="1"
        />

        <s-stack gap="none">
          <s-text type="strong">{title}</s-text>
          <s-text color="subdued">{pointsCost} points</s-text>
        </s-stack>

        {isRedeeming ? (
          <s-spinner />
        ) : (
          <s-button
            variant="secondary"
            disabled={!canAfford}
            onClick={() => onRedeem(reward)}
          >
            {shopify?.i18n?.translate("redeem") || "Échanger"}
          </s-button>
        )}
      </s-grid>
    </s-stack>
  );
}
