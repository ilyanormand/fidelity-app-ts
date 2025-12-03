import { useEffect, useState } from "preact/hooks";
import { cancelPointsRedemption, changePointsToMoney } from "./utils";
export default function ChangePointsToDiscount({ ...props }) {
  const {
    shopify,
    balance,
    setBalance,
    setError,
    error,
    POINTS_PER_EURO,
    setAppliedDiscountPoints,
    appliedDiscountPoints,
  } = props;

  const [textNotEnoughPoints, setTextNotEnoughPoints] = useState("");
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [hasInvalidInput, setHasInvalidInput] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setHasInvalidInput(
      Number.isNaN(pointsToRedeem) ||
        pointsToRedeem < 0 ||
        pointsToRedeem > balance,
    );
  }, [pointsToRedeem, balance]);

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

  useEffect(() => {
    const n = Number(pointsToRedeem);
    if (!Number.isNaN(n) && n > balance) {
      setTextNotEnoughPoints(shopify.i18n.translate("errors.pointsNotEnough"));
    } else {
      setTextNotEnoughPoints("");
    }
  }, [pointsToRedeem, balance]);

  async function handleApplyPoints() {
    if (error) {
      setError("");
    }
    setIsApplying(true);
    try {
      const result = await changePointsToMoney(shopify, Number(pointsToRedeem));

      if (result.status) {
        setError("");
        const pointsToDeduct = Number(pointsToRedeem);
        setPointsToRedeem(0);
        setAppliedDiscountPoints(pointsToDeduct);
      } else {
        setError(result.error);
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

      if (result.status) {
        setError("");
        setAppliedDiscountPoints(0);
      } else {
        setError(
          result.error || shopify.i18n.translate("errors.errorChangePoints"),
        );
        setTimeout(() => {
          setError("");
        }, 5000);
      }
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <s-stack gap="base">
      <s-text tone="auto" type="strong">
        {shopify.i18n.translate("changePointsForDiscount")}
      </s-text>
      {textNotEnoughPoints && (
        <s-banner tone="critical">
          <s-text>{shopify.i18n.translate("errors.pointsNotEnough")}</s-text>
        </s-banner>
      )}
      <s-number-field
        label={shopify.i18n.translate("pointsToRedeem")}
        min={0}
        value={String(pointsToRedeem || 0)}
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
        {Math.floor(Number(pointsToRedeem) / POINTS_PER_EURO)} € (
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
          disabled={hasInvalidInput || Number(pointsToRedeem) === 0}
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
    </s-stack>
  );
}
