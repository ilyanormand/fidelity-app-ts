import { useState, useEffect } from "react";
import { Card, Text, InlineStack, BlockStack, Box } from "@shopify/polaris";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./PointsCVD.module.scss";

interface ChartDataPoint {
  name: string;
  value: number;
}

interface ChartData {
  title: string;
  period: string;
  percentage: string;
  data: ChartDataPoint[];
}

interface Props {
  data: ChartData;
}

export function PointsCVD({ data }: Props) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <Card roundedAbove="sm">
      <Box padding="400">
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text as="h6" variant="bodySm" tone="subdued">
              {data.title}
            </Text>
          </InlineStack>

          <InlineStack align="start" gap="200">
            <Text as="h3" variant="headingLg">
              {data.period}
            </Text>
            <Text as="p" tone="success">
              {data.percentage}
            </Text>
          </InlineStack>

          <Box padding="200">
            <div className={styles.chartContainer}>
              {isClient ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.data}>
                    <XAxis dataKey="name" />
                    <YAxis hide />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3B82F6"
                      fill="url(#gradient)"
                      strokeWidth={3}
                    />
                    <defs>
                      <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#3B82F6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="#3B82F6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.chartPlaceholder}>
                  <Text as="p" tone="subdued">
                    Loading chart...
                  </Text>
                </div>
              )}
            </div>
          </Box>
        </BlockStack>
      </Box>
    </Card>
  );
}
