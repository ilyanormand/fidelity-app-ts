/**
 * Balance verification and auto-correction utilities
 */
import prisma from "../db.server";
import { syncBalanceToShopify } from "./metafields.server";

/**
 * Verify a customer's balance matches their ledger
 * Auto-corrects if mismatch is found
 */
export async function verifyCustomerBalance(
  customerId: string,
  admin?: any
): Promise<{
  verified: boolean;
  storedBalance: number;
  calculatedBalance: number;
  corrected: boolean;
}> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { ledgerEntries: { select: { amount: true } } },
  });

  if (!customer) {
    throw new Error("Customer not found");
  }

  // Calculate actual balance from ledger (source of truth)
  const calculatedBalance = customer.ledgerEntries.reduce(
    (sum, entry) => sum + entry.amount,
    0
  );

  const storedBalance = customer.currentBalance || 0;
  const verified = calculatedBalance === storedBalance;

  // Auto-correct if mismatch
  if (!verified) {
    console.warn(`Balance mismatch for customer ${customerId}:`, {
      stored: storedBalance,
      calculated: calculatedBalance,
      difference: calculatedBalance - storedBalance,
    });

    await prisma.customer.update({
      where: { id: customerId },
      data: { currentBalance: calculatedBalance },
    });

    // Sync to Shopify if admin context available
    if (admin && customer.shopifyCustomerId) {
      await syncBalanceToShopify(admin, customer.shopifyCustomerId, calculatedBalance);
    }

    return {
      verified: false,
      storedBalance,
      calculatedBalance,
      corrected: true,
    };
  }

  return {
    verified: true,
    storedBalance,
    calculatedBalance,
    corrected: false,
  };
}

/**
 * Verify all customers' balances
 * Returns list of customers that had discrepancies
 */
export async function verifyAllBalances(admin?: any): Promise<{
  total: number;
  verified: number;
  corrected: number;
  discrepancies: any[];
}> {
  const customers = await prisma.customer.findMany({
    include: { ledgerEntries: { select: { amount: true } } },
  });

  let verified = 0;
  let corrected = 0;
  const discrepancies = [];

  for (const customer of customers) {
    const result = await verifyCustomerBalance(customer.id, admin);

    if (result.verified) {
      verified++;
    } else {
      corrected++;
      discrepancies.push({
        customerId: customer.id,
        shopifyCustomerId: customer.shopifyCustomerId,
        stored: result.storedBalance,
        calculated: result.calculatedBalance,
        difference: result.calculatedBalance - result.storedBalance,
      });
    }
  }

  return {
    total: customers.length,
    verified,
    corrected,
    discrepancies,
  };
}

