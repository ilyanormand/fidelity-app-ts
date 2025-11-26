
import { getPointsStats } from "./app/utils/getPointsStats";

async function main() {
    console.log("Testing getPointsStats with default range...");
    const result = await getPointsStats("test-shop", "30d");
    console.log("Range:", result.range);
    console.log("Data points count:", result.data.length);
    console.log("First data point:", result.data[0]);
    console.log("Last data point:", result.data[result.data.length - 1]);
    console.log("Percentage:", result.percentage);

    console.log("\nTesting getPointsStats with 'today' range...");
    const resultToday = await getPointsStats("test-shop", "today");
    console.log("Range:", resultToday.range);
    console.log("Data points count:", resultToday.data.length);
}

main().catch(console.error);
