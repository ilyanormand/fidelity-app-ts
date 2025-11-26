import { useLoaderData } from "react-router";
import { LoaderFunctionArgs } from "react-router";
import { getAllTransactions } from "../../utils/getAllTransactions";
import {
    Page,
    InlineStack,
    Button,
    DataTable,
    Card,
    Text,
    Popover,
    BlockStack,
    ActionList,
    TextField,
    DatePicker,
} from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { authenticate } from "../../shopify.server";
import { useState, useCallback, useEffect } from "react";
import styles from "./styles.module.scss";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const transactions = await getAllTransactions();

    return { transactions };
};

const PAGE_SIZE = 10;
function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, React.CSSProperties> = {
        Processed: {
            backgroundColor: "#d6ffe1",
            color: "#008f39",
            padding: "4px 10px",
            borderRadius: "12px",
            fontWeight: 600,
            display: "inline-block",
        },
        Failed: {
            backgroundColor: "#ffd6d6",
            color: "#d40000",
            padding: "4px 10px",
            borderRadius: "12px",
            fontWeight: 600,
            display: "inline-block",
        },
        Retrying: {
            backgroundColor: "#fff6d1",
            color: "#b38a00",
            padding: "4px 10px",
            borderRadius: "12px",
            fontWeight: 600,
            display: "inline-block",
        },
    };

    return <span style={styles[status] || {}}>{status}</span>;
}
function AmountCell({ amount, direction }: { amount: number; direction: string }) {
    const isCredit = direction === "credit";

    const style = {
        fontWeight: 600,
        color: isCredit ? "#008000" : "#cc0000",
    };

    const sign = isCredit ? "+" : "-";

    return <span style={style}>{sign}{Math.abs(amount)}</span>;
}

export default function LoyaltyTransactions() {
    const { transactions } = useLoaderData<typeof loader>();
    const [page, setPage] = useState(0);

    const [typePopoverActive, setTypePopoverActive] = useState(false);
    const [datePopoverActive, setDatePopoverActive] = useState(false);
    const [customerPopoverActive, setCustomerPopoverActive] = useState(false);
    const [orderPopoverActive, setOrderPopoverActive] = useState(false);
    const [statusPopoverActive, setStatusPopoverActive] = useState(false);
    const [typeValue, setTypeValue] = useState<string | undefined>();
    const [dateRange, setDateRange] = useState<{
        start: Date;
        end: Date;
    } | null>(null);
    const [customerValue, setCustomerValue] = useState("");
    const [orderValue, setOrderValue] = useState("");
    const [statusValue, setStatusValue] = useState<string | undefined>();
    const [{ month, year }, setDate] = useState({
        month: new Date().getMonth(),
        year: new Date().getFullYear(),
    });
    useEffect(() => {
        setPage(0);
    }, [typeValue, dateRange, customerValue, orderValue, statusValue]);
    const toggleTypePopover = useCallback(
        () => setTypePopoverActive((active) => !active),
        [],
    );
    const toggleDatePopover = useCallback(
        () => setDatePopoverActive((active) => !active),
        [],
    );
    const toggleCustomerPopover = useCallback(
        () => setCustomerPopoverActive((active) => !active),
        [],
    );
    const toggleOrderPopover = useCallback(
        () => setOrderPopoverActive((active) => !active),
        [],
    );
    const toggleStatusPopover = useCallback(
        () => setStatusPopoverActive((active) => !active),
        [],
    );

    const handleMonthChange = useCallback(
        (month: number, year: number) => setDate({ month, year }),
        [],
    );

    const resetFilters = () => {
        setTypeValue(undefined);
        setDateRange(null);
        setCustomerValue("");
        setOrderValue("");
        setStatusValue(undefined);
    };
    const filteredTransactions = transactions.filter((t) => {
        if (typeValue && t.operation !== typeValue) return false;
        if (statusValue && t.status !== statusValue) return false;
        if (
            customerValue &&
            !t.customer.toLowerCase().includes(customerValue.toLowerCase())
        )
            return false;
        if (
            orderValue &&
            !t.shopifyOrder.toLowerCase().includes(orderValue.toLowerCase())
        )
            return false;
        if (dateRange) {
            const transactionDate = new Date(t.timestamp);
            const start = new Date(dateRange.start);
            start.setHours(0, 0, 0, 0);

            if (transactionDate < start) return false;

            if (dateRange.end) {
                const end = new Date(dateRange.end);
                end.setHours(23, 59, 59, 999);
                if (transactionDate > end) return false;
            }
        }

        return true;
    });

    const rows = filteredTransactions.map((t) => [
        t.timestamp,
        t.customer,
        t.operation,
        <AmountCell amount={t.amount} direction={t.direction} />,
        t.shopifyOrder,
        <StatusBadge status={t.status} />,
        t.notes,
    ]);

    const totalPages = Math.ceil(rows.length / PAGE_SIZE);
    const hasPrevious = page > 0;
    const hasNext = page < totalPages - 1;

    const paginatedRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <Page
            title="Loyalty Transactions"
            primaryAction={<Button variant="primary">Add manual transaction</Button>}
        >
            <BlockStack gap="200">
                <Card>
                    <InlineStack gap="200">
                        <Popover
                            active={typePopoverActive}
                            activator={
                                <Button
                                    onClick={toggleTypePopover}
                                    disclosure
                                    variant={typeValue ? "primary" : undefined}
                                >
                                    {typeValue || "Type"}
                                </Button>
                            }
                            onClose={toggleTypePopover}
                        >
                            <ActionList
                                actionRole="menuitem"
                                items={[
                                    {
                                        content: "Automatic",
                                        onAction: () => {
                                            setTypeValue("Automatic");
                                            toggleTypePopover();
                                        },
                                    },
                                    {
                                        content: "Spend",
                                        onAction: () => {
                                            setTypeValue("Spend");
                                            toggleTypePopover();
                                        },
                                    },
                                    {
                                        content: "Manual",
                                        onAction: () => {
                                            setTypeValue("Manual");
                                            toggleTypePopover();
                                        },
                                    },
                                    {
                                        content: "Refund",
                                        onAction: () => {
                                            setTypeValue("Refund");
                                            toggleTypePopover();
                                        },
                                    },
                                    {
                                        content: "Promotion",
                                        onAction: () => {
                                            setTypeValue("Promotion");
                                            toggleTypePopover();
                                        },
                                    },
                                    {
                                        content: "Clear",
                                        onAction: () => {
                                            setTypeValue(undefined);
                                            toggleTypePopover();
                                        },
                                        destructive: true,
                                    },
                                ]}
                            />
                        </Popover>

                        <Popover
                            active={datePopoverActive}
                            activator={
                                <Button
                                    onClick={toggleDatePopover}
                                    disclosure
                                    icon={CalendarIcon}
                                    variant={dateRange ? "primary" : undefined}
                                >
                                    Date range
                                </Button>
                            }
                            onClose={toggleDatePopover}
                        >
                            <div style={{ padding: "16px" }}>
                                <DatePicker
                                    month={month}
                                    year={year}
                                    onChange={setDateRange}
                                    onMonthChange={handleMonthChange}
                                    selected={dateRange || undefined}
                                    allowRange
                                />
                                <div style={{ marginTop: "10px", textAlign: "right" }}>
                                    <Button onClick={() => setDateRange(null)} size="slim">Clear</Button>
                                </div>
                            </div>
                        </Popover>

                        <Popover
                            active={customerPopoverActive}
                            activator={
                                <Button
                                    onClick={toggleCustomerPopover}
                                    disclosure
                                    variant={customerValue ? "primary" : undefined}
                                >
                                    Customer
                                </Button>
                            }
                            onClose={toggleCustomerPopover}
                        >
                            <div style={{ padding: "16px", minWidth: "300px" }}>
                                <TextField
                                    label="Customer"
                                    value={customerValue}
                                    onChange={setCustomerValue}
                                    autoComplete="off"
                                    placeholder="Search customer"
                                />
                            </div>
                        </Popover>

                        <Popover
                            active={orderPopoverActive}
                            activator={
                                <Button
                                    onClick={toggleOrderPopover}
                                    disclosure
                                    variant={orderValue ? "primary" : undefined}
                                >
                                    Order ID
                                </Button>
                            }
                            onClose={toggleOrderPopover}
                        >
                            <div style={{ padding: "16px", minWidth: "300px" }}>
                                <TextField
                                    label="Order ID"
                                    value={orderValue}
                                    onChange={setOrderValue}
                                    autoComplete="off"
                                    placeholder="Search order ID"
                                />
                            </div>
                        </Popover>

                        <Popover
                            active={statusPopoverActive}
                            activator={
                                <Button
                                    onClick={toggleStatusPopover}
                                    disclosure
                                    variant={statusValue ? "primary" : undefined}
                                >
                                    {statusValue || "Status"}
                                </Button>
                            }
                            onClose={toggleStatusPopover}
                        >
                            <ActionList
                                actionRole="menuitem"
                                items={[
                                    {
                                        content: "Processed",
                                        onAction: () => {
                                            setStatusValue("Processed");
                                            toggleStatusPopover();
                                        },
                                    },
                                    {
                                        content: "Failed",
                                        onAction: () => {
                                            setStatusValue("Failed");
                                            toggleStatusPopover();
                                        },
                                    },
                                    {
                                        content: "Retrying",
                                        onAction: () => {
                                            setStatusValue("Retrying");
                                            toggleStatusPopover();
                                        },
                                    },
                                    {
                                        content: "Clear",
                                        onAction: () => {
                                            setStatusValue(undefined);
                                            toggleStatusPopover();
                                        },
                                        destructive: true,
                                    },
                                ]}
                            />
                        </Popover>

                        <Button
                            onClick={resetFilters}
                            variant="tertiary"
                            disabled={
                                !typeValue &&
                                !dateRange &&
                                !customerValue &&
                                !orderValue &&
                                !statusValue
                            }
                        >
                            Clear filters
                        </Button>
                    </InlineStack>
                </Card>
                <Card padding="0">
                    <div className={styles.dataTable}>
                        <DataTable
                            columnContentTypes={[
                                "text",
                                "text",
                                "text",
                                "numeric",
                                "text",
                                "text",
                                "text",
                            ]}
                            headings={[
                                "TIMESTAMP",
                                "CUSTOMER",
                                "OPERATION",
                                "AMOUNT",
                                "SHOPIFY ORDER",
                                "STATUS",
                                "NOTES",
                            ]}
                            rows={paginatedRows}
                        />
                    </div>
                </Card>

                <InlineStack gap="100" align="center">
                    <Button
                        disabled={!hasPrevious}
                        onClick={() => setPage((p) => p - 1)}
                        size="slim"
                    >
                        Previous
                    </Button>
                    {(() => {
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
                                    variant={page === totalPages - 1 ? "primary" : "secondary"}
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
            </BlockStack>
        </Page>
    );
}