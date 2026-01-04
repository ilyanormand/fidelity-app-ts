import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

// GET /api/customers - Get all customers or filter by shopId
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopId = url.searchParams.get("shopId");
  const customerId = url.searchParams.get("id");

  try {
    // Get single customer by ID
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          ledgerEntries: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          redemptions: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!customer) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      return Response.json({ customer });
    }

    // Get all customers (optionally filtered by shop)
    const customers = await prisma.customer.findMany({
      where: shopId ? { shopId } : undefined,
      include: {
        _count: {
          select: {
            ledgerEntries: true,
            redemptions: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({ customers, count: customers.length });
  } catch (error) {
    console.error("Error fetching customers:", error);
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

      if (!shopifyCustomerId || !shopId) {
        return Response.json(
          { error: "shopifyCustomerId and shopId are required" },
          { status: 400 }
        );
      }

      const customer = await prisma.customer.create({
        data: {
          shopifyCustomerId,
          shopId,
          currentBalance: currentBalance ?? 0,
          customerTags: customerTags ?? [],
        },
      });

      return Response.json({ customer, message: "Customer created" }, { status: 201 });
    }

    if (method === "PUT") {
      const body = await request.json();
      const { id, currentBalance, customerTags } = body;

      if (!id) {
        return Response.json({ error: "Customer id is required" }, { status: 400 });
      }

      const customer = await prisma.customer.update({
        where: { id },
        data: {
          ...(currentBalance !== undefined && { currentBalance }),
          ...(customerTags !== undefined && { customerTags }),
        },
      });

      return Response.json({ customer, message: "Customer updated" });
    }

    if (method === "DELETE") {
      const body = await request.json();
      const { id } = body;

      if (!id) {
        return Response.json({ error: "Customer id is required" }, { status: 400 });
      }

      await prisma.customer.delete({
        where: { id },
      });

      return Response.json({ message: "Customer deleted" });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error("Customer action error:", error);
    return Response.json({ error: "Action failed" }, { status: 500 });
  }
};

