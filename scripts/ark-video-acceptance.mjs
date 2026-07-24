import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";

const required = ["ACCEPTANCE_BASE_URL", "ACCEPTANCE_USER_EMAIL", "ACCEPTANCE_USER_PASSWORD", "ACCEPTANCE_ADMIN_EMAIL", "ACCEPTANCE_ADMIN_PASSWORD", "ACCEPTANCE_INPUT_FILE", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Application acceptance failed: missing ${missing.join(", ")}`);
if (process.env.ACCEPTANCE_USER_EMAIL.toLowerCase() === process.env.ACCEPTANCE_ADMIN_EMAIL.toLowerCase()) throw new Error("Acceptance user and administrator must be different accounts");

const baseUrl = process.env.ACCEPTANCE_BASE_URL.replace(/\/$/, "");
const inputPath = resolve(process.env.ACCEPTANCE_INPUT_FILE);
const inputBuffer = await readFile(inputPath);
const mimeByExtension = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const mimeType = mimeByExtension[extname(inputPath).toLowerCase()];
if (!mimeType) throw new Error("ACCEPTANCE_INPUT_FILE must be JPG, PNG, or WebP");
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
  if (!cookie) throw new Error("Login did not issue a session cookie");
  return cookie;
}

async function wallet(cookie) {
  return (await api("/api/wallet/", { cookie })).body;
}

async function decideReview(adminCookie, reviewId, action) {
  const result = await api(`/api/admin/reviews/${reviewId}/`, { cookie: adminCookie, expected: [200, 409], method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reasonCode: action === "REJECT" ? "ACCEPTANCE_TEST" : undefined, severity: "LOW", note: "Automated full-chain acceptance" }) });
  return { ...result.body, alreadyDecided: result.response.status === 409 };
}

async function activeReviews(adminCookie) {
  return (await api("/api/admin/reviews/", { cookie: adminCookie })).body.reviews || [];
}

async function decidedReviews(adminCookie) {
  const [approved, rejected] = await Promise.all([
    api("/api/admin/reviews/?status=APPROVED", { cookie: adminCookie }),
    api("/api/admin/reviews/?status=REJECTED", { cookie: adminCookie }),
  ]);
  return [...(approved.body.reviews || []), ...(rejected.body.reviews || [])];
}

async function waitForReview(adminCookie, predicate, timeoutMs = 25 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const review = (await activeReviews(adminCookie)).find(predicate);
    if (review) return review;
    const decided = (await decidedReviews(adminCookie)).find(predicate);
    if (decided) return decided;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
  }
  throw new Error("Timed out waiting for content review record");
}

async function waitTask(cookie, taskId, expected, timeoutMs = 25 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = (await api(`/api/tasks/${taskId}/`, { cookie })).body;
    if (expected.includes(last.status)) return last;
    if (["FAILED", "REJECTED", "CANCELED"].includes(last.status) && !expected.includes(last.status)) throw new Error(`Task ${taskId} ended as ${last.status}: ${last.errorCode || "unknown"}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5000));
  }
  throw new Error(`Timed out waiting for task ${taskId}; last status ${last?.status || "unknown"}`);
}

async function createTask(cookie, assetId) {
  return (await api("/api/tasks/product-ad-video/", {
    cookie, expected: [201], method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ assetIds: [assetId], prompt: "全链路验收：生成原创商品展示短视频", aspectRatio: "9:16", duration: 5, resolution: "480p", scene: "产品广告大片", style: "商业广告" }),
  })).body;
}

function cosObjects(prefix) {
  return new Promise((resolvePromise, reject) => cos.getBucket({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Prefix: prefix }, (error, data) => error ? reject(error) : resolvePromise(data.Contents || [])));
}

const reportDirectory = resolve(process.env.ACCEPTANCE_REPORT_DIR || "acceptance-reports");
const reportPath = resolve(reportDirectory, `application-chain-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

try {
  const userCookie = await login(process.env.ACCEPTANCE_USER_EMAIL, process.env.ACCEPTANCE_USER_PASSWORD);
  const adminCookie = await login(process.env.ACCEPTANCE_ADMIN_EMAIL, process.env.ACCEPTANCE_ADMIN_PASSWORD);
  const session = (await api("/api/auth/session/", { cookie: userCookie })).body;
  const adminSession = (await api("/api/auth/session/", { cookie: adminCookie })).body;
  if (!session.user?.id) throw new Error("Authenticated session did not return user id");
  if (!adminSession.user?.isAdministrator) throw new Error("Acceptance administrator does not have administrator access");
  record("user and administrator login", "PASS");

  const initialWallet = await wallet(userCookie);
  const minimumAcceptancePoints = 10_000;
  const grant = Math.max(100, minimumAcceptancePoints - initialWallet.wallet.availablePoints);
  await api("/api/admin/wallets/adjust/", { cookie: adminCookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: session.user.id, kind: "TEST_CREDIT", testPoints: grant, note: "Automated production full-chain acceptance" }) });
  const fundedWallet = await wallet(userCookie);
  if (fundedWallet.wallet.availablePoints < minimumAcceptancePoints || !fundedWallet.ledger.some((entry) => entry.business_type === "TEST_CREDIT")) throw new Error("Administrator test credit grant is missing");
  record("administrator grants isolated acceptance test points", "PASS", { grantedPoints: grant, availablePoints: fundedWallet.wallet.availablePoints });

  const codeCreation = (await api("/api/admin/recharge-codes/", { cookie: adminCookie, expected: [201], method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: 37, maxRedemptions: 1, note: "Automated production acceptance redemption" }) })).body;
  const walletBeforeCode = await wallet(userCookie);
  const redemption = (await api("/api/recharge-codes/redeem/", { cookie: userCookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: codeCreation.code }) })).body;
  if (redemption.balanceAfter !== walletBeforeCode.wallet.availablePoints + 37) throw new Error("Recharge code did not credit the expected points");
  await api("/api/recharge-codes/redeem/", { cookie: userCookie, expected: [409], method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: codeCreation.code }) });
  await api("/api/admin/recharge-codes/", { cookie: adminCookie, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: codeCreation.id, status: "DISABLED" }) });
  const disabledCode = (await api("/api/admin/recharge-codes/", { cookie: adminCookie, expected: [201], method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: 13, maxRedemptions: 1, note: "Automated production acceptance disabled code" }) })).body;
  await api("/api/admin/recharge-codes/", { cookie: adminCookie, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: disabledCode.id, status: "DISABLED" }) });
  await api("/api/recharge-codes/redeem/", { cookie: userCookie, expected: [400], method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: disabledCode.code }) });
  const walletAfterCode = await wallet(userCookie);
  if (!walletAfterCode.ledger.some((entry) => entry.business_id === codeCreation.id && entry.business_type === "RECHARGE_CODE")) throw new Error("Recharge code ledger entry is missing");
  record("recharge code redemption, duplicate denial and disable", "PASS", { codeId: codeCreation.id, points: 37 });

  const walletBefore = await wallet(userCookie);
  const presign = (await api("/api/uploads/presign/", { cookie: userCookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: basename(inputPath), mimeType, byteSize: inputBuffer.length }) })).body;
  const uploadResponse = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: inputBuffer });
  if (!uploadResponse.ok) throw new Error(`COS upload returned ${uploadResponse.status}`);
  const confirmation = (await api("/api/uploads/confirm/", { cookie: userCookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) })).body;
  if (confirmation.status !== "PENDING_REVIEW") throw new Error(`Upload bypassed review with status ${confirmation.status}`);
  record("upload transitions to PENDING_REVIEW", "PASS", { assetId: presign.assetId });

  const canceledCreation = await createTask(userCookie, presign.assetId);
  if (canceledCreation.status !== "PENDING_INPUT_REVIEW") throw new Error("Cancelable acceptance task did not wait for input review");
  const cancellation = (await api(`/api/tasks/${canceledCreation.taskId}/cancel/`, { cookie: userCookie, method: "POST" })).body;
  if (cancellation.status !== "CANCELED" || cancellation.refundedPoints !== canceledCreation.points) throw new Error("Task cancellation did not return the frozen points");
  const walletAfterCancel = await wallet(userCookie);
  if (walletAfterCancel.wallet.availablePoints !== walletBefore.wallet.availablePoints || walletAfterCancel.wallet.frozenPoints !== walletBefore.wallet.frozenPoints) throw new Error("Cancellation did not restore wallet balances");
  record("pre-execution cancellation and refund", "PASS", { taskId: canceledCreation.taskId });

  const successCreation = await createTask(userCookie, presign.assetId);
  if (successCreation.status !== "PENDING_INPUT_REVIEW") throw new Error(`Task bypassed input review with status ${successCreation.status}`);
  const walletFrozen = await wallet(userCookie);
  if (!walletFrozen.ledger.some((entry) => entry.business_id === successCreation.taskId && entry.type === "FREEZE")) throw new Error("Task freeze ledger entry missing");
  record("task waits for input review with point freeze", "PASS", { taskId: successCreation.taskId, points: successCreation.points });

  const inputReview = await waitForReview(adminCookie, (review) => review.assetId === presign.assetId);
  const inputDecision = await decideReview(adminCookie, inputReview.id, "APPROVE");
  const assetStatus = (await api(`/api/assets/${presign.assetId}/status/`, { cookie: userCookie })).body;
  if (assetStatus.status !== "READY") throw new Error("Approved input asset is not READY");
  if (!inputDecision.alreadyDecided && inputDecision.activatedTasks < 1) throw new Error("Input approval did not activate the waiting task");
  record("upload review and automatic queue activation", "PASS", { reviewId: inputReview.id, decisionSource: inputDecision.alreadyDecided ? "automatic" : "acceptance-admin" });

  const generated = await waitTask(userCookie, successCreation.taskId, ["PENDING_REVIEW", "SUCCEEDED"]);
  if (generated.status === "PENDING_REVIEW") {
    const outputReview = await waitForReview(adminCookie, (review) => review.taskId === successCreation.taskId);
    const outputReviews = (await activeReviews(adminCookie)).filter((review) => review.taskId === successCreation.taskId);
    if (!outputReviews.some((review) => review.id === outputReview.id)) outputReviews.push(outputReview);
    for (const review of outputReviews) await decideReview(adminCookie, review.id, "APPROVE");
  }
  const succeededTask = await waitTask(userCookie, successCreation.taskId, ["SUCCEEDED"]);
  if (!succeededTask.outputs.length) throw new Error("Succeeded task has no downloadable output");
  record("worker output review and task settlement", "PASS", { outputCount: succeededTask.outputs.length });

  const walletSettled = await wallet(userCookie);
  if (!walletSettled.ledger.some((entry) => entry.business_id === successCreation.taskId && entry.type === "SETTLE")) throw new Error("Task settlement ledger entry missing");
  if (walletSettled.wallet.availablePoints !== walletBefore.wallet.availablePoints - successCreation.points || walletSettled.wallet.frozenPoints !== walletBefore.wallet.frozenPoints) throw new Error("Settled wallet balances are inconsistent");
  record("settled point ledger and balances", "PASS");

  const output = succeededTask.outputs[0];
  const download = await api(`/api/assets/${output.assetId}/download/`, { cookie: userCookie });
  if (!download.response.body) throw new Error("Owner download returned no content");
  await api(`/api/assets/${output.assetId}/download/`, { expected: [401] });
  await api(`/api/assets/${output.assetId}/download/`, { cookie: adminCookie, expected: [404] });
  record("owner download and cross-account denial", "PASS", { assetId: output.assetId });

  const objects = await cosObjects(`users/${session.user.id}/outputs/${successCreation.taskId}/`);
  if (!objects.length || objects.some((object) => Number(object.Size || 0) <= 0)) throw new Error("Expected output object is missing or empty in COS");
  record("COS output object", "PASS", { objectCount: objects.length, totalBytes: objects.reduce((sum, object) => sum + Number(object.Size || 0), 0) });

  if (process.env.ACCEPTANCE_VERIFY_REFUND !== "false") {
    const rejectionCreation = await createTask(userCookie, presign.assetId);
    const generatedForRejection = await waitTask(userCookie, rejectionCreation.taskId, ["PENDING_REVIEW", "SUCCEEDED", "REJECTED"]);
    if (generatedForRejection.status === "PENDING_REVIEW") {
      const rejectionReview = await waitForReview(adminCookie, (review) => review.taskId === rejectionCreation.taskId);
      await decideReview(adminCookie, rejectionReview.id, "REJECT");
    }
    const rejectionResult = await waitTask(userCookie, rejectionCreation.taskId, ["REJECTED", "SUCCEEDED"]);
    if (rejectionResult.status === "REJECTED") {
      const walletRefunded = await wallet(userCookie);
      if (rejectionResult.errorCode !== "CONTENT_REJECTED") throw new Error("Rejected task did not record CONTENT_REJECTED");
      if (!walletRefunded.ledger.some((entry) => entry.business_id === rejectionCreation.taskId && entry.type === "REFUND")) throw new Error("Rejected task refund ledger entry missing");
      if (walletRefunded.wallet.availablePoints !== walletSettled.wallet.availablePoints || walletRefunded.wallet.frozenPoints !== walletSettled.wallet.frozenPoints) throw new Error("Refund did not restore wallet balances");
      record("review rejection and automatic refund", "PASS", { taskId: rejectionCreation.taskId, points: rejectionCreation.points });
    } else record("review rejection and automatic refund", "SKIP", { reason: "automatic provider approved output before the acceptance administrator could reject it" });
  } else record("review rejection and automatic refund", "SKIP", { reason: "ACCEPTANCE_VERIFY_REFUND=false" });

  report.status = "PASSED";
  report.evidence = { userId: session.user.id, inputAssetId: presign.assetId, successfulTaskId: successCreation.taskId, successfulOutputIds: succeededTask.outputs.map((item) => item.assetId), walletBefore: walletBefore.wallet, walletAfter: (await wallet(userCookie)).wallet };
} catch (error) {
  report.status = "FAILED";
  report.error = error instanceof Error ? error.message : String(error);
  record("application chain", "FAIL", { error: report.error });
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Acceptance report: ${reportPath}`);
}
