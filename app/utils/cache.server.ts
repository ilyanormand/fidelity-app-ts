import { getRedis } from "./redis.server";

const BALANCE_TTL = 60; // seconds

function balanceKey(shopifyCustomerId: string, shop: string): string {
  return `balance:${shop}:${shopifyCustomerId}`;
}

export async function getCachedBalance(
  shopifyCustomerId: string,
  shop: string
): Promise<number | null> {
  try {
    const val = await getRedis().get(balanceKey(shopifyCustomerId, shop));
    return val !== null ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

export async function setCachedBalance(
  shopifyCustomerId: string,
  shop: string,
  balance: number,
  ttl: number = BALANCE_TTL
): Promise<void> {
  try {
    await getRedis().set(balanceKey(shopifyCustomerId, shop), balance.toString(), "EX", ttl);
  } catch {
    // Cache write failure is non-critical
  }
}

export async function invalidateBalance(
  shopifyCustomerId: string,
  shop: string
): Promise<void> {
  try {
    await getRedis().del(balanceKey(shopifyCustomerId, shop));
  } catch {
    // Cache invalidation failure is non-critical
  }
}
