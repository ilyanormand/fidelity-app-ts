import { useEffect, useState } from "react";
import {
  Card,
  DataTable,
  Badge,
  Text,
  Spinner,
  BlockStack,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { useFetcher } from "react-router";
import styles from "./LatestOperations.module.scss";

interface LedgerEntry {
  id: string;
  timestamp: string;
  customer: string;
  operation: string;
  amount: number;
  direction: string;
  shopifyOrder: string;
  status: string;
  notes: string;
}

interface LatestOperationsProps {
  limit?: number;
}

export function LatestOperations({ limit = 10 }: LatestOperationsProps) {
  const fetcher = useFetcher();
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    // Fetch latest transactions from API
    fetcher.load(`/api/ledger?limit=${limit}`);
  }, [limit]);

  useEffect(() => {
    if (fetcher.data && fetcher.data.entries) {
      // Transform the API response to match our display format
      const formatted = fetcher.data.entries.map((entry: any) => ({
        id: entry.id,
        timestamp: entry.createdAt
          ? new Date(entry.createdAt).toLocaleString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Unknown",
        customer: entry.customer?.shopifyCustomerId
          ? `Customer ${entry.customer.shopifyCustomerId.slice(-4)}`
          : "Unknown",
        operation: mapReasonToOperation(entry.reason),
        amount: entry.amount,
        direction: entry.amount >= 0 ? "credit" : "debit",
        shopifyOrder: entry.shopifyOrderId ? `#${entry.shopifyOrderId}` : "—",
        status: "Processed",
        notes: entry.reason?.replace(/_/g, " ") || "",
      }));
      setTransactions(formatted);
    }
  }, [fetcher.data]);

  const mapReasonToOperation = (reason: string): string => {
    switch (reason) {
      case "purchase":
        return "Automatic";
      case "signup_bonus":
      case "birthday_bonus":
      case "referral_bonus":
        return "Promotion";
      case "redemption":
        return "Spend";
      case "redemption_refund":
        return "Refund";
      case "manual_adjustment":
        return "Manual";
      default:
        return "Earn";
    }
  };

  const getOperationBadge = (operation: string) => {
    switch (operation) {
      case "Automatic":
        return <Badge tone="info">{operation}</Badge>;
      case "Promotion":
        return <Badge tone="success">{operation}</Badge>;
      case "Spend":
        return <Badge tone="warning">{operation}</Badge>;
      case "Refund":
        return <Badge tone="critical">{operation}</Badge>;
      case "Manual":
        return <Badge>{operation}</Badge>;
      default:
        return <Badge tone="success">{operation}</Badge>;
    }
  };

  const getAmountDisplay = (amount: number, direction: string) => {
    const isCredit = direction === "credit";
    const color = isCredit ? "#008060" : "#D72C0D";
    const sign = isCredit ? "+" : "";
    return (
      <span style={{ color, fontWeight: 600 }}>
        {sign}
        {amount.toLocaleString("en-US")}
      </span>
    );
  };

  const rows = transactions.map((t) => [
    t.timestamp,
    t.customer,
    getOperationBadge(t.operation),
    getAmountDisplay(t.amount, t.direction),
    t.shopifyOrder,
    t.notes,
  ]);

  if (fetcher.state === "loading" && transactions.length === 0) {
    return (
      <Card>
        <Box padding="600">
          <InlineStack align="center" blockAlign="center">
            <Spinner size="large" />
            <Text as="p">Loading latest operations...</Text>
          </InlineStack>
        </Box>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <Box padding="600">
          <BlockStack gap="200" inlineAlign="center">
            <Text as="p" tone="subdued">
              No transactions found
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Transactions will appear here once customers start earning and
              spending points.
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  return (
    <Card padding="0">
      <div className={styles.operationsTable}>
        <DataTable
          columnContentTypes={["text", "text", "text", "numeric", "text", "text"]}
          headings={[
            "Timestamp",
            "Customer",
            "Operation",
            "Amount",
            "Order",
            "Notes",
          ]}
          rows={rows}
        />
      </div>
    </Card>
  );
}

