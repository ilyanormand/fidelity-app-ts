# Checkout UI Extension

## Function Documentation

### `validatePointsBalance`

Validates and synchronizes loyalty points balance with cart items. This function ensures that the total cost of reward items in the cart does not exceed the available points balance, and automatically removes or reduces item quantities when necessary.

#### Step-by-Step Logic

##### Step 1: Extract Cart Attributes (lines 212-251)

The function first extracts data from cart attributes:

```typescript
// Converts attributes array to object for easy access
const cartAttributes = {
  "_loyalty_points_spent": "100",
  "_loyalty_points_to_redeem": "0",
  "_loyalty_free_items": '["variant-id-1", "variant-id-2"]',
  "_loyalty_points_map": '{"variant-id-1": 50, "variant-id-2": 100}'
}

// Extracted values:
- spentPoints: Number of points already spent
- pointsToRedeem: Number of points redeemed for monetary discount
- freeItemsArray: Array of variant IDs purchased with points
- pointsMap: Map of points cost for each variant
```

**Note**: Currently, JSON parsing lacks strict validation (see `JSON_PARSE_ISSUES.md` for improvements needed).

##### Step 2: Calculate Total Cost of Cart Items (lines 253-290)

Iterates through all cart items and identifies those purchased with points:

```typescript
cartLines.forEach((line) => {
  // Checks if item is in the free items list
  if (freeItemsArray.includes(variantId)) {
    // Calculates cost: points_price × quantity
    const lineTotalCost = pointsCost * quantity;
    totalCostFromCart += lineTotalCost;
  }
});
```

**Result**: `totalCostFromCart` - total points cost of all reward items in the cart.

##### Step 3: Calculate Available Balance (lines 292-300)

```typescript
const sourceBalance = initialBalance ?? balance;
const availableBalance = Math.max(0, sourceBalance - pointsToRedeem);
```

**Formula**: `Available Balance = Initial Balance - Points Redeemed for Discount`

The function uses `initialBalance` from metafields if provided, otherwise falls back to current `balance` state.

##### Step 4: Remove Items if Balance Exceeded (lines 304-403)

If `totalCostFromCart > availableBalance` and balance is loaded:

1. **Sort items by cost** (lines 311-313)
   - Orders from most expensive to least expensive
   - Ensures expensive items are removed first

2. **Remove items until total cost fits within balance** (lines 321-352)
   - **If item cost ≥ needed reduction OR quantity = 1**: Remove entire line
   - **Otherwise**: Decrease quantity
   - Continues until `currentTotal ≤ availableBalance`

3. **Apply cart changes** (lines 354-369)
   - Updates quantities for partially reduced items
   - Removes items that need complete removal

4. **Update cart attributes** (lines 372-399)
   - Removes deleted items from `_loyalty_free_items` array
   - Updates `_loyalty_points_map` to reflect remaining items

**Important**: Items are only removed if `isBalanceLoaded` is true, preventing premature removal before balance data loads.

##### Step 5: Sync Points Spent Attribute (lines 405-414)

```typescript
const difference = spentPoints - totalCostFromCart;
const isMatch = Math.abs(difference) < 0.01;

// If doesn't match - updates attribute
if (!isMatch) {
  // Updates _loyalty_points_spent = totalCostFromCart
}
```

Ensures the `_loyalty_points_spent` attribute matches the actual total cost of items in the cart.

##### Step 6: Update UI Balance (lines 416-428)

```typescript
const finalSpentPoints = isMatch ? spentPoints : totalCostFromCart;
const totalSpentPoints = finalSpentPoints + pointsToRedeem;
const newBalance = Math.max(0, sourceBalance - totalSpentPoints);

setBalance(newBalance); // Updates component state
```

Calculates the new balance and updates the UI state.

---

#### Example Scenario

**Initial Data:**

```
initialBalance = 500 points
pointsToRedeem = 0
totalCostFromCart = 600 points (items in cart)
```

**Execution:**

1. `availableBalance = 500 - 0 = 500 points`
2. **Overflow detected**: `600 > 500` → Need to remove items worth 100 points
3. **Removes/reduces items** from cart
4. **Updates cart attributes** (removes deleted items)
5. **Updates UI balance**: `500 - 500 = 0 points`

---

#### Critical Features

1. **Balance Loading Protection** (line 299)
   - Prevents item removal until balance is loaded from metafields
   - Avoids race conditions during initialization

2. **Smart Removal Algorithm**
   - Removes most expensive items first
   - Minimizes number of items affected
   - Attempts to reduce quantities before complete removal

3. **Data Synchronization**
   - Ensures cart attributes match actual cart state
   - Validates `_loyalty_points_spent` against calculated total
   - Cleans up orphaned attribute data

4. **UI State Management**
   - Automatically recalculates and updates balance display
   - Handles balance changes from multiple sources (metafields, discounts, etc.)

---

#### Usage Example

```typescript
// In Checkout component
useEffect(() => {
  validatePointsBalance(
    shopify,
    balance,
    setBalance,
    freeItems,
    initialBalanceValue,
    applyCartLinesChange,
  );
}, [initialBalanceValue, freeItems]);
```

---

#### Related Functions

- `validateCartWithFreeItems()` - Cleans up cart attributes when items are removed
- `getBalanceFromMetafields()` - Fetches initial balance from customer metafields

---

#### Known Issues & Improvements

See `JSON_PARSE_ISSUES.md` for validation improvements needed:

- Add strict type validation for JSON parsed data
- Protect against prototype pollution in `pointsMap`
- Validate array elements are strings in `freeItemsArray`
