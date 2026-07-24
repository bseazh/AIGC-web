import COS from "cos-nodejs-sdk-v5";
import Redis from "ioredis";
import pg from "pg";

const required = ["DATABASE_URL", "REDIS_URL", "SESSION_SECRET", "EMAIL_CODE_SECRET", "PUBLIC_APP_URL", "ADMIN_IDENTIFIERS", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "ARK_API_KEY", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
const arkModel = process.env.ARK_MODEL || "doubao-seedance-2-0-260128";
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Production preflight failed: missing ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32 || process.env.EMAIL_CODE_SECRET.length < 32) throw new Error("Production preflight failed: session and email secrets must be at least 32 characters");
if (process.env.SESSION_SECRET === process.env.EMAIL_CODE_SECRET) throw new Error("Production preflight failed: SESSION_SECRET and EMAIL_CODE_SECRET must be different");
if (!process.env.PUBLIC_APP_URL.startsWith("https://")) throw new Error("Production preflight failed: PUBLIC_APP_URL must use HTTPS");
if (process.env.SESSION_COOKIE_SECURE === "false") throw new Error("Production preflight failed: secure session cookies cannot be disabled");
if (process.env.CONTENT_REVIEW_PROVIDER === "tencent-ci" && (!process.env.CONTENT_REVIEW_INTERNAL_SECRET || process.env.CONTENT_REVIEW_INTERNAL_SECRET.length < 32)) throw new Error("Production preflight failed: CONTENT_REVIEW_INTERNAL_SECRET must be at least 32 characters when Tencent CI moderation is enabled");
if (process.env.WECHAT_PAY_ENABLED === "true") {
  const paymentRequired = ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_APP_ID", "WECHAT_PAY_MERCHANT_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_PLATFORM_PUBLIC_KEY", "WECHAT_PAY_NOTIFY_URL", "WECHAT_PAY_REFUND_NOTIFY_URL"];
  const paymentMissing = paymentRequired.filter((name) => !process.env[name]);
  if (paymentMissing.length) throw new Error(`Production preflight failed: missing ${paymentMissing.join(", ")}`);
  console.log("WeChat Pay configuration: OK (enabled)");
} else {
  console.log("WeChat Pay configuration: disabled");
}

const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
try {
  const tables = ["users", "login_sessions", "generation_tasks", "assets", "content_review_records", "content_violations", "complaints", "audit_events", "notification_outbox", "payment_refunds", "payment_reconciliation_runs", "payment_reconciliation_items"];
  const result = await database.query("SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS requested(name)", [tables]);
  const absent = result.rows.filter((row) => !row.present).map((row) => row.name);
  if (absent.length) throw new Error(`Database schema is incomplete: ${absent.join(", ")}`);
} finally { await database.end(); }
console.log("PostgreSQL schema: OK");

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000 });
try {
  if (await redis.ping() !== "PONG") throw new Error("Redis did not return PONG");
} finally { redis.disconnect(); }
console.log("Redis access: OK");

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
await new Promise((resolve, reject) => cos.headBucket({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION }, (error) => error ? reject(error) : resolve()));
console.log("COS access: OK");

const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/models", {
  headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` },
});
if (!response.ok) throw new Error(`Ark credential check failed: HTTP ${response.status}`);
const payload = await response.json().catch(() => ({}));
const models = Array.isArray(payload?.data) ? payload.data.map((model) => model?.id) : [];
if (models.length && !models.includes(arkModel)) throw new Error(`Ark model is not enabled for this key: ${arkModel}`);
console.log(`Ark access: OK (${arkModel})`);
console.log("SMTP configuration: OK");
console.log("Preflight passed. Restart the worker, then run the full application acceptance.");
