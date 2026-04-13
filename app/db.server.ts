import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  const connectionUrl = url
    ? `${url}${url.includes("?") ? "&" : "?"}connection_limit=25&pool_timeout=20`
    : url;
  return new PrismaClient({
    datasources: connectionUrl ? { db: { url: connectionUrl } } : undefined,
  });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
}

const prisma = global.prismaGlobal ?? createPrismaClient();

export default prisma;
