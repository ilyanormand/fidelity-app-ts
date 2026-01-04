export const getDataCustomer = async (customerId: string) => {
  //Logic to get data customer

  //I AM NOT SURE IF THIS IS THE BEST WAY TO GET THE SHOP CURRENCY CODE pspsps
  const shop = {
    currencyCode: "EUR",
  };
  const mockCustomer = {
    id: "1",
    name: "John",
    secondName: "Doe",
    email: "john.doe@example.com",
    shopifyId: "1234567890",
    createdAt: new Date(),
    balancePointsTotal: 1000,
    balance: 12.5,
    lastUpdate: new Date(),
    currencyCode: shop.currencyCode,
    ledger: [
      {
        id: "1",
        points: 100,
        type: "Credit",
        createdAt: new Date(),
        orderId: "1234567890",
        notes: "Note 1",
      },
      {
        id: "1",
        points: 200,
        type: "Automatic",
        direction: "debit",
        createdAt: new Date(),
        orderId: "1234567890",
        notes: "Note 2",
      },
      {
        id: "1",
        points: 300,
        type: "Manual",
        direction: "credit",
        createdAt: new Date(),
        orderId: null,
        notes: "Note 3",
      },
      {
        id: "1",
        points: 400,
        type: "Refund",
        direction: "debit",
        createdAt: new Date(),
        orderId: "1234567890",
        notes: "Note 4",
      },
      {
        id: "1",
        points: 500,
        type: "Expired",
        direction: "debit",
        createdAt: new Date(),
        orderId: null,
        notes: "Note 5",
      },
    ],
  };
  return mockCustomer;
};
