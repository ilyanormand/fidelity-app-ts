import { useState, useEffect } from "preact/hooks";
import { fetchRewards, redeemRewardAtCheckout, CheckoutReward } from "./utils";

interface RewardSelectProps {
  shopify: any;
  shopDomain: string;
  balance: number;
  setBalance: (balance: number) => void;
  applyDiscountCodeChange: (change: any) => Promise<any>;
}

export default function RewardSelect({
  shopify,
  shopDomain,
  balance,
  setBalance,
  applyDiscountCodeChange,
}: RewardSelectProps) {
  const [rewards, setRewards] = useState<CheckoutReward[]>([]);
  const [selectedRewardId, setSelectedRewardId] = useState<string>("");
  const [appliedCode, setAppliedCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shopDomain) return;
    shopify.sessionToken.get().then((token: string) => {
      fetchRewards(shopDomain, token).then((all) => {
        setRewards(all);
        setIsLoading(false);
      });
    });
  }, [shopDomain]);

  const selectedReward = rewards.find((r) => r.id === selectedRewardId) ?? null;

  const getDiscountLabel = (reward: CheckoutReward) => {
    if (reward.discountType === "percentage") return `${reward.discountValue}% off`;
    if (reward.discountType === "fixed_amount") return `${(reward.discountValue / 100).toFixed(2)}€ off`;
    if (reward.discountType === "free_shipping") return "Free shipping";
    return "";
  };

  async function handleApply() {
    if (!selectedReward) return;
    setError("");
    setIsApplying(true);
    try {
      const token = await shopify.sessionToken.get();
      const result = await redeemRewardAtCheckout(shopDomain, selectedReward.id, token);
      if (!result.success || !result.discountCode) {
        setError(result.error || shopify.i18n.translate("errors.errorChangePoints"));
        setTimeout(() => setError(""), 5000);
        return;
      }

      const applyResult = await applyDiscountCodeChange({
        type: "addDiscountCode",
        code: result.discountCode,
      });

      if (applyResult?.type === "error") {
        setError(shopify.i18n.translate("errors.errorChangePoints"));
        setTimeout(() => setError(""), 5000);
        return;
      }

      setAppliedCode(result.discountCode);
      if (result.newBalance !== undefined) setBalance(result.newBalance);
    } finally {
      setIsApplying(false);
    }
  }

  async function handleCancel() {
    if (!appliedCode) return;
    setError("");
    setIsCancelling(true);
    try {
      await applyDiscountCodeChange({
        type: "removeDiscountCode",
        code: appliedCode,
      });
      setAppliedCode("");
      setSelectedRewardId("");
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <s-text tone="neutral">{shopify.i18n.translate("loadingRewards")}</s-text>
    );
  }

  if (rewards.length === 0) {
    return (
      <s-text tone="neutral">{shopify.i18n.translate("noRewardsConfigured")}</s-text>
    );
  }

  return (
    <s-stack gap="base">
      <s-text type="strong">{shopify.i18n.translate("selectReward")}</s-text>

      {appliedCode ? (
        <s-banner tone="success">
          <s-text>
            {shopify.i18n.translate("rewardApplied")}: {appliedCode}
          </s-text>
        </s-banner>
      ) : (
        <s-select
          label={shopify.i18n.translate("selectReward")}
          value={selectedRewardId}
          onChange={(e: any) => setSelectedRewardId(e?.detail?.value ?? e?.target?.value ?? "")}
        >
          <s-option value="">{shopify.i18n.translate("selectReward")}</s-option>
          {rewards.map((r) => {
            const canAfford = r.pointsCost <= balance;
            return (
              <s-option key={r.id} value={r.id} disabled={!canAfford}>
                {r.name} — {getDiscountLabel(r)} ({r.pointsCost} {shopify.i18n.translate("points")}{!canAfford ? ` — ${shopify.i18n.translate("notEnoughPoints")}` : ""})
              </s-option>
            );
          })}
        </s-select>
      )}

      {error && (
        <s-banner tone="critical">
          <s-text>{error}</s-text>
        </s-banner>
      )}

      <s-grid gridTemplateColumns="170px 170px">
        {!appliedCode && (
          <s-button
            variant="primary"
            tone="neutral"
            loading={isApplying}
            disabled={!selectedRewardId || isApplying || (selectedReward !== null && selectedReward.pointsCost > balance)}
            onClick={handleApply}
          >
            {shopify.i18n.translate("applyReward")}
          </s-button>
        )}
        {appliedCode && (
          <s-button
            variant="primary"
            tone="neutral"
            loading={isCancelling}
            onClick={handleCancel}
          >
            {shopify.i18n.translate("cancelReward")}
          </s-button>
        )}
      </s-grid>
    </s-stack>
  );
}
