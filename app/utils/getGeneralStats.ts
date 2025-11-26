export async function getGeneralStats(shopId: string) {
  //Logic to get general statistics
  //MOCK DATA
  return [
    {
      label: "Total points issued",
      value: "1,250,400",
      delta: "+5.2%",
      positive: true,
    },
    {
      label: "Points redeemed",
      value: "876,500",
      delta: "+8.1%",
      positive: true,
    },
    {
      label: "Active loyalty members",
      value: "5,821",
      delta: "+1.2%",
      positive: true,
    },
    {
      label: "Redemptions this month",
      value: "312",
      delta: "-3.5%",
      positive: false,
    },
  ];
}
