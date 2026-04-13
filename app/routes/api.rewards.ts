import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { serialize } from "../utils/serialize";
import { createLogger } from "../utils/logger.server";

const log = createLogger("api:rewards");

// GET /api/rewards - Get all rewards for a shop
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shopId");
  const isActive = url.searchParams.get("isActive");
  const rewardId = url.searchParams.get("id");
  const done = log.request("GET", { shopId, id: rewardId, isActive });

  try {
    if (rewardId) {
      const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
      if (!reward) {
        done(404, "reward not found");
        return Response.json({ error: "Reward not found" }, { status: 404 });
      }
      done(200, `id=${rewardId}`);
      return Response.json(serialize({ reward }));
    }

    const rewards = await prisma.reward.findMany({
      where: {
        ...(shopId && { shopId }),
        ...(isActive !== null && isActive !== undefined && { isActive: isActive === "true" }),
      },
      orderBy: { createdAt: "desc" },
    });

    done(200, `${rewards.length} rewards`);
    return Response.json(serialize({ rewards, count: rewards.length }));
  } catch (error) {
    log.error("Error fetching rewards:", error);
    done(500);
    return Response.json({ error: "Failed to fetch rewards" }, { status: 500 });
  }
};

// POST /api/rewards - Create a new reward
// PUT /api/rewards - Update a reward
// DELETE /api/rewards - Delete a reward
export const action = async ({ request }: ActionFunctionArgs) => {
  const method = request.method;

  try {
    if (method === "POST") {
      const body = await request.json();
      const { shopId, name, description, imageUrl, pointsCost, discountType, discountValue, minimumCartValue, isActive = true } = body;
      const done = log.request("POST", { shopId, name, pointsCost, discountType });

      if (!shopId || !name || !pointsCost || !discountType || discountValue === undefined) {
        done(400, "missing required fields");
        return Response.json({ error: "shopId, name, pointsCost, discountType, and discountValue are required" }, { status: 400 });
      }

      if (!["percentage", "fixed_amount", "free_shipping"].includes(discountType)) {
        done(400, "invalid discountType");
        return Response.json({ error: "discountType must be 'percentage', 'fixed_amount', or 'free_shipping'" }, { status: 400 });
      }

      const reward = await prisma.reward.create({
        data: {
          shopId, name, description, imageUrl,
          pointsCost: parseInt(pointsCost),
          discountType,
          discountValue: parseInt(discountValue),
          minimumCartValue: minimumCartValue ? parseInt(minimumCartValue) : null,
          isActive,
        },
      });

      done(201, `created id=${reward.id} pts=${reward.pointsCost}`);
      return Response.json(serialize({ reward, message: "Reward created successfully" }), { status: 201 });
    }

    if (method === "PUT") {
      const body = await request.json();
      const { id, name, description, imageUrl, pointsCost, discountType, discountValue, minimumCartValue, isActive } = body;
      const done = log.request("PUT", { id });

      if (!id) {
        done(400, "missing id");
        return Response.json({ error: "Reward id is required" }, { status: 400 });
      }

      const reward = await prisma.reward.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(pointsCost !== undefined && { pointsCost: parseInt(pointsCost) }),
          ...(discountType !== undefined && { discountType }),
          ...(discountValue !== undefined && { discountValue: parseInt(discountValue) }),
          ...(minimumCartValue !== undefined && { minimumCartValue: minimumCartValue ? parseInt(minimumCartValue) : null }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      done(200, `updated id=${id}`);
      return Response.json(serialize({ reward, message: "Reward updated successfully" }));
    }

    if (method === "DELETE") {
      const body = await request.json();
      const { id } = body;
      const done = log.request("DELETE", { id });

      if (!id) {
        done(400, "missing id");
        return Response.json({ error: "Reward id is required" }, { status: 400 });
      }

      await prisma.reward.delete({ where: { id } });
      done(200, `deleted id=${id}`);
      return Response.json({ message: "Reward deleted successfully" });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    log.error("Action error:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
};

