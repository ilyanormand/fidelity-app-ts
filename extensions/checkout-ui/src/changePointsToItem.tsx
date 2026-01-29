import "@shopify/ui-extensions/preact";
import { useApplyCartLinesChange } from "@shopify/ui-extensions/checkout/preact";
import { useState, useEffect } from "preact/hooks";
import { fetchRewardProducts, parseFreeItemsAttribute } from "./utils";

export default function ChangePointsToItem({ balance, setBalance, shopify }) {
  const [rewards, setRewards] = useState([]);
  const [redeemingProductId, setRedeemingProductId] = useState(null);
  const applyCartLinesChange = useApplyCartLinesChange();

  useEffect(() => {
    async function loadRewardProducts() {
      try {
        const data = await fetchRewardProducts(shopify);
        setRewards(data);
      } catch (error) {
        setRewards([]);
      }
    }
    loadRewardProducts();
  }, []);

  useEffect(() => {
    setBalance(balance);
  }, [balance]);

  //FUNCTION FOR REDEEM PRODUCT
  async function redeemProduct(reward) {
    console.log("[changePointsToItem] redeemProduct START", {
      reward: reward,
      currentBalance: balance,
      pointsCost: reward.pointsCost,
    });

    setRedeemingProductId(reward.id);
    try {
      if (balance < reward.pointsCost) {
        console.warn(
          "[changePointsToItem] Insufficient balance:",
          balance,
          "<",
          reward.pointsCost,
        );
        return;
      }

      console.log("[changePointsToItem] Adding product to cart...");
      const addResult = await applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: reward.variantId,
        quantity: 1,
      });

      if (addResult.type === "error") {
        console.error("[changePointsToItem] Failed to add product:", addResult);
        return;
      }
      console.log("[changePointsToItem] Product added successfully");

      const cartAttributesArray = shopify.attributes.current || [];
      const cartAttributes: Record<string, string> = {};
      cartAttributesArray.forEach((attr) => {
        if (attr && attr.key) {
          cartAttributes[attr.key] = attr.value;
        }
      });

      console.log(
        "[changePointsToItem] Current cart attributes:",
        cartAttributes,
      );

      const currentFreeItems = cartAttributes["_loyalty_free_items"];
      const freeItemsMap = parseFreeItemsAttribute(currentFreeItems);

      console.log("[changePointsToItem] Current freeItemsMap:", freeItemsMap);

      const existingItem = freeItemsMap[reward.variantId];
      if (existingItem) {
        freeItemsMap[reward.variantId] = {
          quantity: existingItem.quantity + 1,
          spent: existingItem.spent + reward.pointsCost,
        };
        console.log(
          "[changePointsToItem] Updated existing item:",
          freeItemsMap[reward.variantId],
        );
      } else {
        freeItemsMap[reward.variantId] = {
          quantity: 1,
          spent: reward.pointsCost,
        };
        console.log(
          "[changePointsToItem] Added new item:",
          freeItemsMap[reward.variantId],
        );
      }

      console.log("[changePointsToItem] Updating _loyalty_free_items...");
      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_free_items",
        value: JSON.stringify(freeItemsMap),
      });

      console.log(
        "[changePointsToItem] Before balance update:",
        balance,
        "deducting:",
        reward.pointsCost,
      );
      setBalance((prev) => {
        const newBalance = prev - reward.pointsCost;
        console.log(
          "[changePointsToItem] Balance update:",
          prev,
          "->",
          newBalance,
          `(deducted ${reward.pointsCost})`,
        );
        return newBalance;
      });

      const totalSpent = Object.values(freeItemsMap).reduce(
        (sum, item) => sum + item.spent,
        0,
      );

      console.log(
        "[changePointsToItem] Total spent calculated:",
        totalSpent,
        "updating _loyalty_points_spent...",
      );
      await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_loyalty_points_spent",
        value: String(totalSpent),
      });

      console.log("[changePointsToItem] redeemProduct END");
    } catch (error) {
      console.error("[changePointsToItem] Error in redeemProduct:", error);
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
            shopify={shopify}
          />
        ))}
      </s-stack>
    </s-scroll-box>
  );
}

function RewardOffer({ reward, onRedeem, balance, isRedeeming, shopify }) {
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
            {shopify?.i18n?.translate("redeem") || "Redeem"}
          </s-button>
        )}
      </s-grid>
    </s-stack>
  );
}
