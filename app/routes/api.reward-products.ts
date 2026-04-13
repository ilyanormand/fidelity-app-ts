import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { serialize } from "../utils/serialize";
import { createLogger } from "../utils/logger.server";

const log = createLogger("api:reward-products");

// GET /api/reward-products?shopId=...&isActive=true
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shopId");
  const isActive = url.searchParams.get("isActive");
  const done = log.request("GET", { shopId, isActive });

  try {
    const rewardProducts = await prisma.rewardProduct.findMany({
      where: {
        ...(shopId && { shopId }),
        ...(isActive !== null && isActive !== undefined && { isActive: isActive === "true" }),
      },
      orderBy: { createdAt: "desc" },
    });

    done(200, `${rewardProducts.length} reward products`);
    return Response.json(serialize({ rewardProducts, count: rewardProducts.length }));
  } catch (error) {
    log.error("Error fetching reward products:", error);
    done(500);
    return Response.json({ error: "Failed to fetch reward products" }, { status: 500 });
  }
};

// POST   /api/reward-products — Create
// PUT    /api/reward-products — Update
// DELETE /api/reward-products — Delete
export const action = async ({ request }: ActionFunctionArgs) => {
  const method = request.method;

  try {
    if (method === "POST") {
      const body = await request.json();
      const {
        shopId,
        shopifyProductId,
        shopifyVariantId,
        shopifyProductTitle,
        shopifyProductImageUrl,
        pointsCost,
        isActive = true,
      } = body;
      const done = log.request("POST", { shopId, shopifyProductId, pointsCost });

      if (!shopId || !shopifyProductId || !shopifyVariantId || !shopifyProductTitle || pointsCost === undefined) {
        done(400, "missing required fields");
        return Response.json(
          { error: "shopId, shopifyProductId, shopifyVariantId, shopifyProductTitle, and pointsCost are required" },
          { status: 400 }
        );
      }

      // Upsert: if this variant is already configured for this shop, update it
      const rewardProduct = await prisma.rewardProduct.upsert({
        where: { shopId_shopifyVariantId: { shopId, shopifyVariantId } },
        create: {
          shopId,
          shopifyProductId,
          shopifyVariantId,
          shopifyProductTitle,
          shopifyProductImageUrl: shopifyProductImageUrl || null,
          pointsCost: parseInt(pointsCost),
          isActive,
        },
        update: {
          shopifyProductId,
          shopifyProductTitle,
          shopifyProductImageUrl: shopifyProductImageUrl || null,
          pointsCost: parseInt(pointsCost),
          isActive,
        },
      });

      done(201, `upserted id=${rewardProduct.id}`);
      return Response.json(serialize({ rewardProduct, message: "Reward product saved successfully" }), { status: 201 });
    }

    if (method === "PUT") {
      const body = await request.json();
      const { id, pointsCost, isActive, shopifyProductImageUrl } = body;
      const done = log.request("PUT", { id });

      if (!id) {
        done(400, "missing id");
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      const rewardProduct = await prisma.rewardProduct.update({
        where: { id },
        data: {
          ...(pointsCost !== undefined && { pointsCost: parseInt(pointsCost) }),
          ...(isActive !== undefined && { isActive }),
          ...(shopifyProductImageUrl !== undefined && { shopifyProductImageUrl }),
        },
      });

      done(200, `updated id=${id}`);
      return Response.json(serialize({ rewardProduct, message: "Reward product updated successfully" }));
    }

    if (method === "DELETE") {
      const body = await request.json();
      const { id } = body;
      const done = log.request("DELETE", { id });

      if (!id) {
        done(400, "missing id");
        return Response.json({ error: "id is required" }, { status: 400 });
      }

      await prisma.rewardProduct.delete({ where: { id } });
      done(200, `deleted id=${id}`);
      return Response.json({ message: "Reward product deleted successfully" });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    log.error("Action error:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
};
