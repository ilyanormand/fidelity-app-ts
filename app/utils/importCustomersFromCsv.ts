import prisma from "../db.server";
import { enqueueSyncBalance } from "../queues/shopify-sync.queue";

interface CsvRow {
  email: string;
  points: number;
  mission: number;
}

function parseCsv(csvText: string): CsvRow[] {
  const lines = csvText.trim().split("\n");
  return lines.slice(1).map((line) => {
    const [email, points, mission] = line.split(",");
    return {
      email: email.trim().toLowerCase(),
      points: parseInt(points.trim(), 10),
      mission: parseInt(mission.trim(), 10),
    };
  });
}

export interface ImportCsvResult {
  imported: number;
  notFound: number;
  total: number;
  errors: string[];
}

export async function importCustomersFromCsv(
  shopId: string,
  csvText: string
): Promise<ImportCsvResult> {
  const rows = parseCsv(csvText);
  let imported = 0;
  let notFound = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.email || isNaN(row.points)) {
      errors.push(`Skipped malformed row: ${JSON.stringify(row)}`);
      continue;
    }

    try {
      const customer = await prisma.customer.findFirst({
        where: { email: { equals: row.email, mode: "insensitive" }, shopId },
        include: {
          ledgerEntries: {
            where: { reason: "email_subscription_bonus" },
            take: 1,
          },
        },
      });

      if (!customer) {
        notFound++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            currentBalance: row.points,
            ...(row.mission === 1 && { emailMarketingConsent: "subscribed" }),
          },
        });

        await tx.ledger.create({
          data: {
            customerId: customer.id,
            amount: row.points,
            reason: "csv_import",
            metadata: {
              note: "Imported from FID CSV",
              sourcePoints: row.points,
              missionDone: row.mission === 1,
            },
          },
        });

        // If the newsletter mission is marked as done and no bonus entry exists yet,
        // insert a marker entry so the webhook never double-awards
        if (row.mission === 1 && customer.ledgerEntries.length === 0) {
          await tx.ledger.create({
            data: {
              customerId: customer.id,
              amount: 0,
              reason: "email_subscription_bonus",
              metadata: {
                note: "Newsletter mission already completed (imported from CSV)",
              },
            },
          });
        }
      });

      await enqueueSyncBalance(customer.shopifyCustomerId, row.points, shopId);
      imported++;
    } catch (err) {
      errors.push(`${row.email}: ${String(err)}`);
    }
  }

  return { imported, notFound, total: rows.length, errors };
}
