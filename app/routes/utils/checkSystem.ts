export async function checkSystem(shopId: string) {
  //Logic to check system status
  return [
    { label: "Queue status", status: "● Idle" },
    { label: "Sync status", status: "● In Sync" },
  ];
}
