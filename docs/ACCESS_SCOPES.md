# Access Scopes Configuration

This document explains all access scopes requested by the loyalty app and why each is needed.

Reference: [Shopify Access Scopes Documentation](https://shopify.dev/docs/api/usage/access-scopes)

---

## 📋 Configured Scopes

```toml
scopes = "write_customers,read_customers,write_discounts,read_discounts,read_orders,write_price_rules,write_app_proxy"
```

---

## 🔍 Scope Breakdown

### 1. `write_customers` ✅ CRITICAL

**What it allows:**
- Update customer metafields
- Create/update customer records
- Modify customer tags

**Why we need it:**
- ✅ Sync loyalty points balance to customer metafield
- ✅ Add loyalty program tags to customers
- ✅ Update customer profiles with loyalty data

**Used in:**
- `app/utils/metafields.server.ts` - Syncing balance
- Webhook handlers for customer events

**GraphQL Objects:**
- [Customer](https://shopify.dev/docs/api/admin-graphql/latest/objects/customer)
- [CustomerMetafield](https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerUpdate)

---

### 2. `read_customers` ✅ CRITICAL

**What it allows:**
- Read customer data
- Query customer metafields
- Access customer information

**Why we need it:**
- ✅ Retrieve customer data for loyalty program
- ✅ Check existing metafields
- ✅ Display customer information in admin panel

**Used in:**
- Customer list page
- Customer detail page
- Balance verification

---

### 3. `write_discounts` ✅ CRITICAL

**What it allows:**
- Create discount codes
- Modify existing discounts
- Delete discounts

**Why we need it:**
- ✅ Generate unique discount codes when customers redeem points
- ✅ Create automatic discounts for loyalty rewards
- ✅ Manage discount expiration

**Used in:**
- `app/routes/proxy.$.tsx` - Creating discount codes on redemption
- Reward redemption flow

**GraphQL Objects:**
- [DiscountNode](https://shopify.dev/docs/api/admin-graphql/latest/objects/DiscountNode)
- [DiscountCodeBasicCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/discountCodeBasicCreate)

**Example:**
```graphql
mutation {
  discountCodeBasicCreate(
    basicCodeDiscount: {
      title: "Loyalty Reward - $10 Off"
      code: "LOYAL7890_ABC123"
      startsAt: "2025-01-05T00:00:00Z"
      endsAt: "2025-02-05T23:59:59Z"
      customerSelection: {
        customers: {
          add: ["gid://shopify/Customer/123456"]
        }
      }
      minimumRequirement: {
        greaterThanOrEqualToSubtotal: {
          greaterThanOrEqualToSubtotal: "50.00"
        }
      }
      customerGets: {
        value: {
          discountAmount: {
            amount: 10.0
            appliesOnEachItem: false
          }
        }
        items: {
          all: true
        }
      }
    }
  ) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          codes(first: 1) {
            edges {
              node {
                code
              }
            }
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
```

---

### 4. `read_discounts` ✅ RECOMMENDED

**What it allows:**
- Query existing discounts
- Check discount usage
- Validate discount codes

**Why we need it:**
- ✅ Verify discount codes weren't already used
- ✅ Check discount status
- ✅ Display redemption history with discount details

---

### 5. `read_orders` ✅ CRITICAL

**What it allows:**
- Read order data
- Access order history
- Query order details

**Why we need it:**
- ✅ Award points when customers make purchases
- ✅ Track order totals for point calculations
- ✅ Link transactions to specific orders in ledger

**Used in:**
- Order webhook handlers
- Points calculation (e.g., 1 point per $1 spent)
- Transaction history

**Example Flow:**
```
1. Customer completes purchase
2. Webhook: orders/create
3. App reads order total: $100
4. Awards 100 points (creates ledger entry)
5. Updates customer balance
```

---

### 6. `write_price_rules` ⚠️ OPTIONAL

**What it allows:**
- Create price rules
- Manage automatic discounts

**Why we might need it:**
- Create automatic discounts for loyalty tiers
- Set up VIP customer pricing
- Create percentage-based loyalty discounts

**Note:** Can use `write_discounts` instead for most cases.

---

### 7. `write_app_proxy` ✅ CRITICAL

**What it allows:**
- Configure app proxy routes
- Handle storefront requests

**Why we need it:**
- ✅ Enable storefront widget to communicate with backend
- ✅ Fetch customer balance on storefront
- ✅ Redeem points from theme extension

**Used in:**
- `app/routes/proxy.$.tsx` - App proxy handler
- Theme extension communication

**Proxy Configuration:**
```toml
[app_proxy]
url = "/proxy"
prefix = "apps"
subpath = "loyalty"
```

---

## 📊 Optional/Future Scopes

### If you want to award points for specific actions:

```toml
# Customer engagement
read_customer_events    # Track customer activities

# Product reviews
read_product_listings   # Award points for reviews

# Draft orders
read_draft_orders       # Points for abandoned cart recovery

# Gift cards
read_gift_cards         # Integration with gift cards
```

---

## 🔒 Security Best Practices

### 1. Request Minimum Scopes

✅ **DO:** Only request scopes you actively use  
❌ **DON'T:** Request scopes "just in case"

**Why:** 
- Users see all requested scopes during install
- More scopes = less trust
- Shopify may reject apps with excessive scopes

---

### 2. Scope Justification

Be ready to explain each scope:

| Scope | Justification |
|-------|---------------|
| `write_customers` | "Sync loyalty points to customer metafield for checkout display" |
| `write_discounts` | "Generate discount codes when customers redeem points" |
| `read_orders` | "Award points based on purchase amount" |

---

### 3. Protected Data

For `read_customers` and `write_customers`, you're accessing:
- Customer names
- Customer IDs
- Customer metafields

**Compliance:**
- Must have privacy policy
- Must explain data usage
- Must comply with GDPR if serving EU

---

## 🚀 Deployment Checklist

### Before Deploy

- [x] Configure scopes in `shopify.app.toml`
- [ ] Test all features work with these scopes
- [ ] Document why each scope is needed
- [ ] Add privacy policy to app listing
- [ ] Test on dev store

### During Install

Users will see:

```
This app needs access to:
✓ Read customers
✓ Update customers
✓ Read orders
✓ Create discounts
✓ Read discounts
```

Make sure your app description explains WHY.

---

## 📝 Adding/Removing Scopes

### To Add New Scope

```bash
# 1. Update shopify.app.toml
scopes = "existing_scopes,new_scope"

# 2. Restart dev server
shopify app dev

# 3. Reinstall on dev store (scopes updated)

# 4. Test the new feature

# 5. Deploy
fly deploy
```

### To Remove Scope

Same process - edit `shopify.app.toml` and reinstall.

---

## ⚠️ Important Notes

1. **Changing scopes requires reinstallation** - Existing users must approve new scopes
2. **Can't downgrade automatically** - Removing scopes won't revoke existing installs
3. **Test on dev store first** - Always test scope changes before production
4. **Shopify reviews scope requests** - Excessive scopes may delay app approval

---

## 📚 Additional Resources

- [Access Scopes Documentation](https://shopify.dev/docs/api/usage/access-scopes)
- [App Authorization](https://shopify.dev/docs/apps/auth/oauth)
- [Protected Customer Data](https://shopify.dev/docs/apps/store/data-protection/protected-customer-data)

