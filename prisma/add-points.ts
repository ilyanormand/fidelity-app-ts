/**
 * Quick script to add points to a customer by email
 * 
 * Usage:
 *   npx tsx prisma/add-points.ts <email> <points> [reason]
 * 
 * Examples:
 *   npx tsx prisma/add-points.ts ilya@1-tn.com 500 manual_bonus
 *   npx tsx prisma/add-points.ts ilya@1-tn.com -200 correction
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const points = parseInt(process.argv[3]);
  const reason = process.argv[4] || "manual_adjustment";

  if (!email || isNaN(points)) {
    console.error("Usage: npx tsx prisma/add-points.ts <email> <points> [reason]");
    console.error("Example: npx tsx prisma/add-points.ts ilya@1-tn.com 500 manual_bonus");
    process.exit(1);
  }

  // 1. Find customer by email
  let customer = await prisma.customer.findFirst({
    where: { email },
  });

  if (!customer) {
    // Try by shopifyCustomerId if email didn't match
    console.log(`⚠️  No customer found with email "${email}"`);
    console.log("Searching all customers...\n");

    const allCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        shopifyCustomerId: true,
        currentBalance: true,
        shopId: true,
      },
    });

    if (allCustomers.length === 0) {
      console.log("❌ No customers in database. Run 'npx prisma db seed' first.");
      process.exit(1);
    }

    console.log("Available customers:");
    allCustomers.forEach((c) => {
      console.log(
        `  - ${c.email || "(no email)"} | ${c.firstName || ""} ${c.lastName || ""} | Balance: ${c.currentBalance} | Shopify ID: ${c.shopifyCustomerId}`
      );
    });
    process.exit(1);
  }

  console.log(`\n👤 Customer found:`);
  console.log(`   Email: ${customer.email}`);
  console.log(`   Name: ${customer.firstName || ""} ${customer.lastName || ""}`);
  console.log(`   Shopify ID: ${customer.shopifyCustomerId}`);
  console.log(`   Current Balance: ${customer.currentBalance} points`);

  // 2. Add points via ledger + update balance in transaction
  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.ledger.create({
      data: {
        customerId: customer.id,
        amount: points,
        reason,
        metadata: { source: "manual_script", addedBy: "admin" },
      },
    });

    const updatedCustomer = await tx.customer.update({
      where: { id: customer.id },
      data: {
        currentBalance: { increment: points },
      },
    });

    return { entry, updatedCustomer };
  });

  console.log(`\n✅ ${points > 0 ? "Added" : "Deducted"} ${Math.abs(points)} points`);
  console.log(`   Reason: ${reason}`);
  console.log(`   New Balance: ${result.updatedCustomer.currentBalance} points`);
  console.log(`   Ledger Entry ID: ${result.entry.id}`);
  console.log(
    `\n⚠️  Note: Shopify metafield NOT synced. To sync, use the admin UI or run:`
  );
  console.log(
    `   The balance will auto-sync next time the customer visits checkout.`
  );
}

main()
  .catch((e) => {
    console.error("❌ Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
