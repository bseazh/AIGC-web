import { Pool } from "pg";

declare global {
  var __balaDbPool: Pool | undefined;
}

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const db = global.__balaDbPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.__balaDbPool = db;
}
