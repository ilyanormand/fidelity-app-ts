import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
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
  Pagination,
  BlockStack,
  Popover,
  ActionList,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { CustomerSearch } from "../../components/customeSearch/CustomerSearch";
import styles from "./styles.module.scss";
import { getCustomers } from "../../utils/getCustomers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  const url = new URL(request.url);
  const customers = await getCustomers(shopId);

  return { customers };
};

const PAGE_SIZE = 5;

export default function Customers() {
  const { customers } = useLoaderData<typeof loader>();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const filtered = customers.filter((c) =>
    `${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase()),
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case "synced":
        return <Badge tone="success">•Synced</Badge>;
      case "pending":
        return <Badge tone="warning">•Pending Sync</Badge>;
      case "error":
        return <Badge tone="critical">•Error</Badge>;
      default:
        return <Badge>Status</Badge>;
    }
  };

  const rows = filtered.map((c) => [
    <div key={c.email}>
      <Text as="span" fontWeight="medium">
        {c.name}
      </Text>
      <br />
      <Text as="span" variant="bodySm" tone="subdued">
        {c.email}
      </Text>
    </div>,

    c.currentBalance.toLocaleString(),
    c.shopifyBalance.toLocaleString(),
    statusBadge(c.status),
    c.totalEarned.toLocaleString(),
    c.totalSpent.toLocaleString(),

    <Button variant="tertiary">View history</Button>,
  ]);

  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const paginatedRows = rows.slice(start, end);

  const hasPrevious = page > 0;
  const hasNext = end < rows.length;

  const displayStart = rows.length > 0 ? start + 1 : 0;
  const displayEnd = Math.min(end, rows.length);
  const totalCount = rows.length;
  return (
    <s-page heading="Customers">
      <Box padding="500">
        <BlockStack gap="400">
          <InlineStack gap="400" align="end" blockAlign="end">
            <Text
              as="p"
              fontWeight="regular"
              variant="headingSm"
              tone="disabled"
            >
              Manage all customers in your loyalty program.
            </Text>
            <div style={{ flex: 1 }}></div>
            <Button variant="primary">Open customer list</Button>
            <Button variant="primary">Adjust points manually</Button>
          </InlineStack>
          <Card roundedAbove="sm" padding="0">
            {/* HEADER OF TABLE */}
            <Box padding="500">
              <InlineStack gap="300" align="center">
                <Box minWidth="300px">
                  <TextField
                    label="Search customers"
                    labelHidden
                    placeholder="Search by customer name or email"
                    value={search}
                    onChange={handleSearchChange}
                    prefix={
                      <img
                        src="https://res.cloudinary.com/dcuqusnsc/image/upload/v1763995304/free-icon-magnifier-2725317_rojlmm.svg"
                        alt="search"
                        style={{
                          width: 16,
                          height: 16,
                          display: "flex",
                          opacity: 0.5,
                        }}
                      />
                    }
                    autoComplete="off"
                  />
                </Box>
                <CustomerSearch
                  label="Point Balance"
                  items={[
                    { content: "1000 points" },
                    { content: "2000 points" },
                  ]}
                />

                <CustomerSearch
                  label="Customer Tags"
                  items={[{ content: "Tag A" }, { content: "Tag B" }]}
                />
                <CustomerSearch
                  label="Date Joined"
                  items={[{ content: "2022-01-01" }, { content: "2022-02-01" }]}
                />
                <CustomerSearch
                  label="Exclusion Rules"
                  items={[{ content: "Rule A" }, { content: "Rule B" }]}
                />
              </InlineStack>
            </Box>
            <Divider />
            {/* TABLE */}
            <div className={styles.customersTable}>
              <DataTable
                columnContentTypes={[
                  "text",
                  "numeric",
                  "numeric",
                  "text",
                  "numeric",
                  "numeric",
                  "text",
                ]}
                headings={[
                  "Customer",
                  "Current Balance",
                  "Shopify Balance",
                  "Status",
                  "Total Earned",
                  "Total Spent",
                  "",
                ]}
                rows={paginatedRows}
              />
            </div>
            <Divider />

            {/* FOOTER OF TABLE */}
            <Box padding="400">
              <InlineStack gap="200" align="center">
                <Text as="p" fontWeight="regular" variant="headingSm">
                  Showing {displayStart}-{displayEnd} of {totalCount} customers
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
      </Box>
    </s-page>
  );
}
