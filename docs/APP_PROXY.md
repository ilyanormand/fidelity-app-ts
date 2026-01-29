# App Proxy Documentation

Your loyalty widget can now communicate with your app backend through Shopify's App Proxy.

## 🔗 Configuration

**Proxy URL Pattern:**
```
https://{shop-domain}/apps/loyalty/*
  ↓ proxies to ↓
https://{your-app-url}/proxy/*
```

**Example:**
```
https://my-store.myshopify.com/apps/loyalty/customer
  → proxies to →
https://fidelity-app-ts.fly.dev/proxy/customer
```

---

## 📍 Available Endpoints

### 1. Get Customer Balance

**Storefront URL:**
```
GET https://{shop}/apps/loyalty/customer
```

**Automatic Parameters** (added by Shopify):
- `shop` - Shop domain
- `logged_in_customer_id` - Customer ID (only if customer is logged in)

**Response:**
```json
{
  "success": true,
  "customer": {
    "id": "uuid",
    "currentBalance": 1500,
    "customerTags": ["VIP"]
  }
}
```

**JavaScript Example (from your Liquid widget):**
```javascript
fetch('/apps/loyalty/customer')
  .then(res => res.json())
  .then(data => {
    console.log('Customer balance:', data.customer.currentBalance);
  });
```

---

### 2. Get Available Rewards

**Storefront URL:**
```
GET https://{shop}/apps/loyalty/rewards
```

**Response:**
```json
{
  "success": true,
  "rewards": [
    {
      "id": "uuid",
      "name": "$10 Off",
      "description": "Get $10 off your order",
      "imageUrl": "https://...",
      "pointsCost": 400,
      "discountType": "fixed_amount",
      "discountValue": 1000,
      "minimumCartValue": 5000
    }
  ]
}
```

**JavaScript Example:**
```javascript
fetch('/apps/loyalty/rewards')
  .then(res => res.json())
  .then(data => {
    data.rewards.forEach(reward => {
      console.log(`${reward.name}: ${reward.pointsCost} points`);
    });
  });
```

---

### 3. Get Transaction History

**Storefront URL:**
```
GET https://{shop}/apps/loyalty/transactions
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "uuid",
      "amount": 150,
      "reason": "purchase",
      "date": "2025-01-05T12:00:00.000Z"
    }
  ]
}
```

---

### 4. Redeem Points for Reward

**Storefront URL:**
```
POST https://{shop}/apps/loyalty/redeem
```

**Request Body:**
```json
{
  "rewardId": "uuid-of-reward",
  "cartTotal": 5000
}
```

**Response (Success):**
```json
{
  "success": true,
  "discountCode": "LOYAL7890_XYZ123",
  "newBalance": 1100,
  "redemption": {
    "id": "uuid",
    "rewardName": "$10 Off",
    "pointsSpent": 400
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Insufficient points",
  "required": 400,
  "current": 200
}
```

**JavaScript Example:**
```javascript
fetch('/apps/loyalty/redeem', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    rewardId: 'reward-uuid',
    cartTotal: 5000 // $50.00 in cents
  })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert(`Discount code: ${data.discountCode}`);
      // Apply discount code to cart
    } else {
      alert(data.error);
    }
  });
```

---

## 🎨 Updating Your Loyalty Widget

Update your widget JavaScript files to use the proxy:

**Example for `loyalty-app.js`:**

```javascript
// Fetch customer points
async function loadCustomerPoints() {
  try {
    const response = await fetch('/apps/loyalty/customer');
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('points-balance').textContent = 
        data.customer.currentBalance.toLocaleString();
    }
  } catch (error) {
    console.error('Failed to load points:', error);
  }
}

// Fetch available rewards
async function loadRewards() {
  try {
    const response = await fetch('/apps/loyalty/rewards');
    const data = await response.json();
    
    if (data.success) {
      displayRewards(data.rewards);
    }
  } catch (error) {
    console.error('Failed to load rewards:', error);
  }
}

// Redeem a reward
async function redeemReward(rewardId, cartTotal) {
  try {
    const response = await fetch('/apps/loyalty/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rewardId, cartTotal })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert(`Success! Your discount code: ${data.discountCode}`);
      // Optionally apply to cart
      applyDiscountCode(data.discountCode);
    } else {
      alert(data.error);
    }
  } catch (error) {
    console.error('Failed to redeem:', error);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadCustomerPoints();
  loadRewards();
});
```

---

## 🧪 Testing the Proxy

### Development (with shopify app dev):

```bash
# Start dev server
shopify app dev

# Your proxy will be available at:
# https://{your-dev-store}.myshopify.com/apps/loyalty/customer
```

Test in browser console:

```javascript
fetch('/apps/loyalty/customer')
  .then(r => r.json())
  .then(console.log);
```

### Production (after deploy):

The proxy URLs work automatically on your live store:
```
https://your-store.myshopify.com/apps/loyalty/customer
```

---

## 🔒 Security Notes

1. ✅ **Authentication:** `authenticate.public.appProxy(request)` validates the request is from Shopify
2. ✅ **Customer ID:** Shopify automatically passes `logged_in_customer_id` for authenticated customers
3. ✅ **Shop verification:** All requests include the `shop` parameter
4. ⚠️ **Public endpoint:** App proxy is publicly accessible - don't expose sensitive data

---

## 🚀 Deployment

After making changes, redeploy:

```bash
# The app proxy config will be updated automatically
shopify app deploy
```

Or for Fly.io:

```bash
fly deploy
```

The proxy configuration from `shopify.app.toml` will be applied to your app.

---

## 📚 Shopify Parameters

Shopify automatically adds these parameters to all proxy requests:

| Parameter | Description |
|-----------|-------------|
| `shop` | Shop domain (e.g., "my-store.myshopify.com") |
| `logged_in_customer_id` | Customer ID if logged in, null otherwise |
| `path_prefix` | The configured proxy path prefix |
| `timestamp` | Request timestamp |
| `signature` | HMAC signature for validation |

Reference: [Shopify App Proxy Documentation](https://shopify.dev/docs/apps/build/online-store/app-proxies)

