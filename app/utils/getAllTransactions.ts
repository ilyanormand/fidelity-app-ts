export const getAllTransactions = () => {
    const operations = ["Earn", "Spend", "Manual", "Refund", "Promotion"];

    return [
        {
            id: "1",
            timestamp: "2023-10-26 10:00:00",
            customer: "John Doe",
            operation: "Earn",
            amount: 100,
            direction: "credit",
            shopifyOrder: "#1001",
            status: "Retrying",
            notes: "Purchase reward",
        },
        {
            id: "2",
            timestamp: "2023-10-25 14:30:00",
            customer: "Jane Smith",
            operation: "Spend",
            amount: -50,
            direction: "debit",
            shopifyOrder: "#1002",
            status: "Retrying",
            notes: "Discount applied",
        },
        {
            id: "3",
            timestamp: "2023-10-24 09:15:00",
            customer: "Bob Johnson",
            operation: "Manual",
            amount: 75,
            direction: "credit",
            shopifyOrder: "#1003",
            status: "Failed",
            notes: "Bonus points",
        },
        ...Array.from({ length: 25 }, (_, i) => {
            const operation = operations[i % operations.length];
            const direction = operation === "Spend" ? "debit" : "credit";
            const amount = direction === "credit" ? 50 : -20;

            return {
                id: String(i + 4),
                timestamp: "2023-10-23 11:00:00",
                customer: `User ${i + 4}`,
                operation: operation,
                amount: amount,
                direction: direction,
                shopifyOrder: `#10${i + 4}`,
                status: "Processed",
                notes: "Regular transaction",
            };
        }),
    ];
};