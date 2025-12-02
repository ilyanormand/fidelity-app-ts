import "@shopify/ui-extensions/preact";
import { useApplyCartLinesChange } from "@shopify/ui-extensions/checkout/preact";
import { useState, useEffect } from "preact/hooks";
import { fetchRewardProducts } from "./utils";

export default function ChangePointsToItem({ freeItems, balance, setBalance }) {
  const [rewards, setRewards] = useState([]);
  const [redeemingProductId, setRedeemingProductId] = useState(null);
  const applyCartLinesChange = useApplyCartLinesChange();

  useEffect(() => {
    if (freeItems && Array.isArray(freeItems)) {
      setRewards(freeItems);
    } else {
      setRewards([]);
    }
  }, [freeItems]);

  useEffect(() => {
    setBalance(balance);
  }, [balance]);

  //DATA FOR REDUCTION FUNCTION
  async function redeemProduct(reward) {
    setRedeemingProductId(reward.id);

    try {
      if (balance < reward.pointsCost) {
        return;
      }
      const addResult = await applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: reward.variantId,
        quantity: 1,
      });

      if (addResult.type === "error") {
        return;
      }

      const cartAttributesArray = shopify.attributes.current || [];

      const cartAttributes: Record<string, string> = {};
      cartAttributesArray.forEach((attr) => {
        if (attr && attr.key) {
          cartAttributes[attr.key] = attr.value;
        }
      });

      const currentFreeItems = cartAttributes["_loyalty_free_items"];
      let freeItemsArray = [];

      if (currentFreeItems) {
        try {
          freeItemsArray = JSON.parse(currentFreeItems);
          if (!Array.isArray(freeItemsArray)) {
            freeItemsArray = [];
          }
        } catch (e) {
          freeItemsArray = [];
        }
      }

      if (!freeItemsArray.includes(reward.variantId)) {
        freeItemsArray.push(reward.variantId);
      }

      const pointsMapAttr = cartAttributes["_loyalty_points_map"];
      let pointsMap = {};

      if (pointsMapAttr) {
        try {
          pointsMap = JSON.parse(pointsMapAttr);
          if (typeof pointsMap !== "object" || Array.isArray(pointsMap)) {
            pointsMap = {};
          }
        } catch (e) {
          pointsMap = {};
        }
      }

      pointsMap[reward.variantId] = reward.pointsCost;
      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_free_items",
        value: JSON.stringify(freeItemsArray),
      });

      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_points_map",
        value: JSON.stringify(pointsMap),
      });

      setBalance((prev) => prev - reward.pointsCost);
      const spentPoints = cartAttributes["_loyalty_points_spent"]
        ? Number(cartAttributes["_loyalty_points_spent"])
        : 0;

      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_points_spent",
        value: String(spentPoints + reward.pointsCost),
      });
    } finally {
      setRedeemingProductId(null);
    }
  }

  return (
    <s-scroll-box maxBlockSize="400px">
      <s-stack gap="base">
        <s-text type="strong">{shopify.i18n.translate("pointsToItem")}</s-text>

        {rewards.map((reward) => (
          <RewardOffer
            key={reward.id}
            reward={reward}
            onRedeem={redeemProduct}
            balance={balance}
            isRedeeming={redeemingProductId === reward.id}
          />
        ))}
      </s-stack>
    </s-scroll-box>
  );
}

function RewardOffer({ reward, onRedeem, balance, isRedeeming }) {
  const { title, pointsCost, imageUrl } = reward;
  const isDisabled = balance < pointsCost;

  return (
    <s-stack gap="base">
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
          <s-spinner></s-spinner>
        ) : (
          <s-button
            variant="secondary"
            disabled={isDisabled}
            onClick={() => onRedeem(reward)}
          >
            Redeem
          </s-button>
        )}
      </s-grid>
    </s-stack>
  );
}
