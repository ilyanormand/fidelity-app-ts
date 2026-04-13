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
  Popover,
  ActionList,
  Banner,
  Thumbnail,
  Spinner,
} from "@shopify/polaris";
import { PlusCircleIcon, MenuHorizontalIcon, ImageIcon } from "@shopify/polaris-icons";
import prisma from "../../db.server";
import { useState, useCallback } from "react";

type RewardProduct = {
  id: string;
  shopId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyProductTitle: string;
  shopifyProductImageUrl: string | null;
  pointsCost: number;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  const rewardProducts = await prisma.rewardProduct.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });

  return { rewardProducts, shopId };
};

export default function RewardProducts() {
  const { rewardProducts: initialRewardProducts, shopId } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const [rewardProducts, setRewardProducts] = useState<RewardProduct[]>(initialRewardProducts as RewardProduct[]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<RewardProduct | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ status: "success" | "critical"; message: string } | null>(null);
  const [isPickingProduct, setIsPickingProduct] = useState(false);

  // Form state for create
  const [formPointsCost, setFormPointsCost] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Picked product info (from ResourcePicker)
  const [pickedProduct, setPickedProduct] = useState<{
    productId: string;
    variantId: string;
    title: string;
    imageUrl: string | null;
  } | null>(null);

  const openResourcePicker = useCallback(async () => {
    setIsPickingProduct(true);
    try {
      const selected = await (window as any).shopify.resourcePicker({
        type: "product",
        multiple: false,
        filter: { variants: true, draft: false, archived: false },
      });
      if (selected && selected.length > 0) {
        const product = selected[0];
        const variant = product.variants?.[0] || {};
        setPickedProduct({
          productId: product.id,
          variantId: variant.id || product.id,
          title: product.title,
          imageUrl: product.images?.[0]?.originalSrc || null,
        });
      }
    } catch {
      // user cancelled
    }
    setIsPickingProduct(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!pickedProduct || !formPointsCost) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reward-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          shopifyProductId: pickedProduct.productId,
          shopifyVariantId: pickedProduct.variantId,
          shopifyProductTitle: pickedProduct.title,
          shopifyProductImageUrl: pickedProduct.imageUrl,
          pointsCost: parseInt(formPointsCost),
          isActive: formIsActive,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ status: "success", message: "Produit récompense créé avec succès" });
        setCreateModalOpen(false);
        resetForm();
        revalidator.revalidate();
      } else {
        setBanner({ status: "critical", message: data.error || "Erreur lors de la création" });
      }
    } catch {
      setBanner({ status: "critical", message: "Erreur réseau" });
    }
    setIsSubmitting(false);
  }, [pickedProduct, formPointsCost, formIsActive, shopId, revalidator]);

  const handleEdit = useCallback(async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reward-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProduct.id,
          pointsCost: parseInt(formPointsCost),
          isActive: formIsActive,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({ status: "success", message: "Produit récompense mis à jour" });
        setEditModalOpen(false);
        revalidator.revalidate();
      } else {
        setBanner({ status: "critical", message: data.error || "Erreur lors de la mise à jour" });
      }
    } catch {
      setBanner({ status: "critical", message: "Erreur réseau" });
    }
    setIsSubmitting(false);
  }, [selectedProduct, formPointsCost, formIsActive, revalidator]);

  const handleDelete = useCallback(async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reward-products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedProduct.id }),
      });
      if (res.ok) {
        setBanner({ status: "success", message: "Produit récompense supprimé" });
        setDeleteModalOpen(false);
        revalidator.revalidate();
      } else {
        const data = await res.json();
        setBanner({ status: "critical", message: data.error || "Erreur lors de la suppression" });
      }
    } catch {
      setBanner({ status: "critical", message: "Erreur réseau" });
    }
    setIsSubmitting(false);
  }, [selectedProduct, revalidator]);

  const handleToggleActive = useCallback(async (rp: RewardProduct) => {
    try {
      const res = await fetch("/api/reward-products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rp.id, isActive: !rp.isActive }),
      });
      if (res.ok) {
        revalidator.revalidate();
      }
    } catch {
      setBanner({ status: "critical", message: "Erreur réseau" });
    }
  }, [revalidator]);

  const resetForm = () => {
    setFormPointsCost("");
    setFormIsActive(true);
    setPickedProduct(null);
    setSelectedProduct(null);
  };

  const openEditModal = (rp: RewardProduct) => {
    setSelectedProduct(rp);
    setFormPointsCost(String(rp.pointsCost));
    setFormIsActive(rp.isActive);
    setEditModalOpen(true);
    setActivePopover(null);
  };

  const openDeleteModal = (rp: RewardProduct) => {
    setSelectedProduct(rp);
    setDeleteModalOpen(true);
    setActivePopover(null);
  };

  return (
    <Page
      title="Produits récompenses"
      subtitle="Produits échangeables contre des points de fidélité au checkout"
      primaryAction={
        <Button
          icon={PlusCircleIcon}
          variant="primary"
          onClick={() => {
            resetForm();
            setCreateModalOpen(true);
          }}
        >
          Ajouter un produit
        </Button>
      }
    >
      <BlockStack gap="400">
        {banner && (
          <Banner
            status={banner.status}
            onDismiss={() => setBanner(null)}
          >
            {banner.message}
          </Banner>
        )}

        {rewardProducts.length === 0 ? (
          <Card>
            <EmptyState
              heading="Aucun produit récompense"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{
                content: "Ajouter un produit",
                onAction: () => {
                  resetForm();
                  setCreateModalOpen(true);
                },
              }}
            >
              <p>Ajoutez des produits que vos clients peuvent obtenir gratuitement en échangeant leurs points.</p>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="300">
            {rewardProducts.map((rp) => (
              <Card key={rp.id}>
                <InlineStack gap="400" align="space-between" blockAlign="center" wrap={false}>
                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                    <Thumbnail
                      source={rp.shopifyProductImageUrl || ImageIcon}
                      alt={rp.shopifyProductTitle}
                      size="medium"
                    />
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">{rp.shopifyProductTitle}</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone={rp.isActive ? "success" : "enabled"}>
                          {rp.isActive ? "Actif" : "Inactif"}
                        </Badge>
                        <Text variant="bodySm" as="span" tone="subdued">
                          {rp.pointsCost} points
                        </Text>
                      </InlineStack>
                      <Text variant="bodySm" as="span" tone="subdued">
                        Variant: {rp.shopifyVariantId.replace("gid://shopify/ProductVariant/", "")}
                      </Text>
                    </BlockStack>
                  </InlineStack>

                  <InlineStack gap="200" blockAlign="center">
                    <Button
                      variant="plain"
                      onClick={() => handleToggleActive(rp)}
                    >
                      {rp.isActive ? "Désactiver" : "Activer"}
                    </Button>
                    <Popover
                      active={activePopover === rp.id}
                      activator={
                        <Button
                          icon={MenuHorizontalIcon}
                          variant="plain"
                          onClick={() => setActivePopover(activePopover === rp.id ? null : rp.id)}
                          accessibilityLabel="Actions"
                        />
                      }
                      onClose={() => setActivePopover(null)}
                    >
                      <ActionList
                        items={[
                          { content: "Modifier", onAction: () => openEditModal(rp) },
                          {
                            content: "Supprimer",
                            destructive: true,
                            onAction: () => openDeleteModal(rp),
                          },
                        ]}
                      />
                    </Popover>
                  </InlineStack>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>
        )}
      </BlockStack>

      {/* Create Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => { setCreateModalOpen(false); resetForm(); }}
        title="Ajouter un produit récompense"
        primaryAction={{
          content: isSubmitting ? "Enregistrement..." : "Ajouter",
          onAction: handleCreate,
          disabled: isSubmitting || !pickedProduct || !formPointsCost,
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Annuler", onAction: () => { setCreateModalOpen(false); resetForm(); } }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text variant="bodyMd" as="p" fontWeight="medium">Produit Shopify</Text>
              {pickedProduct ? (
                <InlineStack gap="300" blockAlign="center">
                  {pickedProduct.imageUrl && (
                    <Thumbnail source={pickedProduct.imageUrl} alt={pickedProduct.title} size="small" />
                  )}
                  <BlockStack gap="050">
                    <Text variant="bodyMd" as="p">{pickedProduct.title}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      Variant: {pickedProduct.variantId.replace("gid://shopify/ProductVariant/", "")}
                    </Text>
                  </BlockStack>
                  <Button variant="plain" onClick={openResourcePicker}>
                    Changer
                  </Button>
                </InlineStack>
              ) : (
                <Button
                  onClick={openResourcePicker}
                  loading={isPickingProduct}
                  disabled={isPickingProduct}
                >
                  {isPickingProduct ? "Sélection en cours..." : "Sélectionner un produit"}
                </Button>
              )}
            </BlockStack>

            <TextField
              label="Coût en points"
              type="number"
              value={formPointsCost}
              onChange={setFormPointsCost}
              placeholder="ex: 500"
              helpText="Nombre de points nécessaires pour obtenir ce produit gratuitement"
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); resetForm(); }}
        title={`Modifier — ${selectedProduct?.shopifyProductTitle}`}
        primaryAction={{
          content: isSubmitting ? "Enregistrement..." : "Enregistrer",
          onAction: handleEdit,
          disabled: isSubmitting || !formPointsCost,
          loading: isSubmitting,
        }}
        secondaryActions={[{ content: "Annuler", onAction: () => { setEditModalOpen(false); resetForm(); } }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedProduct && (
              <InlineStack gap="300" blockAlign="center">
                <Thumbnail
                  source={selectedProduct.shopifyProductImageUrl || ImageIcon}
                  alt={selectedProduct.shopifyProductTitle}
                  size="small"
                />
                <Text variant="bodyMd" as="p">{selectedProduct.shopifyProductTitle}</Text>
              </InlineStack>
            )}
            <TextField
              label="Coût en points"
              type="number"
              value={formPointsCost}
              onChange={setFormPointsCost}
              placeholder="ex: 500"
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setSelectedProduct(null); }}
        title="Supprimer le produit récompense"
        primaryAction={{
          content: isSubmitting ? "Suppression..." : "Supprimer",
          onAction: handleDelete,
          destructive: true,
          disabled: isSubmitting,
          loading: isSubmitting,
        }}
        secondaryActions={[{
          content: "Annuler",
          onAction: () => { setDeleteModalOpen(false); setSelectedProduct(null); },
        }]}
      >
        <Modal.Section>
          <Text as="p">
            Êtes-vous sûr de vouloir supprimer <strong>{selectedProduct?.shopifyProductTitle}</strong> des produits récompenses ?
            Cette action est irréversible.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
