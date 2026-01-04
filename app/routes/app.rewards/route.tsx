import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { Page, Button, Text, Card, BlockStack, InlineStack, Box, Badge } from "@shopify/polaris";
import { PlusCircleIcon, MenuHorizontalIcon } from "@shopify/polaris-icons";
import getAllRewars from "../../utils/getAllRewars";

export const loader = async () => {
    const rewards = getAllRewars();
    return { rewards };
};

export default function Rewards() {
    const { rewards } = useLoaderData<typeof loader>();

    return (
        <Page
            title="Loyalty Rewards"
            primaryAction={<Button variant="primary" icon={PlusCircleIcon}>
                Create reward
            </Button>}>
            <Text fontWeight="regular" variant="headingSm" tone="subdued" as="h4">Create and manage the rewards your customers can redeem with their points</Text>
            <Card>
                <InlineStack gap="400" wrap>
                    {rewards.map((reward) => (
                        <Box key={reward.ID} maxWidth="217px">
                            <Card roundedAbove="sm" padding="0">
                                <BlockStack gap="0">
                                    <Box
                                        width="100%"
                                        minHeight="120px"
                                        borderRadius="200"
                                        background="bg-fill-active"
                                    />
                                    <Box padding="500">
                                        <BlockStack gap="300">
                                            <InlineStack align="space-between" blockAlign="center">
                                                <Text as="h3" variant="headingMd">
                                                    {reward.name}
                                                </Text>
                                                <Button
                                                    variant="tertiary"
                                                    icon={MenuHorizontalIcon}
                                                />
                                            </InlineStack>
                                            <InlineStack gap="200" wrap={false}>
                                                <Badge tone="success">{`${reward.points} Points`}</Badge>
                                                <Badge>{reward.customers}</Badge>
                                            </InlineStack>
                                            <Text as="p" tone="subdued">
                                                Code: {reward.code}
                                            </Text>
                                        </BlockStack>
                                    </Box>
                                </BlockStack>
                            </Card>
                        </Box>
                    ))}
                </InlineStack>
            </Card>
        </Page >
    );
};