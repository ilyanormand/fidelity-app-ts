import "@shopify/ui-extensions/preact";
import { render } from "preact";
import Login from "./login";
import ChangePointsToItem from "./changePointsToItem";
import { useState, useEffect } from "preact/hooks";
import {
  useAppMetafields,
  useApplyCartLinesChange,
} from "@shopify/ui-extensions/checkout/preact";
import { getBalanceFromMetafields, validataAllDataOfLoyalty } from "./utils";
import ChangePointsToDiscount from "./changePointsToDiscount";

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

  // Get metafield balance
  const initialBalanceValue = getBalanceFromMetafields(useAppMetafields);
  const [balance, setBalance] = useState(initialBalanceValue);

  // State for applied discount points
  const [appliedDiscountPoints, setAppliedDiscountPoints] = useState(0);

  //Another state for errors
  const [error, setError] = useState("");

  //Count balance from attributes (including pointsToRedeem)
  useEffect(() => {
    if (initialBalanceValue !== undefined && initialBalanceValue !== null) {
      validataAllDataOfLoyalty(
        shopify,
        setAppliedDiscountPoints,
        initialBalanceValue,
        setBalance,
      );
    }
  }, [initialBalanceValue, shopify?.attributes?.current]);

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
              <ChangePointsToDiscount
                shopify={shopify}
                balance={balance}
                setBalance={setBalance}
                setError={setError}
                error={error}
                POINTS_PER_EURO={POINTS_PER_EURO}
                setAppliedDiscountPoints={setAppliedDiscountPoints}
                appliedDiscountPoints={appliedDiscountPoints}
              />
              <s-divider />
              <ChangePointsToItem
                shopify={shopify}
                balance={balance}
                setBalance={setBalance}
              />
            </s-stack>

            // <s-stack gap="base">
            //   <s-text tone="auto" type="strong">
            //     {shopify.i18n.translate("changePointsForDiscount")}
            //   </s-text>
            //   {textNotEnoughPoints && (
            //     <s-banner tone="critical">
            //       <s-text>
            //         {shopify.i18n.translate("errors.pointsNotEnough")}
            //       </s-text>
            //     </s-banner>
            //   )}
            //   <s-number-field
            //     label={shopify.i18n.translate("pointsToRedeem")}
            //     min={0}
            //     value={pointsToRedeem}
            //     disabled={isApplying}
            //     onInput={(event) => {
            //       const nextValue =
            //         (event && event["detail"] && event["detail"]["value"]) ||
            //         (event && event["target"] && event["target"]["value"]) ||
            //         "";
            //       setPointsToRedeem(nextValue);
            //     }}
            //   ></s-number-field>

            //   <s-text tone="neutral" type="small">
            //     {shopify.i18n.translate("expectedDiscount")}:{" "}
            //     {Math.floor(numericPoints / POINTS_PER_EURO)} € (
            //     {POINTS_PER_EURO} {shopify.i18n.translate("points")} = 1 €)
            //   </s-text>
            //   {error && (
            //     <s-banner tone="critical">
            //       <s-text>{error}</s-text>
            //     </s-banner>
            //   )}
            //   <s-grid gridTemplateColumns="170px 170px">
            //     <s-button
            //       variant="primary"
            //       tone="neutral"
            //       loading={isApplying}
            //       disabled={hasInvalidInput || numericPoints === 0}
            //       onClick={handleApplyPoints}
            //     >
            //       {shopify.i18n.translate("applyPointsButton")}
            //     </s-button>
            //     <s-button
            //       variant="primary"
            //       tone="neutral"
            //       loading={isCancelling}
            //       disabled={appliedDiscountPoints === 0}
            //       onClick={handleCancelRedemption}
            //     >
            //       {shopify.i18n.translate("components.cancelRedemption")}
            //     </s-button>
            //   </s-grid>

            //   <s-divider />
            //   <ChangePointsToItem
            //     shopify={shopify}
            //     freeItems={freeItems}
            //     balance={balance}
            //     setBalance={setBalance}
            //   />
            // </s-stack>
          )}
        </s-stack>
      </s-box>
    </s-grid>
  );
}
