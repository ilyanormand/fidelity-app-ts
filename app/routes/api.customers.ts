import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { serialize } from "../utils/serialize";
import { createLogger } from "../utils/logger.server";

const log = createLogger("api:customers");

// GET /api/customers - Get all customers or filter by shopId
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shopId");
  const customerId = url.searchParams.get("id");
  const done = log.request("GET", { shopId, id: customerId });

  try {
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          ledgerEntries: { orderBy: { createdAt: "desc" }, take: 10 },
          redemptions: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });

      if (!customer) {
        done(404, "customer not found");
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      done(200, `id=${customerId}`);
      return Response.json(serialize({ customer }));
    }

    const customers = await prisma.customer.findMany({
      where: shopId ? { shopId } : undefined,
      include: { _count: { select: { ledgerEntries: true, redemptions: true } } },
      orderBy: { updatedAt: "desc" },
    });

    done(200, `${customers.length} customers`);
    return Response.json(serialize({ customers, count: customers.length }));
  } catch (error) {
    log.error("Error fetching customers:", error);
    done(500);
    return Response.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
};

// POST /api/customers - Create a new customer
// PUT /api/customers - Update a customer
// DELETE /api/customers - Delete a customer
export const action = async ({ request }: ActionFunctionArgs) => {
  const method = request.method;

  try {
    if (method === "POST") {
      const body = await request.json();
      const { shopifyCustomerId, shopId, currentBalance, customerTags } = body;
      const done = log.request("POST", { shopifyCustomerId, shopId });

      if (!shopifyCustomerId || !shopId) {
        done(400, "missing required fields");
        return Response.json({ error: "shopifyCustomerId and shopId are required" }, { status: 400 });
      }

      const customer = await prisma.customer.create({
        data: { shopifyCustomerId, shopId, currentBalance: currentBalance ?? 0, customerTags: customerTags ?? [] },
      });

      done(201, `created id=${customer.id}`);
      return Response.json({ customer, message: "Customer created" }, { status: 201 });
    }

    if (method === "PUT") {
      const body = await request.json();
      const { id, currentBalance, customerTags } = body;
      const done = log.request("PUT", { id });

      if (!id) {
        done(400, "missing id");
        return Response.json({ error: "Customer id is required" }, { status: 400 });
      }

      const customer = await prisma.customer.update({
        where: { id },
        data: {
          ...(currentBalance !== undefined && { currentBalance }),
          ...(customerTags !== undefined && { customerTags }),
        },
      });

      done(200, `balance=${customer.currentBalance}`);
      return Response.json({ customer, message: "Customer updated" });
    }

    if (method === "DELETE") {
      const body = await request.json();
      const { id } = body;
      const done = log.request("DELETE", { id });

      if (!id) {
        done(400, "missing id");
        return Response.json({ error: "Customer id is required" }, { status: 400 });
      }

      await prisma.customer.delete({ where: { id } });
      done(200, `deleted id=${id}`);
      return Response.json({ message: "Customer deleted" });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    log.error("Action error:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
};

