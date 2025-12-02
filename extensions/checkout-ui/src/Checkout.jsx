import "@shopify/ui-extensions/preact";
import { render } from "preact";
import Login from "./login";
import ChangePointsToItem from "./changePointsToItem";
import { useState, useEffect } from "preact/hooks";
import {
  useAppMetafields,
  useApplyCartLinesChange,
} from "@shopify/ui-extensions/checkout/preact";
import {
  changePointsToMoney,
  cancelPointsRedemption,
  validateCartWithFreeItems,
  validatePointsBalance,
  fetchRewardProducts,
  getBalanceFromMetafields,
} from "./utils";

import { useBuyerJourney } from "@shopify/ui-extensions/checkout/preact";

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
  //Check authorization
  if (!shopify.buyerIdentity?.email?.value) {
    return <Login shopify={shopify} />;
  }

  //Get logic to calculate discount
  //For example
  const POINTS_PER_EURO = 100;
  const buyerJourney = useBuyerJourney();

  // Get metafield balance
  const initialBalanceValue = getBalanceFromMetafields(useAppMetafields);
  const [balance, setBalance] = useState(initialBalanceValue);
  const applyCartLinesChange = useApplyCartLinesChange();

  //Get items wich customer can get for points
  const [freeItems, setFreeItems] = useState([]);
  useEffect(() => {
    async function loadRewardProducts() {
      try {
        const data = await fetchRewardProducts(shopify);
        setFreeItems(data);
      } catch (error) {
        setFreeItems([]);
      }
    }
    loadRewardProducts();
  }, []);

  //State for points to redeem
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // State for applied discount points
  const [appliedDiscountPoints, setAppliedDiscountPoints] = useState(0);

  //Another state for errors
  const [error, setError] = useState("");
  const [textNotEnoughPoints, setTextNotEnoughPoints] = useState("");

  //Convert points to redeem to number
  const numericPoints = Number(pointsToRedeem || 0);

  //Validate cart with free items when component mounts or cart changes
  useEffect(() => {
    validateCartWithFreeItems(shopify);
  }, []);

  //Track applied discount points
  useEffect(() => {
    const allAttributes = shopify.attributes?.current || [];
    const cartAttributes = {};
    allAttributes.forEach((attr) => {
      if (attr && attr.key) {
        cartAttributes[attr.key] = attr.value;
      }
    });

    const pointsToRedeemAttr = cartAttributes["_loyalty_points_to_redeem"];
    const points = pointsToRedeemAttr ? Number(pointsToRedeemAttr) : 0;
    setAppliedDiscountPoints(points > 0 ? points : 0);
  }, [shopify.attributes?.current]);

  //Count balance from attributes (including pointsToRedeem)
  useEffect(() => {
    validatePointsBalance(
      shopify,
      balance,
      setBalance,
      freeItems,
      initialBalanceValue,
      applyCartLinesChange,
    );
  }, [initialBalanceValue, freeItems]);

  useEffect(() => {
    const n = Number(pointsToRedeem);
    if (!Number.isNaN(n) && n > balance) {
      setTextNotEnoughPoints(shopify.i18n.translate("errors.pointsNotEnough"));
    } else {
      setTextNotEnoughPoints("");
    }
  }, [pointsToRedeem, balance]);

  const hasInvalidInput =
    Number.isNaN(numericPoints) || numericPoints < 0 || numericPoints > balance;

  async function handleApplyPoints() {
    if (error) {
      setError("");
    }
    setIsApplying(true);
    try {
      const result = await changePointsToMoney(shopify, numericPoints);
      if (result) {
        setError("");
        setBalance((prevBalance) => Math.max(0, prevBalance - numericPoints));
        setPointsToRedeem("");
        setAppliedDiscountPoints(numericPoints);
      } else {
        setError(shopify.i18n.translate("errors.errorChangePoints"));
        setTimeout(() => {
          setError("");
        }, 5000);
      }
    } finally {
      setIsApplying(false);
    }
  }

  async function handleCancelRedemption() {
    if (error) {
      setError("");
    }
    setIsCancelling(true);
    try {
      const result = await cancelPointsRedemption(shopify);
      if (result) {
        setError("");
        setBalance((prevBalance) => prevBalance + appliedDiscountPoints);
        setAppliedDiscountPoints(0);
      } else {
        setError(shopify.i18n.translate("errors.errorChangePoints"));
        setTimeout(() => {
          setError("");
        }, 5000);
      }
    } finally {
      setIsCancelling(false);
    }
  }
  const cartLines = shopify.lines.current;

  return (
    <s-grid gap="base">
      <s-text type="strong">{shopify.i18n.translate("loyaltyProgram")}</s-text>
      <s-box>
        <s-stack gap="base">
          <s-stack gap="small-100">
            <s-text>
              {shopify.i18n.translate("balance")}
              <s-text tone="info">
                {" "}
                {balance} {shopify.i18n.translate("points")}
              </s-text>
            </s-text>
          </s-stack>
          <s-divider />
          {balance > 0 && (
            <s-stack gap="base">
              <s-text tone="auto" type="strong">
                {shopify.i18n.translate("changePointsForDiscount")}
              </s-text>
              {textNotEnoughPoints && (
                <s-banner tone="critical">
                  <s-text>
                    {shopify.i18n.translate("errors.pointsNotEnough")}
                  </s-text>
                </s-banner>
              )}
              <s-number-field
                label={shopify.i18n.translate("pointsToRedeem")}
                min={0}
                value={pointsToRedeem}
                disabled={isApplying}
                onInput={(event) => {
                  const nextValue =
                    (event && event["detail"] && event["detail"]["value"]) ||
                    (event && event["target"] && event["target"]["value"]) ||
                    "";
                  setPointsToRedeem(nextValue);
                }}
              ></s-number-field>

              <s-text tone="neutral" type="small">
                {shopify.i18n.translate("expectedDiscount")}:{" "}
                {Math.floor(numericPoints / POINTS_PER_EURO)} € (
                {POINTS_PER_EURO} {shopify.i18n.translate("points")} = 1 €)
              </s-text>
              {error && (
                <s-banner tone="critical">
                  <s-text>{error}</s-text>
                </s-banner>
              )}
              <s-grid gridTemplateColumns="170px 170px">
                <s-button
                  variant="primary"
                  tone="neutral"
                  loading={isApplying}
                  disabled={hasInvalidInput || numericPoints === 0}
                  onClick={handleApplyPoints}
                >
                  {shopify.i18n.translate("applyPointsButton")}
                </s-button>
                <s-button
                  variant="primary"
                  tone="neutral"
                  loading={isCancelling}
                  disabled={appliedDiscountPoints === 0}
                  onClick={handleCancelRedemption}
                >
                  {shopify.i18n.translate("components.cancelRedemption")}
                </s-button>
              </s-grid>

              <s-divider />
              <ChangePointsToItem
                freeItems={freeItems}
                balance={balance}
                setBalance={setBalance}
              />
            </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-grid>
  );
}
