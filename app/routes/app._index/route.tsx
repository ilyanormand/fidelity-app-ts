import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../../shopify.server";
import { PointsCVD } from "../../components/pointsCVD/PointsCVD";
import { GeneralStatistics } from "../../components/generalStatistics/GeneralStatistics";
import { SystemStatus } from "../../components/systemStatus/SystemStatus";
import { getPointsStats } from "../../utils/getPointsStats.server";
import styles from "./styles.module.scss";
import {
  InlineStack,
  BlockStack,
  Text,
  Button,
  Link,
  Page,
} from "@shopify/polaris";
import { checkSystem } from "../../utils/checkSystem";
import { getGeneralStats } from "app/utils/getGeneralStats";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "30d";

  // Get points stats from database
  let pointsStats;
  let statusSystem: Array<{ label: string; status: string }> = [];
  let generalStats: Array<{
    label: string;
    value: string;
    delta: string;
    positive: boolean;
  }> = [];
  try {
    pointsStats = await getPointsStats(shopId, range);
    statusSystem = await checkSystem(shopId);
    generalStats = await getGeneralStats(shopId);
  } catch (error) {
    console.error("Error fetching points stats:", error);
    pointsStats = {
      range: "30d",
      data: [],
      percentage: "+0%",
    };
    statusSystem = [
      { label: "Queue status", status: "● Error" },
      { label: "Sync status", status: "● Error" },
    ];
    generalStats = [
      {
        label: "Total points issued",
        value: "N/A",
        delta: "N/A",
        positive: true,
      },
      {
        label: "Points redeemed",
        value: "N/A",
        delta: "N/A",
        positive: true,
      },
      {
        label: "Active loyalty members",
        value: "N/A",
        delta: "N/A",
        positive: true,
      },
      {
        label: "Redemptions this month",
        value: "N/A",
        delta: "N/A",
        positive: false,
      },
    ];
  }

  // Data received from the server
  const data = {
    statistics: generalStats,
    chartData: {
      title: "Points credited vs debited",
      period:
        range === "1d"
          ? "1 Day"
          : range === "7d"
            ? "7 Days"
            : range === "14d"
              ? "14 Days"
              : "30 Days",
      percentage: `Last ${range === "1d" ? "1 day" : range === "7d" ? "7 days" : range === "14d" ? "14 days" : "30 days"}: ${pointsStats.percentage || "+0%"}`,
      data: pointsStats.data,
    },
    systemStatus: statusSystem,
  };

  return data;
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const range = searchParams.get("range") || "30d";

  const handleRangeChange = (newRange: string) => {
    setSearchParams({ range: newRange });
  };

  return (
    <Page
      title="Dashboard"
      primaryAction={
        <InlineStack gap="400" align="end" blockAlign="end">
          <Button variant="primary">Open customer list</Button>
          <Button variant="primary">Adjust points manually</Button>
        </InlineStack>
      }
    >
      <BlockStack gap="400">
        <GeneralStatistics data={data.statistics} />
        <div className={styles.chartAndStatus}>
          <div className={styles.chartSection}>
            <PointsCVD data={data.chartData} />
          </div>
          <div className={styles.statusSection}>
            <SystemStatus data={data.systemStatus} />
          </div>
        </div>
        <BlockStack gap="400">
          <Text as="h3" variant="headingLg">
            Latest operations
          </Text>
          <InlineStack gap="200">
            <Button
              onClick={() => handleRangeChange("1d")}
              variant={range === "1d" ? "primary" : "secondary"}
            >
              1 day
            </Button>
            <Button
              onClick={() => handleRangeChange("7d")}
              variant={range === "7d" ? "primary" : "secondary"}
            >
              7 days
            </Button>
            <Button
              onClick={() => handleRangeChange("14d")}
              variant={range === "14d" ? "primary" : "secondary"}
            >
              14 days
            </Button>
            <Button
              onClick={() => handleRangeChange("30d")}
              variant={range === "30d" ? "primary" : "secondary"}
            >
              30 days
            </Button>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
