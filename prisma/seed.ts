import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Clear existing data
  await prisma.redemption.deleteMany();
  await prisma.ledger.deleteMany();
  await prisma.customer.deleteMany();
  console.log("✓ Cleared existing data");

  // Create test customers
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        shopifyCustomerId: "7891234567890",
        shopId: "my-test-shop.myshopify.com",
        currentBalance: 1500,
        customerTags: ["VIP", "Early Adopter"],
      },
    }),
    prisma.customer.create({
      data: {
        shopifyCustomerId: "7891234567891",
        shopId: "my-test-shop.myshopify.com",
        currentBalance: 750,
        customerTags: ["Regular"],
      },
    }),
    prisma.customer.create({
      data: {
        shopifyCustomerId: "7891234567892",
        shopId: "my-test-shop.myshopify.com",
        currentBalance: 3200,
        customerTags: ["VIP", "Ambassador"],
      },
    }),
    prisma.customer.create({
      data: {
        shopifyCustomerId: "7891234567893",
        shopId: "my-test-shop.myshopify.com",
        currentBalance: 200,
        customerTags: [],
      },
    }),
    prisma.customer.create({
      data: {
        shopifyCustomerId: "7891234567894",
        shopId: "my-test-shop.myshopify.com",
        currentBalance: 5000,
        customerTags: ["VIP", "Influencer", "Top Spender"],
      },
    }),
  ]);

  console.log(`✓ Created ${customers.length} customers`);

  // Create ledger entries (points transactions)
  const ledgerEntries = [];

  for (const customer of customers) {
    // Purchase rewards
    const purchaseCount = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < purchaseCount; i++) {
      const points = Math.floor(Math.random() * 500) + 50;
      const daysAgo = Math.floor(Math.random() * 90);
      
      ledgerEntries.push(
        prisma.ledger.create({
          data: {
            customerId: customer.id,
            amount: points,
            reason: "purchase",
            externalId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            shopifyOrderId: BigInt(Math.floor(Math.random() * 9000000000000) + 1000000000000),
            metadata: {
              orderTotal: (points * 0.1).toFixed(2),
              currency: "EUR",
            },
            createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          },
        })
      );
    }

    // Signup bonus
    ledgerEntries.push(
      prisma.ledger.create({
        data: {
          customerId: customer.id,
          amount: 100,
          reason: "signup_bonus",
          metadata: { source: "welcome_campaign" },
          createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        },
      })
    );

    // Birthday bonus (random)
    if (Math.random() > 0.5) {
      ledgerEntries.push(
        prisma.ledger.create({
          data: {
            customerId: customer.id,
            amount: 200,
            reason: "birthday_bonus",
            metadata: { campaign: "birthday_2024" },
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000),
          },
        })
      );
    }

    // Referral bonus (random)
    if (Math.random() > 0.7) {
      ledgerEntries.push(
        prisma.ledger.create({
          data: {
            customerId: customer.id,
            amount: 500,
            reason: "referral_bonus",
            externalId: `ref_${Math.random().toString(36).substr(2, 9)}`,
            metadata: { 
              referredCustomerId: `cust_${Math.random().toString(36).substr(2, 9)}`,
              campaign: "refer_a_friend"
            },
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
          },
        })
      );
    }

    // Points spent (negative entries)
    if (customer.currentBalance < 3000 && Math.random() > 0.3) {
      const spentPoints = Math.floor(Math.random() * 300) + 100;
      ledgerEntries.push(
        prisma.ledger.create({
          data: {
            customerId: customer.id,
            amount: -spentPoints,
            reason: "redemption",
            metadata: { rewardType: "discount" },
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 20) * 24 * 60 * 60 * 1000),
          },
        })
      );
    }
  }

  await Promise.all(ledgerEntries);
  console.log(`✓ Created ${ledgerEntries.length} ledger entries`);

  // Create redemptions
  const redemptions = [];
  const rewardTypes = [
    { id: randomUUID(), name: "5% Discount", points: 200 },
    { id: randomUUID(), name: "10% Discount", points: 400 },
    { id: randomUUID(), name: "Free Shipping", points: 150 },
    { id: randomUUID(), name: "€20 Off", points: 800 },
    { id: randomUUID(), name: "€50 Off", points: 1800 },
  ];

  for (const customer of customers) {
    const redemptionCount = Math.floor(Math.random() * 3);
    
    for (let i = 0; i < redemptionCount; i++) {
      const reward = rewardTypes[Math.floor(Math.random() * rewardTypes.length)];
      const daysAgo = Math.floor(Math.random() * 60);
      
      redemptions.push(
        prisma.redemption.create({
          data: {
            customerId: customer.id,
            rewardId: reward.id,
            shopifyDiscountCode: `LOYAL${customer.shopifyCustomerId.slice(-4)}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            pointsSpent: reward.points,
            createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          },
        })
      );
    }
  }

  await Promise.all(redemptions);
  console.log(`✓ Created ${redemptions.length} redemptions`);

  // Print summary
  console.log("\n📊 Database Summary:");
  console.log(`   Customers: ${await prisma.customer.count()}`);
  console.log(`   Ledger entries: ${await prisma.ledger.count()}`);
  console.log(`   Redemptions: ${await prisma.redemption.count()}`);
  
  const totalPoints = await prisma.ledger.aggregate({
    _sum: { amount: true },
  });
  console.log(`   Total points issued: ${totalPoints._sum.amount}`);

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

