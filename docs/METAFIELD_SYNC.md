# Metafield Sync System

This document explains the customer balance metafield sync system.

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│  PostgreSQL (Source of Truth)  │
│  - customers.currentBalance     │
│  - ledger (audit trail)         │
└─────────────────────────────────┘
           ↓
  ┌─────────────────┐
  │  Auto-Sync      │
  │  (on changes)   │
  └─────────────────┘
           ↓
┌─────────────────────────────────┐
│  Shopify Customer Metafield     │
│  namespace: "loyalty"           │
│  key: "points_balance"          │
│  type: number_integer           │
└─────────────────────────────────┘
           ↓
  ┌──────────────────────┐
  │  Checkout Extension  │
  │  (reads metafield)   │
  └──────────────────────┘
```

---

## 🔄 How It Works

### 1. Metafield Creation

**When:** 
- App installation
- User visits dashboard (`/app`)

**What happens:**
```typescript
await ensureLoyaltyMetafields(admin);
// Creates customer metafield definition if doesn't exist
// If exists, skips silently
```

**Metafield Definition:**
- **Namespace:** `loyalty`
- **Key:** `points_balance`
- **Type:** `number_integer`
- **Owner:** Customer

---

### 2. Balance Updates

When points are added/deducted:

```typescript
// 1. Update database (in transaction)
await prisma.$transaction(async (tx) => {
  await tx.ledger.create({ amount: 100 });
  await tx.customer.update({ 
    data: { currentBalance: { increment: 100 } }
  });
});

// 2. Optionally sync to Shopify
await syncBalanceToShopify(admin, customerId, newBalance);
```

**When sync happens:**
- ✅ Manual point adjustments from admin panel (`syncToShopify: true`)
- ✅ Background sync job (periodic)
- ❌ NOT on every transaction (too slow)

---

## 📍 API Endpoints

### Sync Single Customer

```bash
GET /api/sync-balances?customerId=<uuid>
```

**Response:**
```json
{
  "message": "Customer synced",
  "customerId": "uuid",
  "balance": 1500,
  "synced": true
}
```

---

### Sync All Customers

```bash
GET /api/sync-balances
```

**Response:**
```json
{
  "message": "Sync complete",
  "total": 150,
  "synced": 148,
  "errors": 2,
  "failedSyncs": [...]
}
```

---

### Verify All Balances

```bash
GET /api/sync-balances?verify=true
```

**What it does:**
1. Recalculates each customer's balance from ledger
2. Compares with stored `currentBalance`
3. Auto-corrects any discrepancies
4. Syncs correct balance to Shopify

**Response:**
```json
{
  "message": "Balance verification complete",
  "total": 150,
  "verified": 145,
  "corrected": 5,
  "discrepancies": [
    {
      "customerId": "uuid",
      "shopifyCustomerId": "123456",
      "stored": 1000,
      "calculated": 1050,
      "difference": 50
    }
  ]
}
```

---

## 🛡️ Security Measures

### 1. Database Transactions ✅

All balance changes use transactions:

```typescript
await prisma.$transaction(async (tx) => {
  await tx.ledger.create({...});
  await tx.customer.update({...});
});
```

**Guarantees:** Both operations succeed together or fail together.

---

### 2. Balance Verification ✅

```typescript
const verification = await verifyCustomerBalance(customerId);

if (!verification.verified) {
  console.warn("Balance corrected", {
    stored: verification.storedBalance,
    calculated: verification.calculatedBalance
  });
}
```

**Runs:** Background job, on-demand

---

### 3. Ledger Audit Trail ✅

Every point change is logged:

```typescript
{
  id: "uuid",
  customerId: "uuid",
  amount: 100,
  reason: "purchase",
  externalId: "order_123",
  metadata: { orderId: "123" },
  createdAt: "2025-01-05"
}
```

**Benefit:** Can recalculate balance from scratch at any time.

---

### 4. Idempotency (Recommended)

Update schema to prevent duplicate transactions:

```prisma
model Ledger {
  // ... existing fields
  
  @@unique([externalId, customerId])
  @@index([externalId, reason])
}
```

Then in your API:

```typescript
// Check if transaction already exists
const existing = await prisma.ledger.findFirst({
  where: {
    externalId: shopifyOrderId,
    customerId,
  },
});

if (existing) {
  return Response.json({
    message: "Transaction already processed",
    entry: existing,
  });
}
```

---

## 📅 Background Sync Schedule

Set up a cron job or scheduled task:

### Using Shopify Flow (No Code)

Not available for this, but you can trigger via webhook.

### Using External Cron Service

**Services:**
- https://cron-job.org
- https://easycron.com
- GitHub Actions (scheduled workflow)

**Trigger:**
```
GET https://your-app.fly.dev/api/sync-balances?verify=true
```

**Frequency:** Every 1-6 hours

---

### Using Fly.io Machines (Recommended)

Create a scheduled task in Fly:

```bash
# fly.toml
[processes]
  web = "npm run start"
  sync = "node scripts/sync-cron.js"

[[services]]
  processes = ["web"]
  # ... web config

[[vm]]
  processes = ["sync"]
  schedule = "0 */6 * * *"  # Every 6 hours
```

**Script** (`scripts/sync-cron.js`):
```javascript
async function syncJob() {
  const response = await fetch(
    `${process.env.APP_URL}/api/sync-balances?verify=true`
  );
  const data = await response.json();
  console.log("Sync complete:", data);
}

syncJob().catch(console.error);
```

---

## 🧪 Testing

### Test Metafield Creation

```bash
# Visit dashboard (triggers metafield creation)
curl http://localhost:3000/app

# Or call directly
curl http://localhost:3000/api/sync-balances?customerId=<uuid>
```

### Test Balance Sync

```bash
# Sync all customers
curl http://localhost:3000/api/sync-balances

# Verify balances
curl "http://localhost:3000/api/sync-balances?verify=true"
```

### Check in Shopify Admin

1. Go to Customers → Pick a customer
2. Scroll to **Metafields**
3. Look for `loyalty.points_balance`

---

## 📊 Benefits of This Approach

| Feature | Benefit |
|---------|---------|
| **DB as source of truth** | Fast, reliable, no API limits |
| **Async Shopify sync** | Non-blocking, doesn't slow operations |
| **Auto-verification** | Catches and fixes discrepancies |
| **Checkout extension** | Shows balance without API calls |
| **Admin visibility** | See balance in Shopify admin |

---

## ⚠️ Important Notes

1. **Metafield is NOT source of truth** - Database is. Metafield is a mirror.
2. **Sync can lag** - Background sync may take minutes
3. **Checkout shows stale data** - Metafield updated async
4. **For real-time balance** - Use app proxy in storefront

---

## 🚀 Deployment

After implementing:

```bash
# Test locally
npm run dev

# Deploy
fly deploy

# Run initial sync
curl https://your-app.fly.dev/api/sync-balances?verify=true
```

All customer balances will be synced to Shopify metafields!

