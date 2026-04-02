import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useSubtotalAmount } from "@shopify/ui-extensions/checkout/preact";

export default async () => {
  render(<PointsEarnBanner />, document.body);
};

function PointsEarnBanner() {
  const subtotalAmount = useSubtotalAmount();
  const rawAmount = parseFloat(String(subtotalAmount?.amount ?? "0"));
  const pointsToEarn = Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0;

  if (pointsToEarn <= 0) return null;

  const s = shopify.settings?.current || {};

  const titleTemplate = s.earn_points_title ? String(s.earn_points_title) : "";
  const titleText = titleTemplate
    ? titleTemplate.replace("{{points}}", String(pointsToEarn))
    : shopify.i18n.translate("earnPoints.title", { points: pointsToEarn });

  const descText = s.earn_points_description ? String(s.earn_points_description) : shopify.i18n.translate("earnPoints.description");

  return (
    <s-box padding="base" borderRadius="base" background="subdued">
      <s-stack direction="inline" gap="base">
        <s-icon type="info" />
        <s-stack direction="block" gap="base">
          <s-text type="strong">{titleText}</s-text>
          <s-text>{descText}</s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
