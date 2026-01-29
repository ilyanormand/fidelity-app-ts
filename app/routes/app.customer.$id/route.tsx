import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { authenticate } from "../../shopify.server";
import {
  Card,
  DataTable,
  Badge,
  Text,
  InlineStack,
  Box,
  TextField,
  Button,
  Divider,
  BlockStack,
  Modal,
  ChoiceList,
  Banner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { format } from "date-fns";
import { getDataCustomer } from "../../utils/getDataCustomer";

interface LedgerEntry {
  id: string;
  points: number;
  type: string;
  direction: string;
  createdAt: string;
  orderId: string | null;
  notes: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const customerId = params.id;
  const customer = await getDataCustomer(customerId || "");
  return {
    customer,
    shopId,
  };
};

const PAGE_SIZE = 5;

export default function Customer() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [page, setPage] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pointsAmount, setPointsAmount] = useState("");
  const [operationType, setOperationType] = useState<string[]>(["add"]);
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const handleOpenModal = useCallback(() => {
    setModalOpen(true);
    setPointsAmount("");
    setReason("");
    setOperationType(["add"]);
    setSubmitError(null);
    setSubmitSuccess(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSubmitError(null);
    setSubmitSuccess(null);
  }, []);

  const handleSubmitPoints = useCallback(async () => {
    if (!pointsAmount || isNaN(Number(pointsAmount)) || Number(pointsAmount) <= 0) {
      setSubmitError("Please enter a valid positive number for points");
      return;
    }

    if (!data.customer?.id) {
      setSubmitError("Customer not found");
      return;
    }

    const amount = operationType[0] === "add"
      ? Number(pointsAmount)
      : -Number(pointsAmount);

    try {
      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId: data.customer.id,
          amount,
          reason: reason || "manual_adjustment",
          syncToShopify: true, // Sync to Shopify metafield
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setSubmitError(result.error || "Failed to update points");
        return;
      }

      setSubmitSuccess(
        `Successfully ${operationType[0] === "add" ? "added" : "subtracted"} ${pointsAmount} points. New balance: ${result.newBalance}`
      );

      // Revalidate the page data to show updated balance
      setTimeout(() => {
        revalidator.revalidate();
        handleCloseModal();
      }, 1500);
    } catch (error) {
      setSubmitError("Network error. Please try again.");
    }
  }, [pointsAmount, operationType, reason, data.customer?.id, revalidator, handleCloseModal]);

  const customerName = data.customer
    ? ` ${data.customer.secondName} ${data.customer.name.charAt(0)}.`
    : "Customer";
  const customerAvatar = data.customer
    ? `${data.customer.secondName.charAt(0).toUpperCase()}${data.customer.name.charAt(0).toUpperCase()}`
    : "NA";
  const balancePointsTotal = data.customer?.balancePointsTotal
    ? data.customer.balancePointsTotal.toLocaleString("en-US")
    : "0";
  const formatMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: data.customer?.currencyCode,
  });

  const getBadgeTone = (type: string, direction?: string) => {
    if (type === "Manual") return "info";
    if (type === "Refund") return "warning";

    if (direction === "credit") return "success";
    if (direction === "debit") return "critical";

    if (type === "Credit") return "success";
    return "warning";
  };

  const getAmountColor = (type: string, direction?: string): string => {
    if (type === "Manual") return "#6D7175";

    if (type === "Refund") return "#B98900";

    if (direction === "credit") return "#008060";
    if (direction === "debit") return "#D72C0D";

    if (type === "Credit") return "#008060";
    return "#B98900";
  };

  const getAmountPrefix = (type: string, direction?: string): string => {
    if (type === "Manual") {
      if (direction === "credit") return "+";
      if (direction === "debit") return "-";
      return "";
    }

    if (direction === "credit") return "+";
    if (direction === "debit") return "-";

    if (type === "Credit") return "+";
    if (type === "Debit" || type === "Refund" || type === "Expired") return "-";
    return "";
  };

  const ledger: LedgerEntry[] = data.customer?.ledger || [];
  const rows = ledger.map((entry: LedgerEntry) => {
    const badgeTone = getBadgeTone(entry.type, entry.direction);
    const amountColor = getAmountColor(entry.type, entry.direction);
    const prefix = getAmountPrefix(entry.type, entry.direction);
    return [
      format(new Date(entry.createdAt), "MMM d, yyyy"),
      <Badge key={`badge-${entry.id}`} tone={badgeTone}>
        {entry.type}
      </Badge>,
      <span key={`amount-${entry.id}`} style={{ color: amountColor }}>
        {prefix}
        {entry.points.toLocaleString("en-US")}
      </span>,
      entry.orderId || "—",
      entry.notes || "—",
    ];
  });

  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const paginatedRows = rows.slice(start, end);

  const hasPrevious = page > 0;
  const hasNext = end < rows.length;

  const displayStart = rows.length > 0 ? start + 1 : 0;
  const displayEnd = Math.min(end, rows.length);
  const totalCount = rows.length;

  return (
    <s-page heading={customerName}>
      <s-link slot="breadcrumb-actions" href="/app/customers">
        Customers
      </s-link>
      <s-link
        slot="breadcrumb-actions"
        href={`/app/customer/${data.customer?.id || ""}`}
      >
        {customerName}
      </s-link>
      <BlockStack gap="400">
        <InlineStack gap="400" align="end" blockAlign="end">
          <Text as="h3" variant="headingLg">
            {customerName}
          </Text>
          <div style={{ flex: 1 }}></div>
          <Button variant="primary">Force sync metafields</Button>
          <Button variant="primary" onClick={handleOpenModal}>
            Add/subtract points
          </Button>
        </InlineStack>
        <InlineStack gap="400" align="start" blockAlign="start">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Card roundedAbove="sm">
              <InlineStack gap="400" align="start" blockAlign="start">
                <Box
                  background="bg-fill-tertiary"
                  padding="200"
                  borderRadius="full"
                >
                  <Text as="span" fontWeight="bold">
                    {customerAvatar}
                  </Text>
                </Box>
                <BlockStack gap="100">
                  <Box paddingBlockEnd="100">
                    <Text as="h4" variant="headingLg">
                      {data.customer?.secondName} {data.customer?.name}
                    </Text>
                  </Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Email: {data.customer?.email}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Shopify ID: {data.customer?.shopifyId}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Customer since:{" "}
                    {data.customer?.createdAt
                      ? format(new Date(data.customer.createdAt), "MMM d, yyyy")
                      : "N/A"}
                  </Text>
                </BlockStack>
              </InlineStack>
            </Card>
          </div>
          <Card roundedAbove="sm">
            <Text as="h1" variant="headingLg">
              Balance summary
            </Text>
            <Text variant="heading3xl" as="h2">
              {balancePointsTotal}
            </Text>
            <Text as="p" variant="bodyMd">
              Equivalent to {formatMoney.format(data.customer?.balance || 0)}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Last updated:{" "}
              {data.customer?.lastUpdate
                ? format(new Date(data.customer.lastUpdate), "MMM d, yyyy")
                : "N/A"}
            </Text>
          </Card>
        </InlineStack>
        <Card roundedAbove="sm" padding="0">
          <Box padding="500">
            <Text as="h3" variant="headingLg">
              Transaction History
            </Text>
          </Box>
          <Divider />
          <div>
            <DataTable
              columnContentTypes={["text", "text", "numeric", "text", "text"]}
              headings={["Date", "Type", "Amount", "Order ID", "Notes"]}
              rows={paginatedRows}
            />
          </div>
          <Divider />
          <Box padding="400">
            <InlineStack gap="200" align="center">
              <Text as="p" fontWeight="regular" variant="headingSm">
                Showing {displayStart}-{displayEnd} of {totalCount} transactions
              </Text>
              <div style={{ flex: 1 }}></div>
              <InlineStack gap="100">
                <Button
                  disabled={!hasPrevious}
                  onClick={() => setPage((p) => p - 1)}
                  size="slim"
                >
                  Previous
                </Button>
                {(() => {
                  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
                  const pageNumbers = [];
                  let startPage = Math.max(0, page - 1);
                  let endPage = Math.min(totalPages - 1, page + 1);
                  if (page < 1) {
                    endPage = Math.min(2, totalPages - 1);
                  }
                  if (page > totalPages - 2) {
                    startPage = Math.max(0, totalPages - 3);
                  }

                  if (startPage > 0) {
                    pageNumbers.push(
                      <Button
                        key={0}
                        onClick={() => setPage(0)}
                        variant={page === 0 ? "primary" : "secondary"}
                        size="slim"
                      >
                        1
                      </Button>,
                    );
                    if (startPage > 1) {
                      pageNumbers.push(
                        <Text key="ellipsis1" as="span">
                          ...
                        </Text>,
                      );
                    }
                  }

                  for (let i = startPage; i <= endPage; i++) {
                    pageNumbers.push(
                      <Button
                        key={i}
                        onClick={() => setPage(i)}
                        variant={page === i ? "primary" : "secondary"}
                        size="slim"
                      >
                        {String(i + 1)}
                      </Button>,
                    );
                  }

                  if (endPage < totalPages - 1) {
                    if (endPage < totalPages - 2) {
                      pageNumbers.push(
                        <Text key="ellipsis2" as="span">
                          ...
                        </Text>,
                      );
                    }
                    pageNumbers.push(
                      <Button
                        key={totalPages - 1}
                        onClick={() => setPage(totalPages - 1)}
                        variant={
                          page === totalPages - 1 ? "primary" : "secondary"
                        }
                        size="slim"
                      >
                        {String(totalPages)}
                      </Button>,
                    );
                  }

                  return pageNumbers;
                })()}

                <Button
                  disabled={!hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  size="slim"
                >
                  Next
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>
      </BlockStack>

      {/* Add/Subtract Points Modal */}
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title="Adjust Customer Points"
        primaryAction={{
          content: operationType[0] === "add" ? "Add Points" : "Subtract Points",
          onAction: handleSubmitPoints,
          loading: fetcher.state === "submitting",
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseModal,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {submitError && (
              <Banner tone="critical" onDismiss={() => setSubmitError(null)}>
                {submitError}
              </Banner>
            )}
            {submitSuccess && (
              <Banner tone="success">
                {submitSuccess}
              </Banner>
            )}

            <ChoiceList
              title="Operation"
              choices={[
                { label: "Add points", value: "add" },
                { label: "Subtract points", value: "subtract" },
              ]}
              selected={operationType}
              onChange={setOperationType}
            />

            <TextField
              label="Points amount"
              type="number"
              value={pointsAmount}
              onChange={setPointsAmount}
              autoComplete="off"
              min={1}
              helpText={`Current balance: ${data.customer?.balancePointsTotal?.toLocaleString("en-US") || 0} points`}
            />

            <TextField
              label="Reason (optional)"
              value={reason}
              onChange={setReason}
              autoComplete="off"
              placeholder="e.g., Birthday bonus, Manual correction"
              helpText="This will be recorded in the transaction history"
            />

            <Text as="p" variant="bodySm" tone="subdued">
              {operationType[0] === "add"
                ? `This will add ${pointsAmount || 0} points to the customer's balance.`
                : `This will subtract ${pointsAmount || 0} points from the customer's balance.`}
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </s-page>
  );
}
