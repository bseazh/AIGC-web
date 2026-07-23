import pg from "pg";

const [operation, status, ...message] = process.argv.slice(2);
if (!operation || !["SUCCEEDED", "FAILED"].includes(status)) {
  throw new Error("Usage: node scripts/record-operation.mjs <operation> <SUCCEEDED|FAILED> <summary>");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await pool.query("INSERT INTO operations_runs (operation, status, summary) VALUES ($1, $2, $3)", [operation, status, message.join(" ").slice(0, 2000)]);
} finally {
  await pool.end();
}
