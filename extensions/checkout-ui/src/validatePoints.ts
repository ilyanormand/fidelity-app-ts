export interface RewardItem {
  id: string;
  pointsCost: number;
  quantity: number;
}

export function validatePointsBalance(
  userBalance: number,
  rewards: RewardItem[],
) {
  const totalCost = rewards.reduce(
    (sum, r) => sum + r.pointsCost * (r.quantity ?? 1),
    0,
  );

  const isEnough = userBalance >= totalCost;

  return {
    isEnough,
    totalCost,
    missing: isEnough ? 0 : totalCost - userBalance,
  };
}
