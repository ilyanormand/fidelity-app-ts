import prisma from "../db.server";

export const getCustomers = async (shopId: string) => {
  const customers = await prisma.customer.findMany({
    where: { shopId },
    include: {
      ledgerEntries: {
        select: {
          amount: true,
        },
      },
      redemptions: {
        select: {
          pointsSpent: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return customers.map((customer) => {
    // Calculate total earned (positive amounts)
    const totalEarned = customer.ledgerEntries
      .filter((entry) => entry.amount > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);

    // Calculate total spent (negative amounts + redemptions)
    const totalSpent =
      Math.abs(
        customer.ledgerEntries
          .filter((entry) => entry.amount < 0)
          .reduce((sum, entry) => sum + entry.amount, 0)
      ) + customer.redemptions.reduce((sum, r) => sum + r.pointsSpent, 0);

    // Determine sync status based on balance consistency
    const calculatedBalance = totalEarned - totalSpent;
    const actualBalance = customer.currentBalance || 0;
    
    let status: "synced" | "pending" | "error";
    if (Math.abs(calculatedBalance - actualBalance) < 1) {
      status = "synced";
    } else if (Math.abs(calculatedBalance - actualBalance) < 100) {
      status = "pending";
    } else {
      status = "error";
    }

    return {
      id: customer.id,
      shopifyCustomerId: customer.shopifyCustomerId,
      name: `Customer ${customer.shopifyCustomerId.slice(-4)}`,
      email: `customer_${customer.shopifyCustomerId.slice(-6)}@example.com`,
      createdAt: customer.updatedAt?.toISOString() || null,
      totalEarned,
      totalSpent,
      shopifyBalance: actualBalance, // In real app, this would come from Shopify metafield
      currentBalance: actualBalance,
      status,
      customerTags: customer.customerTags,
    };
  });
};
