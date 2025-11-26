import { Card, Text, BlockStack, Box, InlineStack } from "@shopify/polaris";
import styles from "./GeneralStatistics.module.scss";

interface StatItem {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}

interface Props {
  data: StatItem[];
}

export function GeneralStatistics({ data }: Props) {
  const totalPointsIssued = data.find(
    (item) => item.label === "Total points issued",
  );
  const pointsRedeemed = data.find((item) => item.label === "Points redeemed");
  const activeMembers = data.find(
    (item) => item.label === "Active loyalty members",
  );
  const redemptions = data.find(
    (item) => item.label === "Redemptions this month",
  );

  return (
    <div className={styles.statsGrid}>
      <Card roundedAbove="sm">
        <Box padding="400">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Total points issued
            </Text>
            <Text as="h3" variant="headingLg">
              {totalPointsIssued?.value || "N/A"}
            </Text>
            <Text
              as="p"
              variant="bodySm"
              tone={totalPointsIssued?.positive ? "success" : "critical"}
            >
              {totalPointsIssued?.delta || "N/A"}
            </Text>
          </BlockStack>
        </Box>
      </Card>

      <Card roundedAbove="sm">
        <Box padding="400">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Points redeemed
            </Text>
            <Text as="h3" variant="headingLg">
              {pointsRedeemed?.value || "N/A"}
            </Text>
            <Text
              as="p"
              variant="bodySm"
              tone={pointsRedeemed?.positive ? "success" : "critical"}
            >
              {pointsRedeemed?.delta || "N/A"}
            </Text>
          </BlockStack>
        </Box>
      </Card>

      <Card roundedAbove="sm">
        <Box padding="400">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Active loyalty members
            </Text>
            <Text as="h3" variant="headingLg">
              {activeMembers?.value || "N/A"}
            </Text>
            <Text
              as="p"
              variant="bodySm"
              tone={activeMembers?.positive ? "success" : "critical"}
            >
              {activeMembers?.delta || "N/A"}
            </Text>
          </BlockStack>
        </Box>
      </Card>

      <Card roundedAbove="sm">
        <Box padding="400">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued">
              Redemptions this month
            </Text>
            <Text as="h3" variant="headingLg">
              {redemptions?.value || "N/A"}
            </Text>
            <Text
              as="p"
              variant="bodySm"
              tone={redemptions?.positive ? "success" : "critical"}
            >
              {redemptions?.delta || "N/A"}
            </Text>
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}
