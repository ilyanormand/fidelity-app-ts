import prisma from "../db.server";

export const getDataCustomer = async (shopifyCustomerId: string) => {
  // Find customer by shopifyCustomerId
  const customer = await prisma.customer.findFirst({
    where: { shopifyCustomerId },
    include: {
      ledgerEntries: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      redemptions: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!customer) {
    return null;
  }

  // Map ledger entries to the expected format
  const ledger = customer.ledgerEntries.map((entry) => {
    // Determine type based on reason
    let type: string;
    let direction: "credit" | "debit";

    if (entry.amount >= 0) {
      direction = "credit";
    } else {
      direction = "debit";
    }

    switch (entry.reason) {
      case "purchase":
        type = "Automatic";
        break;
      case "signup_bonus":
      case "birthday_bonus":
      case "referral_bonus":
        type = "Credit";
        break;
      case "redemption":
        type = "Debit";
        break;
      case "redemption_refund":
        type = "Refund";
        break;
      case "manual_adjustment":
        type = "Manual";
        break;
      case "expiration":
        type = "Expired";
        break;
      default:
        type = entry.amount >= 0 ? "Credit" : "Debit";
    }

    return {
      id: entry.id,
      points: Math.abs(entry.amount),
      type,
      direction,
      createdAt: entry.createdAt?.toISOString() || new Date().toISOString(),
      orderId: entry.shopifyOrderId ? `#${entry.shopifyOrderId.toString()}` : null,
      notes: entry.reason.replace(/_/g, " "),
    };
  });

  // Calculate totals
  const totalEarned = customer.ledgerEntries
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);

  const totalSpent = Math.abs(
    customer.ledgerEntries
      .filter((e) => e.amount < 0)
      .reduce((sum, e) => sum + e.amount, 0)
  );

  // Parse customer name from shopifyCustomerId or use default
  const nameParts = customer.shopifyCustomerId.split("_");
  const name = nameParts.length > 1 ? nameParts[1] : "Customer";
  const secondName = `ID-${customer.shopifyCustomerId.slice(-4)}`;

  return {
    id: customer.id,
    name,
    secondName,
    email: `customer_${customer.shopifyCustomerId.slice(-6)}@example.com`,
    shopifyId: customer.shopifyCustomerId,
    createdAt: customer.updatedAt?.toISOString() || null,
    balancePointsTotal: customer.currentBalance || 0,
    balance: (customer.currentBalance || 0) * 0.01, // Assuming 1 point = €0.01
    lastUpdate: customer.updatedAt?.toISOString() || null,
    currencyCode: "EUR",
    totalEarned,
    totalSpent,
    customerTags: customer.customerTags,
    ledger,
  };
};
