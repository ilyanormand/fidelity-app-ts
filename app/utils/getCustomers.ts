import prisma from "../db.server";



export const getCustomers = async (shopId: string) => {
    const statuses = ["synced", "pending", "error"];
    const moc_data = Array.from({ length: 55 }, (_, i) => {
        const totalEarned = Math.floor(Math.random() * 15000) + 500;
        const totalSpent = Math.floor(Math.random() * totalEarned * 0.7);
        const currentBalance = totalEarned - totalSpent;
        const shopifyBalance = Math.random() > 0.1 ? currentBalance : Math.floor(Math.random() * currentBalance);
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        return {
            shopifyCustomerId: `customer_${1000000 + i}`,
            name: `Customer ${i + 1}`,
            email: `customer${i + 1}@example.com`,
            createdAt: new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)),
            totalEarned,
            totalSpent,
            shopifyBalance,
            currentBalance,
            status,
        };
    });
    return moc_data;
};