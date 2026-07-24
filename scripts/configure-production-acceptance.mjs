import pg from "pg";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

const required = ["DATABASE_URL", "ACCEPTANCE_USER_EMAIL", "ACCEPTANCE_USER_PASSWORD", "ACCEPTANCE_ADMIN_EMAIL", "ACCEPTANCE_ADMIN_PASSWORD", "ADMIN_IDENTIFIERS"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Acceptance account configuration failed: missing ${missing.join(", ")}`);
if (!process.env.ADMIN_IDENTIFIERS.toLowerCase().split(",").map((value) => value.trim()).includes(process.env.ACCEPTANCE_ADMIN_EMAIL.toLowerCase())) {
  throw new Error("ACCEPTANCE_ADMIN_EMAIL must be included in ADMIN_IDENTIFIERS");
}
if (process.env.ACCEPTANCE_USER_EMAIL.toLowerCase() === process.env.ACCEPTANCE_ADMIN_EMAIL.toLowerCase()) throw new Error("Acceptance accounts must be isolated");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function upsertAccount(email, password, displayName) {
  const passwordHash = await hashPassword(password);
  const existing = await client.query("SELECT id FROM users WHERE LOWER(email) = $1 FOR UPDATE", [email.toLowerCase()]);
  const result = existing.rowCount
    ? await client.query("UPDATE users SET password_hash = $2, display_name = $3, status = 'ACTIVE', token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING id", [existing.rows[0].id, passwordHash, displayName])
    : await client.query("INSERT INTO users (email, password_hash, display_name, status) VALUES ($1, $2, $3, 'ACTIVE') RETURNING id", [email.toLowerCase(), passwordHash, displayName]);
  await client.query("INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [result.rows[0].id]);
  await client.query("INSERT INTO user_storage_quotas (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [result.rows[0].id]);
}

try {
  await client.query("BEGIN");
  await upsertAccount(process.env.ACCEPTANCE_ADMIN_EMAIL, process.env.ACCEPTANCE_ADMIN_PASSWORD, "生产验收管理员");
  await upsertAccount(process.env.ACCEPTANCE_USER_EMAIL, process.env.ACCEPTANCE_USER_PASSWORD, "生产隔离验收用户");
  await client.query("COMMIT");
  console.log("Production acceptance accounts configured");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
