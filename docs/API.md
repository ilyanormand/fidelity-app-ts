# Loyalty Program API Documentation

This document describes the test API endpoints for the loyalty program database.

## Base URL

```
http://localhost:3000
```

For Shopify embedded app:
```
https://<your-app-url>
```

---

## Authentication

These test endpoints do not require authentication. In production, ensure proper authentication is implemented.

---

## Endpoints

### 1. Customers API

#### GET `/api/customers`

Retrieve all customers or filter by shop.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `shopId` | string | No | Filter customers by shop domain |
| `id` | uuid | No | Get a specific customer by ID |

**Examples:**

```bash
# Get all customers
curl http://localhost:3000/api/customers

# Get customers for a specific shop
curl "http://localhost:3000/api/customers?shopId=my-store.myshopify.com"

# Get a specific customer with their ledger and redemptions
curl "http://localhost:3000/api/customers?id=123e4567-e89b-12d3-a456-426614174000"
```

**Response:**
```json
{
  "customers": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "shopifyCustomerId": "7891234567890",
      "shopId": "my-store.myshopify.com",
      "currentBalance": 1500,
      "customerTags": ["VIP", "Early Adopter"],
      "updatedAt": "2025-01-04T12:00:00.000Z",
      "_count": {
        "ledgerEntries": 15,
        "redemptions": 3
      }
    }
  ],
  "count": 1
}
```

---

#### POST `/api/customers`

Create a new customer.

**Request Body:**
```json
{
  "shopifyCustomerId": "7891234567890",
  "shopId": "my-store.myshopify.com",
  "currentBalance": 0,
  "customerTags": ["New Customer"]
}
```

**Required Fields:** `shopifyCustomerId`, `shopId`

**Example:**
```bash
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "shopifyCustomerId": "7891234567890",
    "shopId": "my-store.myshopify.com",
    "currentBalance": 100,
    "customerTags": ["Welcome Bonus"]
  }'
```

**Response:**
```json
{
  "customer": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "shopifyCustomerId": "7891234567890",
    "shopId": "my-store.myshopify.com",
    "currentBalance": 100,
    "customerTags": ["Welcome Bonus"],
    "updatedAt": "2025-01-04T12:00:00.000Z"
  },
  "message": "Customer created"
}
```

---

#### PUT `/api/customers`

Update an existing customer.

**Request Body:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "currentBalance": 500,
  "customerTags": ["VIP", "Upgraded"]
}
```

**Required Fields:** `id`

**Example:**
```bash
curl -X PUT http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "customerTags": ["VIP", "Loyal Customer"]
  }'
```

---

#### DELETE `/api/customers`

Delete a customer (also deletes their ledger entries due to cascade).

**Request Body:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{"id": "123e4567-e89b-12d3-a456-426614174000"}'
```

---

### 2. Ledger API

The ledger tracks all point transactions (credits and debits).

#### GET `/api/ledger`

Retrieve ledger entries.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | uuid | No | Filter by customer |
| `reason` | string | No | Filter by reason (purchase, signup_bonus, etc.) |
| `limit` | number | No | Max entries to return (default: 50) |

**Examples:**
```bash
# Get all ledger entries
curl http://localhost:3000/api/ledger

# Get entries for a specific customer
curl "http://localhost:3000/api/ledger?customerId=123e4567-e89b-12d3-a456-426614174000"

# Get all purchase transactions
curl "http://localhost:3000/api/ledger?reason=purchase"

# Get last 10 entries
curl "http://localhost:3000/api/ledger?limit=10"
```

**Response:**
```json
{
  "entries": [
    {
      "id": "abc12345-...",
      "customerId": "123e4567-...",
      "amount": 150,
      "reason": "purchase",
      "externalId": "order_12345",
      "metadata": {"orderTotal": "15.00", "currency": "EUR"},
      "shopifyOrderId": "1234567890123",
      "createdAt": "2025-01-04T12:00:00.000Z",
      "customer": {
        "id": "123e4567-...",
        "shopifyCustomerId": "7891234567890",
        "shopId": "my-store.myshopify.com"
      }
    }
  ],
  "count": 1,
  "totals": {
    "sum": 1500,
    "count": 25
  }
}
```

---

#### POST `/api/ledger`

Add or deduct points from a customer.

**Request Body:**
```json
{
  "customerId": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 100,
  "reason": "purchase",
  "externalId": "order_12345",
  "metadata": {"orderTotal": "10.00"},
  "shopifyOrderId": "1234567890123"
}
```

**Required Fields:** `customerId`, `amount`, `reason`

**Common Reasons:**
- `purchase` - Points earned from a purchase
- `signup_bonus` - Welcome bonus
- `birthday_bonus` - Birthday reward
- `referral_bonus` - Referral reward
- `redemption` - Points spent (use negative amount)
- `manual_adjustment` - Admin adjustment
- `expiration` - Points expired

**Examples:**

```bash
# Add 100 points for a purchase
curl -X POST http://localhost:3000/api/ledger \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 100,
    "reason": "purchase",
    "externalId": "order_12345",
    "shopifyOrderId": "1234567890123"
  }'

# Deduct 50 points (manual adjustment)
curl -X POST http://localhost:3000/api/ledger \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": -50,
    "reason": "manual_adjustment",
    "metadata": {"note": "Correction for invalid order"}
  }'

# Add signup bonus
curl -X POST http://localhost:3000/api/ledger \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 200,
    "reason": "signup_bonus"
  }'
```

**Response:**
```json
{
  "entry": {
    "id": "abc12345-...",
    "customerId": "123e4567-...",
    "amount": 100,
    "reason": "purchase",
    "createdAt": "2025-01-04T12:00:00.000Z"
  },
  "newBalance": 1600,
  "message": "Points added"
}
```

---

#### DELETE `/api/ledger`

Delete a ledger entry and reverse the balance.

**Request Body:**
```json
{
  "id": "abc12345-e89b-12d3-a456-426614174000"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/ledger \
  -H "Content-Type: application/json" \
  -d '{"id": "abc12345-e89b-12d3-a456-426614174000"}'
```

---

### 3. Redemptions API

Track reward redemptions and discount codes.

#### GET `/api/redemptions`

Retrieve redemption records.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `customerId` | uuid | No | Filter by customer |
| `limit` | number | No | Max entries to return (default: 50) |

**Examples:**
```bash
# Get all redemptions
curl http://localhost:3000/api/redemptions

# Get redemptions for a specific customer
curl "http://localhost:3000/api/redemptions?customerId=123e4567-e89b-12d3-a456-426614174000"
```

**Response:**
```json
{
  "redemptions": [
    {
      "id": "def67890-...",
      "customerId": "123e4567-...",
      "rewardId": "reward-uuid-...",
      "shopifyDiscountCode": "LOYAL7890_ABC123",
      "pointsSpent": 200,
      "createdAt": "2025-01-04T12:00:00.000Z",
      "customer": {
        "id": "123e4567-...",
        "shopifyCustomerId": "7891234567890",
        "shopId": "my-store.myshopify.com",
        "currentBalance": 1300
      }
    }
  ],
  "count": 1,
  "totals": {
    "pointsSpent": 200,
    "count": 1
  }
}
```

---

#### POST `/api/redemptions`

Create a new redemption (redeem points for a reward).

**Request Body:**
```json
{
  "customerId": "123e4567-e89b-12d3-a456-426614174000",
  "pointsSpent": 200,
  "rewardId": "reward-uuid",
  "shopifyDiscountCode": "CUSTOM_CODE_123"
}
```

**Required Fields:** `customerId`, `pointsSpent`

**Notes:**
- If `shopifyDiscountCode` is not provided, one will be auto-generated
- Customer must have sufficient points balance
- Creates a ledger entry automatically

**Example:**
```bash
curl -X POST http://localhost:3000/api/redemptions \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "123e4567-e89b-12d3-a456-426614174000",
    "pointsSpent": 200
  }'
```

**Response:**
```json
{
  "redemption": {
    "id": "def67890-...",
    "customerId": "123e4567-...",
    "rewardId": "auto-generated-uuid",
    "shopifyDiscountCode": "LOYAL7890_A1B2C3D4",
    "pointsSpent": 200,
    "createdAt": "2025-01-04T12:00:00.000Z"
  },
  "discountCode": "LOYAL7890_A1B2C3D4",
  "newBalance": 1300,
  "message": "Redemption created successfully"
}
```

---

#### DELETE `/api/redemptions`

Delete a redemption, optionally refunding points.

**Request Body:**
```json
{
  "id": "def67890-e89b-12d3-a456-426614174000",
  "refund": true
}
```

**Examples:**
```bash
# Delete without refund
curl -X DELETE http://localhost:3000/api/redemptions \
  -H "Content-Type: application/json" \
  -d '{"id": "def67890-e89b-12d3-a456-426614174000"}'

# Delete and refund points
curl -X DELETE http://localhost:3000/api/redemptions \
  -H "Content-Type: application/json" \
  -d '{"id": "def67890-e89b-12d3-a456-426614174000", "refund": true}'
```

---

### 4. Statistics API

Get aggregated statistics about the loyalty program.

#### GET `/api/stats`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `shopId` | string | No | Filter statistics by shop |

**Example:**
```bash
curl http://localhost:3000/api/stats
```

**Response:**
```json
{
  "counts": {
    "customers": 5,
    "ledgerEntries": 26,
    "redemptions": 8
  },
  "points": {
    "total": 12500,
    "credited": 15000,
    "debited": 2500,
    "netBalance": 12500
  },
  "redemptions": {
    "totalPointsSpent": 2500,
    "averagePointsSpent": 312
  },
  "pointsByReason": [
    {"reason": "purchase", "totalPoints": 8000, "count": 15},
    {"reason": "signup_bonus", "totalPoints": 500, "count": 5},
    {"reason": "redemption", "totalPoints": -2500, "count": 8}
  ],
  "topCustomers": [
    {
      "id": "123e4567-...",
      "shopifyCustomerId": "7891234567890",
      "currentBalance": 5000,
      "customerTags": ["VIP", "Top Spender"]
    }
  ],
  "recentActivity": [
    {
      "id": "abc12345-...",
      "customerId": "7891234567890",
      "amount": 150,
      "reason": "purchase",
      "createdAt": "2025-01-04T12:00:00.000Z"
    }
  ]
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

**Common HTTP Status Codes:**
| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request (missing required fields) |
| `404` | Not Found |
| `405` | Method Not Allowed |
| `500` | Internal Server Error |

---

## Testing with Postman

1. Import the following collection or create requests manually
2. Set the base URL variable to `http://localhost:3000`
3. For POST/PUT/DELETE requests, set `Content-Type: application/json` header

---

## Database Seeding

To populate the database with test data:

```bash
npx prisma db seed
```

This creates:
- 5 test customers
- ~25 ledger entries (various transaction types)
- ~8 redemptions

---

## Prisma Studio

To visually browse and edit the database:

```bash
npx prisma studio
```

Opens at `http://localhost:5555`

