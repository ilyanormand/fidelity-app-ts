import prisma from "../db.server";

export const importAllCustomers = async (admin: any, shopId: string) => {
  let hasNextPage = true;
  let cursor = null;
  let importedCount = 0;

  console.log(`Starting customer import for shop ${shopId}`);

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
      await prisma.customer.upsert({
        where: {
          shopifyCustomerId_shopId: {
            shopifyCustomerId: customer.id,
            shopId: shopId,
          },
        },
        create: {
          shopifyCustomerId: customer.id,
          shopId,
          currentBalance: 0,
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
      importedCount++;
    }

    hasNextPage = data.data.customers.pageInfo.hasNextPage;
    cursor = data.data.customers.pageInfo.endCursor;

    // Safety delay to respect rate limits if processing is fast
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Finished importing ${importedCount} customers for shop ${shopId}`);
  return importedCount;
};
