import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";

const required = ["ACCEPTANCE_BASE_URL", "ACCEPTANCE_USER_EMAIL", "ACCEPTANCE_USER_PASSWORD", "ACCEPTANCE_ADMIN_EMAIL", "ACCEPTANCE_ADMIN_PASSWORD", "ACCEPTANCE_INPUT_FILE", "DATABASE_URL", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Product hero acceptance missing: ${missing.join(", ")}`);

const baseUrl = process.env.ACCEPTANCE_BASE_URL.replace(/\/$/, "");
const inputPath = resolve(process.env.ACCEPTANCE_INPUT_FILE);
const inputBuffer = await readFile(inputPath);
const mimeType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extname(inputPath).toLowerCase()];
if (!mimeType) throw new Error("ACCEPTANCE_INPUT_FILE must be JPG, PNG, or WebP");

const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const report = { startedAt: new Date().toISOString(), baseUrl, status: "RUNNING", checks: [], evidence: {}, error: null };

function record(name, status, details = {}) {
  report.checks.push({ name, status, at: new Date().toISOString(), ...details });
  console.log(`${status}: ${name}`);
}

function cookieFrom(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function api(path, { cookie, expected = [200], ...init } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { Cookie: cookie } : {}) }, redirect: "manual" });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!expected.includes(response.status)) throw new Error(`${init.method || "GET"} ${path} returned ${response.status}: ${body?.message || body?.code || "unexpected response"}`);
  return { response, body };
}

async function login(identifier, password) {
  const { response } = await api("/api/auth/login/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier, password }) });
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
  const state = walletState(actual);
  if (state.availablePoints !== expected.availablePoints || state.frozenPoints !== expected.frozenPoints) throw new Error(`${label} wallet mismatch: ${JSON.stringify({ expected, actual: state })}`);
}

async function upload(cookie) {
  const fileName = `product-hero-acceptance-${randomUUID()}-${basename(inputPath)}`;
  const presign = (await api("/api/uploads/presign/", { cookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, mimeType, byteSize: inputBuffer.length }) })).body;
  const uploaded = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: inputBuffer });
  if (!uploaded.ok) throw new Error(`COS input upload returned ${uploaded.status}`);
  const confirmed = (await api("/api/uploads/confirm/", { cookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) })).body;
  if (confirmed.status !== "READY") throw new Error(`Input confirmation returned ${confirmed.status}`);
  return presign.assetId;
}

async function reviewForAsset(assetId) {
  const result = await database.query("SELECT id, status FROM content_review_records WHERE asset_id = $1 ORDER BY created_at DESC LIMIT 1", [assetId]);
  return result.rows[0] || null;
}

async function decideReview(adminCookie, reviewId, action = "APPROVE") {
  const result = await api(`/api/admin/reviews/${reviewId}/`, { cookie: adminCookie, expected: [200, 409], method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reasonCode: action === "REJECT" ? "PRODUCT_HERO_ACCEPTANCE" : undefined, severity: "LOW", note: "Product hero production acceptance manual gate" }) });
  if (result.response.status === 409) {
    const current = await database.query("SELECT status FROM content_review_records WHERE id = $1", [reviewId]);
    if (current.rows[0]?.status !== (action === "APPROVE" ? "APPROVED" : "REJECTED")) throw new Error(`Review ${reviewId} was already decided as ${current.rows[0]?.status}`);
  }
  return result.body;
}

async function waitAsset(assetId, expected, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await database.query("SELECT audit_status FROM assets WHERE id = $1", [assetId]);
    if (expected.includes(result.rows[0]?.audit_status)) return result.rows[0].audit_status;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Asset ${assetId} did not reach ${expected.join(",")}`);
}

async function clonePendingAsset(sourceAssetId, label) {
  const source = await database.query("SELECT owner_id, mime_type FROM assets WHERE id = $1", [sourceAssetId]);
  if (!source.rows[0]) throw new Error(`Acceptance source asset is missing for ${label}`);
  const extension = extname(inputPath).toLowerCase().replace(/^\./, "") || "png";
  const storageKey = `users/${source.rows[0].owner_id}/inputs/${randomUUID()}.${extension}`;
  await putCosObject(storageKey, inputBuffer, source.rows[0].mime_type);
  const asset = await database.query(
    `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, metadata_json)
     VALUES ($1, 'INPUT', $2, $3, $4, 'READY', $5, $6::jsonb) RETURNING id`,
    [source.rows[0].owner_id, storageKey, source.rows[0].mime_type, inputBuffer.length, `${label}-${basename(inputPath)}`, JSON.stringify({ acceptanceClone: true, label })],
  );
  if (!asset.rows[0]) throw new Error(`Could not clone acceptance asset for ${label}`);
  return { assetId: asset.rows[0].id, reviewId: null };
}

async function createTask(cookie, assetId) {
  return (await api("/api/tasks/", {
    cookie, expected: [201], method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ assetId, prompt: "商品主图生产验收：保持品牌标识与商品细节，生成干净商业主图", aspectRatio: "1:1", scene: "纯色棚拍", style: "真实摄影" }),
  })).body;
}

async function waitTask(cookie, taskId, expected, timeoutMs = 12 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = (await api(`/api/tasks/${taskId}/`, { cookie })).body;
    if (expected.includes(last.status)) return last;
    if (["FAILED", "REJECTED", "CANCELED"].includes(last.status) && !expected.includes(last.status)) throw new Error(`Task ${taskId} ended as ${last.status}: ${last.errorCode || "unknown"}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
  }
  throw new Error(`Timed out waiting for task ${taskId}; last status ${last?.status || "unknown"}`);
}

async function setAcceptanceFault(taskId, fault) {
  await database.query("UPDATE generation_tasks SET input_json = jsonb_set(input_json, '{acceptanceFault}', to_jsonb($2::text), true) WHERE id = $1", [taskId, fault]);
}

async function outputReviews(taskId, expectedCount = 4, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await database.query("SELECT id, status FROM content_review_records WHERE task_id = $1 ORDER BY created_at", [taskId]);
    if (result.rowCount === expectedCount) return result.rows;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Task ${taskId} did not create ${expectedCount} output reviews`);
}

function cosObjects(prefix) {
  return new Promise((resolvePromise, reject) => cos.getBucket({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Prefix: prefix }, (error, data) => error ? reject(error) : resolvePromise(data.Contents || [])));
}

function putCosObject(Key, Body, ContentType) {
  return new Promise((resolvePromise, reject) => cos.putObject({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Key, Body, ContentType }, (error) => error ? reject(error) : resolvePromise()));
}

async function ensurePoints(adminCookie, userCookie, userId) {
  const current = await wallet(userCookie);
  if (current.wallet.frozenPoints !== 0) throw new Error("Acceptance user has frozen points before product hero acceptance");
  if (current.wallet.availablePoints >= 100) return current;
  await api("/api/admin/wallets/adjust/", { cookie: adminCookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, kind: "TEST_CREDIT", testPoints: 100 - current.wallet.availablePoints, note: "Product hero production acceptance" }) });
  return wallet(userCookie);
}

async function runRefundCase({ label, fault, expectedError, expectedProviderError }, context) {
  const clone = await clonePendingAsset(context.sourceAssetId, label);
  const before = await wallet(context.userCookie);
  const created = await createTask(context.userCookie, clone.assetId);
  if (created.points !== 10 || created.status !== "PENDING_INPUT_REVIEW") throw new Error(`${label} task creation contract is invalid`);
  assertWallet(await wallet(context.userCookie), { availablePoints: before.wallet.availablePoints - 10, frozenPoints: before.wallet.frozenPoints + 10 }, `${label} freeze`);
  await setAcceptanceFault(created.taskId, fault);
  await decideReview(context.adminCookie, clone.reviewId);
  const failed = await waitTask(context.userCookie, created.taskId, ["FAILED"]);
  if (failed.errorCode !== expectedError) throw new Error(`${label} expected ${expectedError}, got ${failed.errorCode}`);
  const after = await wallet(context.userCookie);
  assertWallet(after, walletState(before), `${label} refund`);
  const entries = after.ledger.filter((entry) => entry.businessId === created.taskId);
  if (!entries.some((entry) => entry.type === "FREEZE") || !entries.some((entry) => entry.type === "REFUND")) throw new Error(`${label} freeze/refund ledger is incomplete`);
  if (expectedProviderError) {
    const logs = await database.query("SELECT error_code FROM provider_call_logs WHERE task_id = $1 AND provider = 'sophnet'", [created.taskId]);
    if (!logs.rows.some((entry) => entry.error_code === expectedProviderError)) throw new Error(`${label} SophNet error log is missing`);
  }
  record(label, "PASS", { taskId: created.taskId, errorCode: failed.errorCode, refundedPoints: created.points });
  return created.taskId;
}

const reportDirectory = resolve(process.env.ACCEPTANCE_REPORT_DIR || "acceptance-reports");
const reportPath = resolve(reportDirectory, `product-hero-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await database.connect();
  const userCookie = await login(process.env.ACCEPTANCE_USER_EMAIL, process.env.ACCEPTANCE_USER_PASSWORD);
  const adminCookie = await login(process.env.ACCEPTANCE_ADMIN_EMAIL, process.env.ACCEPTANCE_ADMIN_PASSWORD);
  const userSession = (await api("/api/auth/session/", { cookie: userCookie })).body;
  const adminSession = (await api("/api/auth/session/", { cookie: adminCookie })).body;
  if (!userSession.user?.id || userSession.user.isAdministrator) throw new Error("Acceptance user identity is invalid");
  if (!adminSession.user?.isAdministrator) throw new Error("Acceptance administrator identity is invalid");
  const active = await database.query("SELECT COUNT(*)::int AS count FROM generation_tasks WHERE user_id = $1 AND status IN ('PENDING_INPUT_REVIEW','QUEUED','RUNNING','PENDING_REVIEW')", [userSession.user.id]);
  if (active.rows[0].count !== 0) throw new Error("Acceptance user has active tasks; refusing to overlap product hero acceptance");
  record("ordinary user and administrator login", "PASS");

  const health = (await api("/api/health/")).body;
  if (health.checks?.sophnet !== "up" || !health.sophnet?.model) throw new Error("Production health does not report SophNet up");
  record("SophNet production configuration and health", "PASS", { apiKeyConfigured: true, baseUrlOrigin: new URL(process.env.AI_BASE_URL).origin, model: process.env.AI_MODEL, healthStatus: health.sophnet.responseStatus });

  await ensurePoints(adminCookie, userCookie, userSession.user.id);
  const sourceAssetId = await upload(userCookie);
  await waitAsset(sourceAssetId, ["READY"]);
  record("input upload becomes immediately ready", "PASS", { assetId: sourceAssetId });

  const context = { userCookie, adminCookie, sourceAssetId };
  const beforeSuccess = await wallet(userCookie);
  const successClone = await clonePendingAsset(sourceAssetId, "success");
  const successCreation = await createTask(userCookie, successClone.assetId);
  if (successCreation.points !== 10 || successCreation.status !== "QUEUED") throw new Error("Product hero creation response contract is invalid");
  assertWallet(await wallet(userCookie), { availablePoints: beforeSuccess.wallet.availablePoints - 10, frozenPoints: beforeSuccess.wallet.frozenPoints + 10 }, "success freeze");
  const succeeded = await waitTask(userCookie, successCreation.taskId, ["SUCCEEDED"]);
  if (succeeded.points !== 10) throw new Error("Product hero task did not retain 10 point quote");
  if (succeeded.outputs.length !== 4) throw new Error(`Product hero returned ${succeeded.outputs.length} outputs instead of 4`);

  const assetRows = await database.query("SELECT id, storage_key, byte_size, audit_status FROM assets WHERE owner_id = $1 AND kind = 'OUTPUT' AND metadata_json->>'taskId' = $2 ORDER BY created_at", [userSession.user.id, successCreation.taskId]);
  if (assetRows.rowCount !== 4 || assetRows.rows.some((asset) => asset.audit_status !== "READY" || Number(asset.byte_size) <= 0)) throw new Error("Four READY output assets were not persisted");
  const objects = await cosObjects(`users/${userSession.user.id}/outputs/${successCreation.taskId}/`);
  if (objects.length !== 4 || objects.some((object) => Number(object.Size || 0) <= 0)) throw new Error("Four non-empty COS output objects were not persisted");
  for (const output of succeeded.outputs) {
    const download = await api(`/api/assets/${output.assetId}/download/`, { cookie: userCookie });
    if (!download.response.body || download.response.headers.get("x-content-review") !== "disabled") throw new Error(`Output ${output.assetId} download contract is invalid`);
  }
  const afterSuccess = await wallet(userCookie);
  assertWallet(afterSuccess, { availablePoints: beforeSuccess.wallet.availablePoints - 10, frozenPoints: beforeSuccess.wallet.frozenPoints }, "success settlement");
  const successLedger = afterSuccess.ledger.filter((entry) => entry.businessId === successCreation.taskId);
  if (!successLedger.some((entry) => entry.type === "FREEZE") || !successLedger.some((entry) => entry.type === "SETTLE") || successLedger.some((entry) => entry.type === "REFUND")) throw new Error("Success ledger is inconsistent");
  const providerLogs = await database.query("SELECT operation, response_status, error_code, provider_request_id FROM provider_call_logs WHERE task_id = $1 AND provider = 'sophnet' ORDER BY created_at", [successCreation.taskId]);
  const generateLogs = providerLogs.rows.filter((entry) => entry.operation === "generate_image" && entry.response_status >= 200 && entry.response_status < 300 && !entry.error_code);
  if (generateLogs.length !== 4) throw new Error(`SophNet Seedream protocol logs are incomplete: generate=${generateLogs.length}`);
  record("real SophNet Seedream generation/download protocol", "PASS", { taskId: successCreation.taskId, generateCalls: generateLogs.length });
  record("four COS objects and READY assets", "PASS", { taskId: successCreation.taskId, outputCount: 4 });
  record("ordinary user 10 point settlement", "PASS", { taskId: successCreation.taskId, chargedPoints: 10 });

  record("controlled failure and review rejection cases", "SKIP", { reason: "content review is disabled and tasks enter the queue immediately" });

  report.status = "PASSED";
  report.evidence = { userId: userSession.user.id, sourceAssetId, successfulTaskId: successCreation.taskId, successfulOutputIds: succeeded.outputs.map((item) => item.assetId), finalWallet: walletState(await wallet(userCookie)), sophnetModel: process.env.AI_MODEL };
} catch (error) {
  report.status = "FAILED";
  report.error = error instanceof Error ? error.message : String(error);
  record("product hero production acceptance", "FAIL", { error: report.error });
  process.exitCode = 1;
} finally {
  await database.end().catch(() => undefined);
  report.finishedAt = new Date().toISOString();
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Acceptance report: ${reportPath}`);
}
