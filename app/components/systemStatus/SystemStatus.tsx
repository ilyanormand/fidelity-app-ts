import { Card, Text, BlockStack, Box, InlineStack } from "@shopify/polaris";

interface StatusItem {
  label: string;
  status: string;
}

interface Props {
  data: StatusItem[];
}

export function SystemStatus({ data }: Props) {
  return (
    <BlockStack gap="400">
      {data.map((item, index) => (
        <Card key={index} roundedAbove="sm">
          <Box padding="400">
            <BlockStack gap="200">
              <Text as="p" tone="subdued" variant="bodySm">
                {item.label}
              </Text>
              <InlineStack gap="200" align="start">
                <Box
                  background="bg-surface-secondary"
                  padding="100"
                  borderRadius="200"
                >
                  <Text as="span" variant="bodySm" tone="success">
                    {item.status}
                  </Text>
                </Box>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      ))}
    </BlockStack>
  );
}
