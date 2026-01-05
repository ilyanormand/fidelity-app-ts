/**
 * Metafield utilities for syncing customer loyalty balance
 */

/**
 * Ensure the loyalty balance metafield definition exists
 */
export async function ensureLoyaltyMetafields(admin: any) {
  const query = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const definition = {
    name: "Loyalty Points Balance",
    namespace: "loyalty",
    key: "points_balance",
    description: "Customer's current loyalty points balance",
    type: "number_integer",
    ownerType: "CUSTOMER",
  };

  try {
    const response = await admin.graphql(query, {
      variables: { definition },
    });

    const data = await response.json();
    
    // Check if already exists (code: TAKEN)
    const errors = data.data?.metafieldDefinitionCreate?.userErrors || [];
    const alreadyExists = errors.some((e: any) => e.code === "TAKEN");

    if (alreadyExists) {
      console.log("✓ Metafield definition already exists");
      return { success: true, alreadyExists: true };
    }

    if (errors.length > 0) {
      console.error("Error creating metafield:", errors);
      return { success: false, errors };
    }

    console.log("✓ Created metafield definition:", data.data?.metafieldDefinitionCreate?.createdDefinition);
    return { success: true, created: true };
  } catch (error) {
    console.error("Failed to create metafield definition:", error);
    return { success: false, error };
  }
}

/**
 * Sync a single customer's balance to Shopify metafield
 */
export async function syncBalanceToShopify(
  admin: any,
  shopifyCustomerId: string,
  balance: number
): Promise<{ success: boolean; error?: any }> {
  const mutation = `
    mutation SetCustomerMetafield($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          metafields(first: 1, namespace: "loyalty", keys: ["points_balance"]) {
            edges {
              node {
                value
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const gid = `gid://shopify/Customer/${shopifyCustomerId}`;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        input: {
          id: gid,
          metafields: [
            {
              namespace: "loyalty",
              key: "points_balance",
              value: balance.toString(),
              type: "number_integer",
            },
          ],
        },
      },
    });

    const data = await response.json();
    const errors = data.data?.customerUpdate?.userErrors || [];

    if (errors.length > 0) {
      console.error("Error updating metafield:", errors);
      return { success: false, error: errors };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to sync balance to Shopify:", error);
    return { success: false, error };
  }
}

/**
 * Get customer balance from Shopify metafield
 */
export async function getBalanceFromShopify(
  admin: any,
  shopifyCustomerId: string
): Promise<number | null> {
  const query = `
    query GetCustomerBalance($id: ID!) {
      customer(id: $id) {
        metafield(namespace: "loyalty", key: "points_balance") {
          value
        }
      }
    }
  `;

  const gid = `gid://shopify/Customer/${shopifyCustomerId}`;

  try {
    const response = await admin.graphql(query, {
      variables: { id: gid },
    });

    const data = await response.json();
    const value = data.data?.customer?.metafield?.value;

    return value ? parseInt(value) : null;
  } catch (error) {
    console.error("Failed to get balance from Shopify:", error);
    return null;
  }
}

