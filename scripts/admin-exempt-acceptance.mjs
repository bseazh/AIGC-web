import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const required = ["ACCEPTANCE_BASE_URL", "ACCEPTANCE_ADMIN_EMAIL", "ACCEPTANCE_ADMIN_PASSWORD", "ACCEPTANCE_INPUT_FILE", "DATABASE_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Administrator exempt acceptance missing: ${missing.join(", ")}`);

const baseUrl = process.env.ACCEPTANCE_BASE_URL.replace(/\/$/, "");
const inputPath = resolve(process.env.ACCEPTANCE_INPUT_FILE);
const inputBuffer = await readFile(inputPath);
const mimeType = ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" })[extname(inputPath).toLowerCase()];
if (!mimeType) throw new Error("ACCEPTANCE_INPUT_FILE must be JPG, PNG, or WebP");

const report = { startedAt: new Date().toISOString(), baseUrl, status: "RUNNING", checks: [], evidence: {}, error: null };
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });

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

async function login() {
  const { response } = await api("/api/auth/login/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: process.env.ACCEPTANCE_ADMIN_EMAIL, password: process.env.ACCEPTANCE_ADMIN_PASSWORD }) });
  const cookie = cookieFrom(response);
  if (!cookie) throw new Error("Administrator login did not issue a session cookie");
  return cookie;
}

async function wallet(cookie) {
  return (await api("/api/wallet/", { cookie })).body;
}

function walletState(value) {
  return { availablePoints: value.wallet.availablePoints, frozenPoints: value.wallet.frozenPoints };
}

function assertWalletUnchanged(before, after, label) {
  const left = walletState(before);
  const right = walletState(after);
  if (left.availablePoints !== right.availablePoints || left.frozenPoints !== right.frozenPoints) throw new Error(`${label} changed administrator wallet: ${JSON.stringify({ before: left, after: right })}`);
}

async function upload(cookie, label) {
  const fileName = `${label}-${randomUUID()}-${basename(inputPath)}`;
  const presign = (await api("/api/uploads/presign/", { cookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, mimeType, byteSize: inputBuffer.length }) })).body;
  const uploaded = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: inputBuffer });
  if (!uploaded.ok) throw new Error(`COS upload returned ${uploaded.status}`);
  const confirmed = (await api("/api/uploads/confirm/", { cookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) })).body;
  if (confirmed.status !== "READY") throw new Error(`Upload ${label} returned ${confirmed.status}`);
  return presign.assetId;
}

async function createTask(cookie, assetId) {
  return (await api("/api/tasks/product-ad-video/", {
    cookie, expected: [201], method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ assetIds: [assetId], prompt: "管理员免积分生产验收", aspectRatio: "9:16", duration: 5, resolution: "480p", scene: "产品广告大片", style: "商业广告" }),
  })).body;
}

async function verifiedCreation(cookie, assetId, label) {
  const before = await wallet(cookie);
  const created = await createTask(cookie, assetId);
  const after = await wallet(cookie);
  assertWalletUnchanged(before, after, `${label} creation`);
  if (!created.adminExempt) throw new Error(`${label} task response is not marked adminExempt`);
  const ledger = after.ledger.find((entry) => entry.businessId === created.taskId);
  if (!ledger || ledger.type !== "ADMIN_EXEMPT_TASK" || ledger.businessType !== "ADMIN_EXEMPT_TASK" || ledger.amount !== 0) throw new Error(`${label} ADMIN_EXEMPT_TASK ledger is missing or invalid`);
  const detail = (await api(`/api/tasks/${created.taskId}/`, { cookie })).body;
  if (!detail.adminExempt || detail.points !== created.points || detail.points <= 0) throw new Error(`${label} task did not retain quoted cost`);
  return { created, before, detail };
}

async function activeReviews(cookie) {
  return (await api("/api/admin/reviews/", { cookie })).body.reviews || [];
}

async function waitActiveReview(cookie, predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await activeReviews(cookie)).find(predicate);
    if (found) return found;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error("Timed out waiting for an active content review before automatic moderation decided it");
}

async function decideReview(cookie, reviewId, action) {
  return (await api(`/api/admin/reviews/${reviewId}/`, { cookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reasonCode: action === "REJECT" ? "ADMIN_EXEMPT_ACCEPTANCE" : undefined, severity: "LOW", note: "Administrator exempt production acceptance" }) })).body;
}

async function waitTask(cookie, taskId, expected, timeoutMs = 25 * 60_000) {
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

async function resetAdministratorWallet(userId) {
  await database.query("BEGIN");
  try {
    const active = await database.query("SELECT COUNT(*)::int AS count FROM generation_tasks WHERE user_id = $1 AND status IN ('PENDING_INPUT_REVIEW','QUEUED','RUNNING','PENDING_REVIEW')", [userId]);
    if (active.rows[0].count !== 0) throw new Error("Acceptance administrator has active tasks; refusing to reset wallet");
    const found = await database.query("SELECT available_points, frozen_points FROM wallets WHERE user_id = $1 FOR UPDATE", [userId]);
    const previous = found.rows[0];
    if (!previous) throw new Error("Acceptance administrator wallet is missing");
    if (previous.frozen_points !== 0) throw new Error("Acceptance administrator has frozen points; refusing to reset wallet");
    await database.query("UPDATE wallets SET available_points = 0, version = version + 1, updated_at = NOW() WHERE user_id = $1", [userId]);
    await database.query(
      "INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'ADMIN_ACCEPTANCE_RESET', $2, 0, 'ADMIN_ACCEPTANCE_RESET', $3, $4)",
      [userId, -previous.available_points, "admin-exempt-production-acceptance", `admin-acceptance-reset:${randomUUID()}`],
    );
    await database.query("COMMIT");
    return previous.available_points;
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
}

const reportDirectory = resolve(process.env.ACCEPTANCE_REPORT_DIR || "acceptance-reports");
const reportPath = resolve(reportDirectory, `admin-exempt-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  await database.connect();
  const cookie = await login();
  const session = (await api("/api/auth/session/", { cookie })).body;
  if (!session.user?.id || !session.user?.isAdministrator) throw new Error("Acceptance account is not an administrator");
  if (process.env.ADMIN_EXEMPT_UI_LABEL_PRESENT !== "true") throw new Error("Deployed production assets do not contain the administrator exempt UI label");
  record("administrator identity and deployed UI label", "PASS", { userId: session.user.id, label: "管理员免积分" });

  const previousBalance = await resetAdministratorWallet(session.user.id);
  const zeroWallet = await wallet(cookie);
  if (zeroWallet.wallet.availablePoints !== 0 || zeroWallet.wallet.frozenPoints !== 0) throw new Error("Administrator wallet was not reset to zero");
  record("administrator real wallet reset to zero", "PASS", { previousBalance });

  record("administrator exempt cancellation", "SKIP", { reason: "content review is disabled and tasks enter the queue immediately" });
  record("administrator exempt review failure cases", "SKIP", { reason: "content review is disabled" });

  const successAsset = await upload(cookie, "success");
  const successCase = await verifiedCreation(cookie, successAsset, "success");
  const succeeded = await waitTask(cookie, successCase.created.taskId, ["SUCCEEDED"]);
  if (!succeeded.outputs.length) throw new Error("Administrator exempt success task has no outputs");
  assertWalletUnchanged(successCase.before, await wallet(cookie), "success settlement");
  record("administrator exempt successful settlement", "PASS", { taskId: successCase.created.taskId, quotedPoints: succeeded.points, outputCount: succeeded.outputs.length });

  const finalWallet = await wallet(cookie);
  const taskIds = [successCase.created.taskId];
  const exemptEntries = finalWallet.ledger.filter((entry) => taskIds.includes(entry.businessId) && entry.type === "ADMIN_EXEMPT_TASK");
  const unexpectedEntries = finalWallet.ledger.filter((entry) => taskIds.includes(entry.businessId) && ["FREEZE", "SETTLE", "REFUND"].includes(entry.type));
  if (exemptEntries.length !== 1 || unexpectedEntries.length) throw new Error("Final administrator ledger audit is inconsistent");
  if (finalWallet.wallet.availablePoints !== 0 || finalWallet.wallet.frozenPoints !== 0) throw new Error("Final administrator wallet is not zero and unfrozen");
  record("final wallet and ADMIN_EXEMPT_TASK audit", "PASS", { exemptEntries: exemptEntries.length, wallet: finalWallet.wallet });

  report.status = "PASSED";
  report.evidence = { administratorId: session.user.id, taskIds, finalWallet: finalWallet.wallet, quotedPoints: successCase.created.points };
} catch (error) {
  report.status = "FAILED";
  report.error = error instanceof Error ? error.message : String(error);
  record("administrator exempt production acceptance", "FAIL", { error: report.error });
  process.exitCode = 1;
} finally {
  await database.end().catch(() => undefined);
  report.finishedAt = new Date().toISOString();
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Acceptance report: ${reportPath}`);
}
