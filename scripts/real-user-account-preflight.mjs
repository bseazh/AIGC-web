import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

const required = ["DATABASE_URL", "REAL_USER_EMAIL", "ADMIN_IDENTIFIERS"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Real-user account preflight missing: ${missing.join(", ")}`);

const email = process.env.REAL_USER_EMAIL.trim().toLowerCase();
const administrators = process.env.ADMIN_IDENTIFIERS.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const suppressed = String(process.env.NOTIFICATION_SUPPRESSED_RECIPIENTS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const reportPath = resolve(process.env.ACCEPTANCE_REPORT_DIR || "acceptance-reports", "latest-real-user-account-preflight.json");
const emailVerificationRegistrationStartedAt = new Date("2026-07-20T09:18:31.000Z");
const agreementAuditStartedAt = new Date("2026-07-24T04:31:13.000Z");
const report = {
  generatedAt: new Date().toISOString(),
  status: "BLOCKED",
  identity: {
    emailDomain: email.split("@")[1] || null,
    emailFingerprint: createHash("sha256").update(email).digest("hex").slice(0, 16),
  },
  checks: {},
  blockers: [],
};

const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await database.connect();
  const result = await database.query(
    `SELECT u.id, u.status, u.created_at, w.available_points, w.frozen_points,
            EXISTS (SELECT 1 FROM audit_events a WHERE a.user_id = u.id AND a.event_type = 'AGREEMENTS_ACCEPTED') AS public_registration,
            (SELECT COUNT(*)::int FROM generation_tasks t WHERE t.user_id = u.id AND t.status IN ('PENDING_INPUT_REVIEW','QUEUED','RUNNING','PENDING_REVIEW')) AS active_tasks
       FROM users u JOIN wallets w ON w.user_id = u.id WHERE LOWER(u.email) = $1`,
    [email],
  );
  const account = result.rows[0];
  const registeredAt = account ? new Date(account.created_at) : null;
  const legacyEmailRegistration = Boolean(
    registeredAt && registeredAt >= emailVerificationRegistrationStartedAt && registeredAt < agreementAuditStartedAt,
  );
  const publicEmailRegistration = Boolean(account?.public_registration || legacyEmailRegistration);
  report.checks = {
    accountExists: Boolean(account),
    active: account?.status === "ACTIVE",
    ordinaryUser: Boolean(account) && !administrators.includes(email),
    publicEmailRegistration,
    notificationDeliveryEnabled: !suppressed.includes(email),
    noActiveTasks: Number(account?.active_tasks || 0) === 0,
  };
  for (const [name, passed] of Object.entries(report.checks)) if (!passed) report.blockers.push(name);
  report.status = report.blockers.length ? "BLOCKED" : "PASSED";
  report.account = account ? {
    userId: account.id,
    registeredAt: account.created_at,
    availablePoints: account.available_points,
    frozenPoints: account.frozen_points,
    activeTasks: account.active_tasks,
    registrationEvidence: account.public_registration ? "AGREEMENTS_ACCEPTED_AUDIT" : legacyEmailRegistration ? "LEGACY_EMAIL_VERIFICATION_WINDOW" : null,
  } : null;
} catch (error) {
  report.blockers.push("preflightError");
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await database.end().catch(() => undefined);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
  if (report.status !== "PASSED") process.exitCode = 1;
}
