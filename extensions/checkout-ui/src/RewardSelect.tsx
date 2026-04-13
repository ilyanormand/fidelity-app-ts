import { useState, useEffect } from "preact/hooks";
import { fetchRewards, redeemRewardAtCheckout, CheckoutReward } from "./utils";

interface RewardSelectProps {
  shopify: any;
  shopDomain: string;
  balance: number;
  setBalance: (balance: number) => void;
  applyDiscountCodeChange: (change: any) => Promise<any>;
  settings?: Record<string, any>;
}

export default function RewardSelect({
  shopify,
  shopDomain,
  balance,
  setBalance,
  applyDiscountCodeChange,
  settings: s = {},
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

  const selectLabel = s.select_reward_label || shopify.i18n.translate("selectReward");
  const applyLabel = s.apply_reward_button || shopify.i18n.translate("applyReward");
  const cancelLabel = s.cancel_reward_button || shopify.i18n.translate("cancelReward");
  const appliedLabel = s.reward_applied_text || shopify.i18n.translate("rewardApplied");
  const loadingLabel = s.loading_rewards_text || shopify.i18n.translate("loadingRewards");
  const noRewardsLabel = s.no_rewards_text || shopify.i18n.translate("noRewardsConfigured");
  const notEnoughLabel = s.not_enough_points_text || shopify.i18n.translate("notEnoughPoints");
  const pointsLabel = s.points_label || shopify.i18n.translate("points");

  if (isLoading) {
    return <s-text tone="neutral">{loadingLabel}</s-text>;
  }

  if (rewards.length === 0) {
    return <s-text tone="neutral">{noRewardsLabel}</s-text>;
  }

  return (
    <s-stack gap="base">
      <s-text type="strong">{selectLabel}</s-text>

      {appliedCode ? (
        <s-banner tone="success">
          <s-text>
            {appliedLabel}: {appliedCode}
          </s-text>
        </s-banner>
      ) : (
        <s-select
          label={selectLabel}
          value={selectedRewardId}
          onChange={(e: any) => setSelectedRewardId(e?.detail?.value ?? e?.target?.value ?? "")}
        >
          <s-option value="">{selectLabel}</s-option>
          {rewards.map((r) => {
            const canAfford = r.pointsCost <= balance;
            return (
              <s-option key={r.id} value={r.id} disabled={!canAfford}>
                {r.name} — {getDiscountLabel(r)} ({r.pointsCost} {pointsLabel}{!canAfford ? ` — ${notEnoughLabel}` : ""})
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
            {applyLabel}
          </s-button>
        )}
        {appliedCode && (
          <s-button
            variant="primary"
            tone="neutral"
            loading={isCancelling}
            onClick={handleCancel}
          >
            {cancelLabel}
          </s-button>
        )}
      </s-grid>
    </s-stack>
  );
}
