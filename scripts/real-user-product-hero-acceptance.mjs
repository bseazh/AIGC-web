import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";

const required = [
  "REAL_USER_EMAIL",
  "REAL_USER_PASSWORD",
  "ACCEPTANCE_BASE_URL",
  "ACCEPTANCE_ADMIN_EMAIL",
  "ACCEPTANCE_ADMIN_PASSWORD",
  "DATABASE_URL",
  "COS_BUCKET",
  "COS_REGION",
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Real-user product hero acceptance missing: ${missing.join(", ")}`);
if (!process.env.REAL_USER_INPUT_FILE && !process.env.REAL_USER_INPUT_URL) {
  throw new Error("REAL_USER_INPUT_FILE or REAL_USER_INPUT_URL is required");
}

const baseUrl = process.env.ACCEPTANCE_BASE_URL.replace(/\/$/, "");
const realUserEmail = process.env.REAL_USER_EMAIL.trim().toLowerCase();
const fakeAcceptanceEmails = [process.env.ACCEPTANCE_USER_EMAIL, process.env.ACCEPTANCE_ADMIN_EMAIL]
  .filter(Boolean)
  .map((value) => value.trim().toLowerCase());
const suppressedRecipients = String(process.env.NOTIFICATION_SUPPRESSED_RECIPIENTS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(realUserEmail)) throw new Error("REAL_USER_EMAIL must be a valid email address");
if (realUserEmail.includes("production-acceptance-") || fakeAcceptanceEmails.includes(realUserEmail)) {
  throw new Error("REAL_USER_EMAIL must not use a production acceptance account");
}
if (suppressedRecipients.includes(realUserEmail)) throw new Error("REAL_USER_EMAIL is notification-suppressed and cannot prove email delivery");

const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function loadInput() {
  if (process.env.REAL_USER_INPUT_FILE) {
    const inputPath = resolve(process.env.REAL_USER_INPUT_FILE);
    const mimeType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extname(inputPath).toLowerCase()];
    if (!mimeType) throw new Error("REAL_USER_INPUT_FILE must be JPG, PNG, or WebP");
    return { buffer: await readFile(inputPath), mimeType, name: basename(inputPath), source: "PRODUCTION_FILE" };
  }
  const inputUrl = new URL(process.env.REAL_USER_INPUT_URL);
  if (inputUrl.protocol !== "https:") throw new Error("REAL_USER_INPUT_URL must use HTTPS");
  const response = await fetch(inputUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`REAL_USER_INPUT_URL returned ${response.status}`);
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!supportedTypes.has(mimeType)) throw new Error(`REAL_USER_INPUT_URL returned unsupported content type ${mimeType || "unknown"}`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 10 * 1024 * 1024) throw new Error("REAL_USER_INPUT_URL exceeds the 10 MB upload limit");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error("REAL_USER_INPUT_URL returned an empty or oversized image");
  const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : ".webp";
  return { buffer, mimeType, name: `authorized-product${extension}`, source: "HTTPS_URL" };
}

const input = await loadInput();
const inputBuffer = input.buffer;
const mimeType = input.mimeType;

const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const report = { startedAt: new Date().toISOString(), baseUrl, status: "RUNNING", checks: [], evidence: {}, error: null };
const reportPath = resolve(
  process.env.ACCEPTANCE_REPORT_DIR || "acceptance-reports",
  `real-user-product-hero-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
const emailVerificationRegistrationStartedAt = new Date("2026-07-20T09:18:31.000Z");
const agreementAuditStartedAt = new Date("2026-07-24T04:31:13.000Z");

function record(name, status, details = {}) {
  report.checks.push({ name, status, at: new Date().toISOString(), ...details });
  console.log(`${status}: ${name}`);
}

function cookieFrom(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function api(path, { cookie, expected = [200], ...init } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(cookie ? { Cookie: cookie } : {}) },
    redirect: "manual",
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!expected.includes(response.status)) {
    throw new Error(`${init.method || "GET"} ${path} returned ${response.status}: ${body?.message || body?.code || "unexpected response"}`);
  }
  return { response, body };
}

async function login(identifier, password) {
  const { response } = await api("/api/auth/login/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const cookie = cookieFrom(response);
  if (!cookie) throw new Error(`Login did not issue a session cookie for ${identifier}`);
  return cookie;
}

async function wallet(cookie) {
  return (await api("/api/wallet/", { cookie })).body;
}

function walletState(value) {
  return { availablePoints: value.wallet.availablePoints, frozenPoints: value.wallet.frozenPoints };
}

function assertWallet(actual, expected, label) {
  const current = walletState(actual);
  if (current.availablePoints !== expected.availablePoints || current.frozenPoints !== expected.frozenPoints) {
    throw new Error(`${label} wallet mismatch: ${JSON.stringify({ expected, actual: current })}`);
  }
}

async function upload(cookie) {
  const fileName = `real-user-product-hero-${randomUUID()}-${input.name}`;
  const presign = (await api("/api/uploads/presign/", {
    cookie,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, mimeType, byteSize: inputBuffer.length }),
  })).body;
  const uploaded = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: inputBuffer });
  if (!uploaded.ok) throw new Error(`COS input upload returned ${uploaded.status}`);
  const confirmed = (await api("/api/uploads/confirm/", {
    cookie,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId: presign.assetId }),
  })).body;
  if (confirmed.status !== "PENDING_REVIEW") throw new Error(`Input confirmation returned ${confirmed.status}`);
  return presign.assetId;
}

async function waitForReview(query, values, expectedCount = 1, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await database.query(query, values);
    if (result.rowCount === expectedCount) return result.rows;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Expected ${expectedCount} review records were not created`);
}

async function decideReview(adminCookie, reviewId, action) {
  return (await api(`/api/admin/reviews/${reviewId}/`, {
    cookie: adminCookie,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      severity: "LOW",
      note: action === "ESCALATE" ? "真实用户生产验收：转人工审核" : "真实用户生产验收：人工审核通过",
    }),
  })).body;
}

async function manuallyApprove(adminCookie, review) {
  if (!["PENDING", "NEEDS_MANUAL"].includes(review.status)) {
    throw new Error(`Review ${review.id} was decided before the manual acceptance gate: ${review.status}`);
  }
  if (review.status === "PENDING") await decideReview(adminCookie, review.id, "ESCALATE");
  const approved = await decideReview(adminCookie, review.id, "APPROVE");
  if (approved.status !== "APPROVED") throw new Error(`Review ${review.id} returned ${approved.status}`);
}

async function createTask(cookie, assetId) {
  return (await api("/api/tasks/", {
    cookie,
    expected: [201],
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      assetId,
      prompt: "真实用户商品主图验收：保持品牌标识与商品细节，生成干净商业主图",
      aspectRatio: "1:1",
      scene: "纯色棚拍",
      style: "真实摄影",
    }),
  })).body;
}

async function waitTask(cookie, taskId, expected, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = (await api(`/api/tasks/${taskId}/`, { cookie })).body;
    if (expected.includes(last.status)) return last;
    if (["FAILED", "REJECTED", "CANCELED"].includes(last.status)) {
      throw new Error(`Task ${taskId} ended as ${last.status}: ${last.errorCode || "unknown"}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
  }
  throw new Error(`Timed out waiting for task ${taskId}; last status ${last?.status || "unknown"}`);
}

function cosObjects(prefix) {
  return new Promise((resolvePromise, reject) => {
    cos.getBucket(
      { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Prefix: prefix },
      (error, data) => error ? reject(error) : resolvePromise(data.Contents || []),
    );
  });
}

async function waitNotification(taskId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const result = await database.query(
      "SELECT recipient, event_type, status, attempts, sent_at, last_error FROM notification_outbox WHERE idempotency_key = $1",
      [`task_completed:${taskId}`],
    );
    last = result.rows[0];
    if (last?.status === "SENT") return last;
    if (last?.status === "SUPPRESSED") throw new Error("Real-user completion email was suppressed");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`Completion email was not sent: ${last?.status || "missing"} ${last?.last_error || ""}`.trim());
}

try {
  await database.connect();
  const userCookie = await login(realUserEmail, process.env.REAL_USER_PASSWORD);
  const adminCookie = await login(process.env.ACCEPTANCE_ADMIN_EMAIL, process.env.ACCEPTANCE_ADMIN_PASSWORD);
  const userSession = (await api("/api/auth/session/", { cookie: userCookie })).body;
  const adminSession = (await api("/api/auth/session/", { cookie: adminCookie })).body;
  if (!userSession.user?.id || userSession.user.isAdministrator) throw new Error("REAL_USER_EMAIL must belong to an ordinary user");
  if (String(userSession.user.identifier || "").toLowerCase() !== realUserEmail) throw new Error("Authenticated user does not match REAL_USER_EMAIL");
  if (!adminSession.user?.isAdministrator) throw new Error("Acceptance administrator identity is invalid");

  const identity = await database.query(
    `SELECT u.created_at, u.status,
            EXISTS (SELECT 1 FROM audit_events a WHERE a.user_id = u.id AND a.event_type = 'AGREEMENTS_ACCEPTED') AS registered_through_public_flow
       FROM users u WHERE u.id = $1`,
    [userSession.user.id],
  );
  const registeredAt = identity.rows[0] ? new Date(identity.rows[0].created_at) : null;
  const legacyEmailRegistration = Boolean(
    registeredAt && registeredAt >= emailVerificationRegistrationStartedAt && registeredAt < agreementAuditStartedAt,
  );
  if (identity.rows[0]?.status !== "ACTIVE" || (!identity.rows[0]?.registered_through_public_flow && !legacyEmailRegistration)) {
    throw new Error("Real user was not created through the public email-verification registration flow");
  }
  const active = await database.query(
    "SELECT COUNT(*)::int AS count FROM generation_tasks WHERE user_id = $1 AND status IN ('PENDING_INPUT_REVIEW','QUEUED','RUNNING','PENDING_REVIEW')",
    [userSession.user.id],
  );
  if (active.rows[0].count !== 0) throw new Error("Real user has active tasks; refusing to overlap acceptance");
  const startingWallet = await wallet(userCookie);
  if (startingWallet.wallet.frozenPoints !== 0) throw new Error("Real user has frozen points before acceptance");
  record("real email registration and ordinary-user login", "PASS", {
    registeredAt: identity.rows[0].created_at,
    registrationEvidence: identity.rows[0].registered_through_public_flow ? "AGREEMENTS_ACCEPTED_AUDIT" : "LEGACY_EMAIL_VERIFICATION_WINDOW",
    emailDomain: realUserEmail.split("@")[1],
    emailFingerprint: createHash("sha256").update(realUserEmail).digest("hex").slice(0, 16),
  });

  const paymentEntry = (await api("/api/payments/wechat/")).body;
  if (paymentEntry.enabled) {
    record("WeChat payment production entry", "PASS", { enabled: true, packageCount: paymentEntry.packages?.length || 0 });
  } else {
    record("WeChat payment production entry", "SKIP", { enabled: false, reason: "Production merchant payment is not open; use the official recharge-code path" });
  }

  const recharge = (await api("/api/admin/recharge-codes/", {
    cookie: adminCookie,
    expected: [201],
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      points: 10,
      maxRedemptions: 1,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      note: "真实用户商品主图生产验收",
    }),
  })).body;
  const redeemed = (await api("/api/recharge-codes/redeem/", {
    cookie: userCookie,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: recharge.code }),
  })).body;
  await api("/api/admin/recharge-codes/", {
    cookie: adminCookie,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: recharge.id, status: "DISABLED" }),
  });
  if (redeemed.points !== 10) throw new Error(`Recharge code credited ${redeemed.points} instead of 10 points`);
  assertWallet(await wallet(userCookie), {
    availablePoints: startingWallet.wallet.availablePoints + 10,
    frozenPoints: startingWallet.wallet.frozenPoints,
  }, "official recharge code");
  const rechargeLedger = await database.query(
    "SELECT type, amount, balance_after FROM wallet_ledger WHERE user_id = $1 AND business_type = 'RECHARGE_CODE' AND business_id = $2",
    [userSession.user.id, recharge.id],
  );
  if (rechargeLedger.rowCount !== 1 || rechargeLedger.rows[0].type !== "CREDIT" || rechargeLedger.rows[0].amount !== 10) {
    throw new Error("Recharge-code wallet ledger is incomplete");
  }
  record("official recharge-code credit", "PASS", { rechargeCodeId: recharge.id, creditedPoints: 10 });

  const sourceAssetId = await upload(userCookie);
  const [sourceReview] = await waitForReview(
    "SELECT id, status FROM content_review_records WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1",
    [sourceAssetId],
  );
  await manuallyApprove(adminCookie, sourceReview);
  record("real upload and manual input review", "PASS", { assetId: sourceAssetId, reviewId: sourceReview.id, inputSource: input.source });

  const beforeTask = await wallet(userCookie);
  const created = await createTask(userCookie, sourceAssetId);
  if (created.points !== 10 || created.status !== "QUEUED" || created.adminExempt) {
    throw new Error(`Real-user task creation contract is invalid: ${JSON.stringify(created)}`);
  }
  assertWallet(await wallet(userCookie), {
    availablePoints: beforeTask.wallet.availablePoints - 10,
    frozenPoints: beforeTask.wallet.frozenPoints + 10,
  }, "real-user task freeze");
  record("real-user task creation and 10-point freeze", "PASS", { taskId: created.taskId, points: created.points });

  await waitTask(userCookie, created.taskId, ["PENDING_REVIEW"]);
  const outputReviews = await waitForReview(
    "SELECT id, status FROM content_review_records WHERE task_id = $1 ORDER BY created_at",
    [created.taskId],
    4,
  );
  for (const review of outputReviews) await manuallyApprove(adminCookie, review);
  const succeeded = await waitTask(userCookie, created.taskId, ["SUCCEEDED"]);
  if (succeeded.outputs.length !== 4) throw new Error(`Product hero returned ${succeeded.outputs.length} outputs instead of 4`);
  record("four manual output approvals", "PASS", { reviewIds: outputReviews.map((review) => review.id) });

  const assets = await database.query(
    "SELECT id, storage_key, byte_size, audit_status FROM assets WHERE owner_id = $1 AND kind = 'OUTPUT' AND metadata_json->>'taskId' = $2 ORDER BY created_at",
    [userSession.user.id, created.taskId],
  );
  if (assets.rowCount !== 4 || assets.rows.some((asset) => asset.audit_status !== "READY" || Number(asset.byte_size) <= 0)) {
    throw new Error("Four READY output assets were not persisted");
  }
  const objects = await cosObjects(`users/${userSession.user.id}/outputs/${created.taskId}/`);
  if (objects.length !== 4 || objects.some((object) => Number(object.Size || 0) <= 0)) {
    throw new Error("Four non-empty COS output objects were not persisted");
  }
  for (const output of succeeded.outputs) {
    const download = await api(`/api/assets/${output.assetId}/download/`, { cookie: userCookie });
    if (!download.response.body || download.response.headers.get("x-content-review") !== "approved") {
      throw new Error(`Output ${output.assetId} download contract is invalid`);
    }
  }
  record("four COS assets and authenticated downloads", "PASS", { outputAssetIds: succeeded.outputs.map((item) => item.assetId) });

  const finalWallet = await wallet(userCookie);
  assertWallet(finalWallet, walletState(startingWallet), "recharge and successful settlement net result");
  const taskLedger = finalWallet.ledger.filter((entry) => entry.business_id === created.taskId);
  if (!taskLedger.some((entry) => entry.type === "FREEZE") || !taskLedger.some((entry) => entry.type === "SETTLE") || taskLedger.some((entry) => entry.type === "REFUND")) {
    throw new Error("Real-user task wallet ledger is inconsistent");
  }
  record("ordinary-user successful 10-point settlement", "PASS", { chargedPoints: 10, finalWallet: walletState(finalWallet) });

  const notification = await waitNotification(created.taskId);
  if (notification.recipient.toLowerCase() !== realUserEmail || notification.event_type !== "TASK_COMPLETED") {
    throw new Error("Completion notification recipient or event is invalid");
  }
  record("real mailbox completion notification accepted by SMTP", "PASS", {
    status: notification.status,
    attempts: notification.attempts,
    sentAt: notification.sent_at,
  });

  report.status = "PASSED";
  report.evidence = {
    userId: userSession.user.id,
    fundingMethod: "RECHARGE_CODE",
    rechargeCodeId: recharge.id,
    sourceAssetId,
    taskId: created.taskId,
    outputAssetIds: succeeded.outputs.map((item) => item.assetId),
    chargedPoints: 10,
    finalWallet: walletState(finalWallet),
    notificationStatus: notification.status,
  };
} catch (error) {
  report.status = "FAILED";
  report.error = error instanceof Error ? error.message : String(error);
  record("real-user product hero production acceptance", "FAIL", { error: report.error });
  process.exitCode = 1;
} finally {
  await database.end().catch(() => undefined);
  report.finishedAt = new Date().toISOString();
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Acceptance report: ${reportPath}`);
}
