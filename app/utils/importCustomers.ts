import prisma from "../db.server";
import { syncBalanceToShopify } from "./metafields.server";

export const importAllCustomers = async (
  admin: any,
  shopId: string,
  syncMetafields: boolean = true
) => {
  let hasNextPage = true;
  let cursor = null;
  let importedCount = 0;
  let metafieldsSynced = 0;

  console.log(`🔄 Starting customer import for shop ${shopId}`);

  while (hasNextPage) {
    const query = `
      query getCustomers($cursor: String) {
        customers(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              email
              firstName
              lastName
              displayName
              tags
              state
              metafield(namespace: "loyalty", key: "points_balance") {
                value
              }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { cursor },
    });

    const data: any = await response.json();
    const customers = data.data.customers.edges;

    for (const { node: customer } of customers) {
      const metafieldBalance = customer.metafield?.value
        ? parseInt(customer.metafield.value)
        : null;

      // Upsert customer into Prisma
      const existing = await prisma.customer.findUnique({
        where: {
          shopifyCustomerId_shopId: {
            shopifyCustomerId: customer.id,
            shopId: shopId,
          },
        },
      });

      const prismaCustomer = await prisma.customer.upsert({
        where: {
          shopifyCustomerId_shopId: {
            shopifyCustomerId: customer.id,
            shopId: shopId,
          },
        },
        create: {
          shopifyCustomerId: customer.id,
          shopId,
          // If Shopify metafield has a balance, use it; otherwise start at 0
          currentBalance: metafieldBalance ?? 0,
          customerTags: customer.tags ?? [],
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          displayName: customer.displayName,
        },
        update: {
          customerTags: customer.tags ?? [],
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          displayName: customer.displayName,
        },
      });

      // Sync metafield if needed: Prisma balance is the source of truth
      if (syncMetafields) {
        const prismaBalance = prismaCustomer.currentBalance ?? 0;

        if (metafieldBalance !== prismaBalance) {
          try {
            await syncBalanceToShopify(admin, customer.id, prismaBalance);
            metafieldsSynced++;
          } catch (e) {
            console.warn(`⚠️ Failed to sync metafield for ${customer.email || customer.id}:`, e);
          }
        }
      }

      importedCount++;
    }

    hasNextPage = data.data.customers.pageInfo.hasNextPage;
    cursor = data.data.customers.pageInfo.endCursor;

    // Safety delay to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`✅ Imported ${importedCount} customers for shop ${shopId}`);
  if (syncMetafields) {
    console.log(`✅ Synced ${metafieldsSynced} metafields`);
  }

  return { importedCount, metafieldsSynced };
};
