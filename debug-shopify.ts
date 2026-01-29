
import shopify from "./app/shopify.server";

console.log("Keys on shopify object:", Object.keys(shopify));
if ((shopify as any).api) {
    console.log("Keys on shopify.api:", Object.keys((shopify as any).api));
    if ((shopify as any).api.clients) {
        console.log("Keys on shopify.api.clients:", Object.keys((shopify as any).api.clients));
    }
}
if ((shopify as any).clients) {
    console.log("Keys on shopify.clients:", Object.keys((shopify as any).clients));
}
