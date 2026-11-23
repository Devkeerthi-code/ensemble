import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { PrismaClient } from "@/generated/prisma/client";
import { websocketTransport } from "./db-transport";
import { normalisePgUrl } from "./pg-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  const connectionString = normalisePgUrl(raw);
  if (websocketTransport()) {
    neonConfig.webSocketConstructor = ws;
    return new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** One client per process; reused across hot reloads in development. */
export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
