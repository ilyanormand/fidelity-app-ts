import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { useSubtotalAmount } from "@shopify/ui-extensions/checkout/preact";

export default async () => {
  render(<PointsEarnBanner />, document.body);
};

function PointsEarnBanner() {
  const [isOpen, setIsOpen] = useState(true);
  const subtotalAmount = useSubtotalAmount();
  const rawAmount = parseFloat(subtotalAmount?.amount ?? "0");
  const pointsToEarn = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0;

  if (pointsToEarn <= 0) return null;

  return (
    <s-box padding="base" borderRadius="base" background="subdued">
      <s-stack direction="inline" gap="base"> 
        <s-icon type="info" />
        <s-stack direction="block" gap="base"> 
          <s-text type="strong">
            {shopify.i18n.translate("earnPoints.title", { points: pointsToEarn })}
          </s-text>
          <s-text>
            {shopify.i18n.translate("earnPoints.description")}
          </s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
