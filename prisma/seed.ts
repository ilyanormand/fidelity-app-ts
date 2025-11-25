import { PrismaClient } from "@prisma/client";
import { subDays, subHours } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Начинаем заполнение базы данных...");

  // Очищаем существующие данные
  console.log("🧹 Очистка существующих данных...");
  await prisma.redemption.deleteMany();
  await prisma.ledger.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.customer.deleteMany();

  const shopId = "test-shop.myshopify.com";

  // Создаем клиентов
  console.log("👥 Создание клиентов...");
  const customers = [];
  for (let i = 1; i <= 60; i++) {
    const customer = await prisma.customer.create({
      data: {
        shopifyCustomerId: `gid://shopify/Customer/${1000 + i}`,
      },
    });
    customers.push(customer);
  }

  console.log(`✅ Создано ${customers.length} клиентов`);

  // Создаем награды
  console.log("🎁 Создание наград...");
  const rewards = await Promise.all([
    prisma.reward.create({
      data: {
        title: "Скидка 10%",
        points_cost: 100,
        discount_amount: 10.0,
        min_purchase: 50.0,
        description: "Получите скидку 10% на покупку от 50$",
        active: true,
      },
    }),
    prisma.reward.create({
      data: {
        title: "Скидка 20%",
        points_cost: 200,
        discount_amount: 20.0,
        min_purchase: 100.0,
        description: "Получите скидку 20% на покупку от 100$",
        active: true,
      },
    }),
    prisma.reward.create({
      data: {
        title: "Бесплатная доставка",
        points_cost: 50,
        discount_amount: 0.0,
        min_purchase: 0.0,
        description: "Бесплатная доставка на любой заказ",
        active: true,
      },
    }),
    prisma.reward.create({
      data: {
        title: "Скидка 5%",
        points_cost: 50,
        discount_amount: 5.0,
        min_purchase: 25.0,
        description: "Получите скидку 5% на покупку от 25$",
        active: false, // Неактивная награда
      },
    }),
  ]);

  console.log(`✅ Создано ${rewards.length} наград`);

  // Создаем записи в Ledger с разными датами для тестирования статистики
  console.log("📊 Создание записей в Ledger...");
  const now = new Date();
  const ledgerEntries = [];
  const targetLedgerCount = 120;
  let ledgerCount = 0;

  // Для первых 10 клиентов - данные за последние 30 дней (по 2 записи на клиента)
  for (let customerIdx = 0; customerIdx < 10 && ledgerCount < targetLedgerCount; customerIdx++) {
    for (let dayOffset = 0; dayOffset < 2 && ledgerCount < targetLedgerCount; dayOffset++) {
      const date = subDays(now, dayOffset * 15);
      const points = Math.floor(Math.random() * 50) + 10; // 10-60 баллов
      ledgerEntries.push({
        customerId: customers[customerIdx].shopifyCustomerId,
        shopId,
        points,
        created_at: date,
      });
      ledgerCount++;
    }
  }

  // Для следующих 20 клиентов - данные за последние 7 дней (по 1 записи на клиента)
  for (let customerIdx = 10; customerIdx < 30 && ledgerCount < targetLedgerCount; customerIdx++) {
    const dayOffset = Math.floor(Math.random() * 7);
    const date = subDays(now, dayOffset);
    const points = Math.floor(Math.random() * 100) + 20; // 20-120 баллов
    ledgerEntries.push({
      customerId: customers[customerIdx].shopifyCustomerId,
      shopId,
      points,
      created_at: date,
    });
    ledgerCount++;
  }

  // Для следующих 10 клиентов - почасовые данные за последние 24 часа
  for (let customerIdx = 30; customerIdx < 40 && ledgerCount < targetLedgerCount; customerIdx++) {
    const hourOffset = Math.floor(Math.random() * 24);
    const date = subHours(now, hourOffset);
    const points = Math.floor(Math.random() * 30) + 5; // 5-35 баллов
    ledgerEntries.push({
      customerId: customers[customerIdx].shopifyCustomerId,
      shopId,
      points,
      created_at: date,
    });
    ledgerCount++;
  }

  // Для остальных клиентов - случайные записи с разными датами
  for (let customerIdx = 40; customerIdx < customers.length && ledgerCount < targetLedgerCount; customerIdx++) {
    const dayOffset = Math.floor(Math.random() * 60); // случайная дата за последние 60 дней
    const date = subDays(now, dayOffset);
    const points = Math.floor(Math.random() * 200) + 50; // 50-250 баллов
    ledgerEntries.push({
      customerId: customers[customerIdx].shopifyCustomerId,
      shopId,
      points,
      created_at: date,
    });
    ledgerCount++;
  }

  // Если еще не достигли 120 записей, добавляем дополнительные случайные записи
  while (ledgerCount < targetLedgerCount) {
    const randomCustomerIdx = Math.floor(Math.random() * customers.length);
    const dayOffset = Math.floor(Math.random() * 90); // случайная дата за последние 90 дней
    const date = subDays(now, dayOffset);
    const points = Math.floor(Math.random() * 150) + 10; // 10-160 баллов
    ledgerEntries.push({
      customerId: customers[randomCustomerIdx].shopifyCustomerId,
      shopId,
      points,
      created_at: date,
    });
    ledgerCount++;
  }

  await prisma.ledger.createMany({
    data: ledgerEntries,
  });

  console.log(`✅ Создано ${ledgerEntries.length} записей в Ledger`);

  // Создаем использования наград
  console.log("🎫 Создание использований наград...");
  const redemptions = await Promise.all([
    prisma.redemption.create({
      data: {
        customerId: customers[Math.floor(Math.random() * customers.length)].id,
        rewardId: rewards[0].id,
        points_spent: 100,
        discount_code: "DISCOUNT10-001",
        status: "active",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // через 30 дней
      },
    }),
    prisma.redemption.create({
      data: {
        customerId: customers[Math.floor(Math.random() * customers.length)].id,
        rewardId: rewards[2].id,
        points_spent: 50,
        discount_code: "FREESHIP-001",
        status: "used",
      },
    }),
    prisma.redemption.create({
      data: {
        customerId: customers[Math.floor(Math.random() * customers.length)].id,
        rewardId: rewards[1].id,
        points_spent: 200,
        discount_code: "DISCOUNT20-001",
        status: "active",
        expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // через 15 дней
      },
    }),
    prisma.redemption.create({
      data: {
        customerId: customers[Math.floor(Math.random() * customers.length)].id,
        rewardId: rewards[0].id,
        points_spent: 100,
        discount_code: "DISCOUNT10-002",
        status: "expired",
        expires_at: subDays(now, 1), // истекла вчера
      },
    }),
    prisma.redemption.create({
      data: {
        customerId: customers[Math.floor(Math.random() * customers.length)].id,
        rewardId: rewards[2].id,
        points_spent: 50,
        discount_code: "FREESHIP-002",
        status: "active",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // через 7 дней
      },
    }),
  ]);

  console.log(`✅ Создано ${redemptions.length} использований наград`);

  // Выводим статистику
  const totalLedgerEntries = await prisma.ledger.count();
  const totalPoints = await prisma.ledger.aggregate({
    _sum: {
      points: true,
    },
    where: {
      shopId,
    },
  });

  console.log("\n📈 Статистика:");
  console.log(`   Клиентов: ${customers.length}`);
  console.log(`   Наград: ${rewards.length}`);
  console.log(`   Записей в Ledger: ${totalLedgerEntries}`);
  console.log(`   Всего баллов: ${totalPoints._sum.points || 0}`);
  console.log(`   Использований наград: ${redemptions.length}`);

  console.log("\n✨ База данных успешно заполнена!");
}

main()
  .catch((e) => {
    console.error("❌ Ошибка при заполнении базы данных:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

