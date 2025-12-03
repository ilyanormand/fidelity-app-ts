import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Checkout.jsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/login.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/changePointsToItem.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/utils.ts' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/changePointsToDiscount.tsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.cart-line-list.render-after').Api;
  const globalThis: { shopify: typeof shopify };
}
