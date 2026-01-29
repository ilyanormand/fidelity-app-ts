import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../../shopify.server";
import {
  Page,
  Button,
  Text,
  Card,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  EmptyState,
  Modal,
  TextField,
  Select,
  Popover,
  ActionList,
  Banner,
  Thumbnail,
} from "@shopify/polaris";
import { PlusCircleIcon, MenuHorizontalIcon, ImageIcon } from "@shopify/polaris-icons";
import prisma from "../../db.server";
import { useState, useCallback } from "react";

type Reward = {
  id: string;
  shopId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pointsCost: number;
  discountType: string;
  discountValue: number;
  minimumCartValue: number | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  const rewards = await prisma.reward.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });

  return { rewards, shopId };
};

export default function Rewards() {
  const { rewards, shopId } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [popoverActive, setPopoverActive] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [pointsCost, setPointsCost] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minimumCartValue, setMinimumCartValue] = useState("");
  const [isActive, setIsActive] = useState("true");

  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setImageUrl("");
    setPointsCost("");
    setDiscountType("percentage");
    setDiscountValue("");
    setMinimumCartValue("");
    setIsActive("true");
    setError(null);
    setSuccess(null);
  }, []);

  const loadRewardData = useCallback((reward: any) => {
    setName(reward.name);
    setDescription(reward.description || "");
    setImageUrl(reward.imageUrl || "");
    setPointsCost(reward.pointsCost.toString());
    setDiscountType(reward.discountType);
    setDiscountValue(reward.discountValue.toString());
    setMinimumCartValue(reward.minimumCartValue?.toString() || "");
    setIsActive(reward.isActive ? "true" : "false");
  }, []);

  const handleOpenCreate = useCallback(() => {
    resetForm();
    setCreateModalOpen(true);
  }, [resetForm]);

  const handleOpenEdit = useCallback((reward: any) => {
    setSelectedReward(reward);
    loadRewardData(reward);
    setEditModalOpen(true);
    setPopoverActive(null);
  }, [loadRewardData]);

  const handleOpenDelete = useCallback((reward: any) => {
    setSelectedReward(reward);
    setDeleteModalOpen(true);
    setPopoverActive(null);
  }, []);

  const handleCreateReward = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          name,
          description,
          imageUrl,
          pointsCost: parseInt(pointsCost),
          discountType,
          discountValue: parseInt(discountValue),
          minimumCartValue: minimumCartValue ? parseInt(minimumCartValue) : null,
          isActive: isActive === "true",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to create reward");
        setLoading(false);
        return;
      }

      setSuccess("Reward created successfully!");
      setTimeout(() => {
        revalidator.revalidate();
        setCreateModalOpen(false);
        resetForm();
      }, 1000);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [shopId, name, description, imageUrl, pointsCost, discountType, discountValue, minimumCartValue, isActive, revalidator, resetForm]);

  const handleUpdateReward = useCallback(async () => {
    if (!selectedReward) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rewards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedReward.id,
          name,
          description,
          imageUrl,
          pointsCost: parseInt(pointsCost),
          discountType,
          discountValue: parseInt(discountValue),
          minimumCartValue: minimumCartValue ? parseInt(minimumCartValue) : null,
          isActive: isActive === "true",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to update reward");
        setLoading(false);
        return;
      }

      setSuccess("Reward updated successfully!");
      setTimeout(() => {
        revalidator.revalidate();
        setEditModalOpen(false);
        resetForm();
      }, 1000);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedReward, name, description, imageUrl, pointsCost, discountType, discountValue, minimumCartValue, isActive, revalidator, resetForm]);

  const handleDeleteReward = useCallback(async () => {
    if (!selectedReward) return;

    setLoading(true);

    try {
      const response = await fetch("/api/rewards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedReward.id }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to delete reward");
        setLoading(false);
        return;
      }

      revalidator.revalidate();
      setDeleteModalOpen(false);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedReward, revalidator]);

  const getDiscountLabel = (discountType: string, discountValue: number) => {
    switch (discountType) {
      case "percentage":
        return `${discountValue}% Off`;
      case "fixed_amount":
        return `$${(discountValue / 100).toFixed(2)} Off`;
      case "free_shipping":
        return "Free Shipping";
      default:
        return discountType;
    }
  };

  const getMinimumCartLabel = (minimumCartValue: number | null) => {
    if (!minimumCartValue) return "No minimum";
    return `Min. $${(minimumCartValue / 100).toFixed(2)}`;
  };

  return (
    <Page
      title="Loyalty Rewards"
      primaryAction={{
        content: "Create reward",
        icon: PlusCircleIcon,
        onAction: handleOpenCreate,
      }}
    >
      <BlockStack gap="400">
        <Text fontWeight="regular" variant="headingSm" tone="subdued" as="h4">
          Create and manage the rewards your customers can redeem with their points
        </Text>

        {rewards.length === 0 ? (
          <Card>
            <EmptyState
              heading="No rewards yet"
              action={{ content: "Create reward", icon: PlusCircleIcon, onAction: handleOpenCreate }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Create rewards that customers can redeem with their loyalty points</p>
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <InlineStack gap="400" wrap>
              {rewards.map((reward: Reward) => (
                <Box key={reward.id} maxWidth="217px">
                  <Card roundedAbove="sm" padding="0">
                    <BlockStack gap="0">
                      <Box
                        width="100%"
                        minHeight="120px"
                        borderRadius="200"
                        background="bg-fill-active"
                        padding="400"
                      >
                        {reward.imageUrl ? (
                          <img
                            src={reward.imageUrl}
                            alt={reward.name}
                            style={{ width: "100%", height: "120px", objectFit: "cover" }}
                          />
                        ) : (
                          <Box paddingBlock="800" />
                        )}
                      </Box>
                      <Box padding="500">
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">
                              {reward.name}
                            </Text>
                            <Popover
                              active={popoverActive === reward.id}
                              activator={
                                <Button
                                  variant="tertiary"
                                  icon={MenuHorizontalIcon}
                                  onClick={() =>
                                    setPopoverActive(
                                      popoverActive === reward.id ? null : reward.id
                                    )
                                  }
                                />
                              }
                              onClose={() => setPopoverActive(null)}
                            >
                              <ActionList
                                items={[
                                  {
                                    content: "Edit",
                                    onAction: () => handleOpenEdit(reward),
                                  },
                                  {
                                    content: "Delete",
                                    destructive: true,
                                    onAction: () => handleOpenDelete(reward),
                                  },
                                ]}
                              />
                            </Popover>
                          </InlineStack>
                          <InlineStack gap="200" wrap={false}>
                            <Badge tone="success">
                              {`${reward.pointsCost.toLocaleString("en-US")} Points`}
                            </Badge>
                            <Badge tone={reward.isActive ? "info" : "critical"}>
                              {reward.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {getDiscountLabel(reward.discountType, reward.discountValue)}
                          </Text>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {getMinimumCartLabel(reward.minimumCartValue)}
                          </Text>
                          {reward.description && (
                            <Text as="p" tone="subdued" variant="bodySm">
                              {reward.description}
                            </Text>
                          )}
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Card>
                </Box>
              ))}
            </InlineStack>
          </Card>
        )}
      </BlockStack>

      {/* Create Reward Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Reward"
        primaryAction={{
          content: "Create",
          onAction: handleCreateReward,
          loading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setCreateModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            )}
            {success && <Banner tone="success">{success}</Banner>}

            <TextField
              label="Reward Name"
              value={name}
              onChange={setName}
              placeholder="e.g., $10 Off"
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Brief description for customers"
              autoComplete="off"
              multiline={2}
            />

            <TextField
              label="Image URL"
              value={imageUrl}
              onChange={setImageUrl}
              placeholder="https://example.com/image.png"
              autoComplete="off"
            />

            <TextField
              label="Points Cost"
              type="number"
              value={pointsCost}
              onChange={setPointsCost}
              placeholder="e.g., 500"
              autoComplete="off"
              requiredIndicator
            />

            <Select
              label="Discount Type"
              options={[
                { label: "Percentage Off", value: "percentage" },
                { label: "Fixed Amount Off", value: "fixed_amount" },
                { label: "Free Shipping", value: "free_shipping" },
              ]}
              value={discountType}
              onChange={setDiscountType}
            />

            <TextField
              label={
                discountType === "percentage"
                  ? "Percentage (e.g., 10 for 10%)"
                  : discountType === "fixed_amount"
                  ? "Amount in cents (e.g., 1000 for $10.00)"
                  : "Value (0 for free shipping)"
              }
              type="number"
              value={discountValue}
              onChange={setDiscountValue}
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Minimum Cart Value (cents)"
              type="number"
              value={minimumCartValue}
              onChange={setMinimumCartValue}
              placeholder="e.g., 5000 for $50.00 minimum (leave empty for no minimum)"
              autoComplete="off"
            />

            <Select
              label="Status"
              options={[
                { label: "Active", value: "true" },
                { label: "Inactive", value: "false" },
              ]}
              value={isActive}
              onChange={setIsActive}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Edit Reward Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Reward"
        primaryAction={{
          content: "Update",
          onAction: handleUpdateReward,
          loading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setEditModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            )}
            {success && <Banner tone="success">{success}</Banner>}

            <TextField
              label="Reward Name"
              value={name}
              onChange={setName}
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Description"
              value={description}
              onChange={setDescription}
              autoComplete="off"
              multiline={2}
            />

            <TextField
              label="Image URL"
              value={imageUrl}
              onChange={setImageUrl}
              autoComplete="off"
            />

            <TextField
              label="Points Cost"
              type="number"
              value={pointsCost}
              onChange={setPointsCost}
              autoComplete="off"
              requiredIndicator
            />

            <Select
              label="Discount Type"
              options={[
                { label: "Percentage Off", value: "percentage" },
                { label: "Fixed Amount Off", value: "fixed_amount" },
                { label: "Free Shipping", value: "free_shipping" },
              ]}
              value={discountType}
              onChange={setDiscountType}
            />

            <TextField
              label={
                discountType === "percentage"
                  ? "Percentage (e.g., 10 for 10%)"
                  : discountType === "fixed_amount"
                  ? "Amount in cents (e.g., 1000 for $10.00)"
                  : "Value (0 for free shipping)"
              }
              type="number"
              value={discountValue}
              onChange={setDiscountValue}
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Minimum Cart Value (cents)"
              type="number"
              value={minimumCartValue}
              onChange={setMinimumCartValue}
              placeholder="Leave empty for no minimum"
              autoComplete="off"
            />

            <Select
              label="Status"
              options={[
                { label: "Active", value: "true" },
                { label: "Inactive", value: "false" },
              ]}
              value={isActive}
              onChange={setIsActive}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Reward"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDeleteReward,
          loading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setDeleteModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {error && (
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error}
              </Banner>
            )}
            <Text as="p">
              Are you sure you want to delete the reward "{selectedReward?.name}"?
            </Text>
            <Text as="p" tone="subdued">
              This action cannot be undone. Past redemptions will be preserved.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
