mutation {
discountAutomaticAppCreate(
automaticAppDiscount: {
title: "Rewards for point"
startsAt: "2025-11-29T00:00:00Z"
functionHandle: "discount-function-rs"
combinesWith: {
productDiscounts: true
orderDiscounts: true
}
discountClasses: [PRODUCT, ORDER]
}
) {
automaticAppDiscount {
discountId
title
}
userErrors {
field
message
}
}
}
