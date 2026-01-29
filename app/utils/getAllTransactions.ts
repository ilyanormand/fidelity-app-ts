import prisma from "../db.server";
import { format } from "date-fns";

export const getAllTransactions = async (shopId?: string) => {
  const ledgerEntries = await prisma.ledger.findMany({
    include: {
      customer: {
        select: {
          id: true,
          shopifyCustomerId: true,
          shopId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return ledgerEntries.map((entry) => {
    // Map reason to operation type
    let operation: string;
    switch (entry.reason) {
      case "purchase":
        operation = "Automatic";
        break;
      case "signup_bonus":
      case "birthday_bonus":
      case "referral_bonus":
        operation = "Promotion";
        break;
      case "redemption":
        operation = "Spend";
        break;
      case "redemption_refund":
        operation = "Refund";
        break;
      case "manual_adjustment":
        operation = "Manual";
        break;
      default:
        operation = entry.amount >= 0 ? "Earn" : "Spend";
    }

    const direction = entry.amount >= 0 ? "credit" : "debit";

    // Format timestamp
    const timestamp = entry.createdAt
      ? format(new Date(entry.createdAt), "yyyy-MM-dd HH:mm:ss")
      : "Unknown";

    // Customer name
    const customerName = entry.customer
      ? `Customer ${entry.customer.shopifyCustomerId.slice(-4)}`
      : "Unknown";

    // Shopify order - convert BigInt to string
    const shopifyOrder = entry.shopifyOrderId
      ? `#${entry.shopifyOrderId.toString()}`
      : "—";

    // Extract notes from metadata or use reason
    const metadata = entry.metadata as Record<string, unknown> | null;
    const notes =
      (metadata?.note as string) ||
      (metadata?.campaign as string) ||
      entry.reason.replace(/_/g, " ");

    return {
      id: entry.id,
      timestamp,
      customer: customerName,
      customerId: entry.customer?.id,
      operation,
      amount: entry.amount,
      direction,
      shopifyOrder,
      status: "Processed" as const, // In real app, this would track actual sync status
      notes,
    };
  });
};
