import "@shopify/ui-extensions/preact";
import { render } from "preact";
import Login from "./login";
import ChangePointsToItem from "./changePointsToItem";
import { useState, useEffect } from "preact/hooks";
import {
  useAppMetafields,
  useApplyCartLinesChange,
  useApplyDiscountCodeChange,
} from "@shopify/ui-extensions/checkout/preact";
import { getBalanceFromMetafields, validataAllDataOfLoyalty } from "./utils";
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

  const shopDomain = shopify.shop?.myshopifyDomain ?? "";

  useEffect(() => {
    if (initialBalanceValue !== undefined && initialBalanceValue !== null) {
      validataAllDataOfLoyalty(shopify, () => {}, initialBalanceValue, setBalance);
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
              <RewardSelect
                shopify={shopify}
                shopDomain={shopDomain}
                balance={balance}
                setBalance={setBalance}
                applyDiscountCodeChange={applyDiscountCodeChange}
              />
              <s-divider />
              <ChangePointsToItem
                shopify={shopify}
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
