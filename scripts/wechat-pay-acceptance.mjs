import { createPrivateKey, createPublicKey, createSign, createVerify, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const required = ["WECHAT_PAY_MCH_ID", "WECHAT_PAY_MERCHANT_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY", "WECHAT_PAY_PLATFORM_PUBLIC_KEY", "ACCEPTANCE_BASE_URL"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

async function loadPem(value) { return value.includes("BEGIN") ? value.replace(/\\n/g, "\n") : readFile(value, "utf8"); }
const privateKey = await loadPem(process.env.WECHAT_PAY_PRIVATE_KEY);
const platformPublicKey = await loadPem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY);
createPrivateKey(privateKey); createPublicKey(platformPublicKey);

const report = { startedAt: new Date().toISOString(), status: "RUNNING", checks: [], evidence: {}, error: null };
function record(name, status, details = {}) { report.checks.push({ name, status, at: new Date().toISOString(), ...details }); console.log(`${status}: ${name}`); }

function authorization(method, url, body = "") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const parsed = new URL(url);
  const signature = createSign("RSA-SHA256").update(`${method}\n${parsed.pathname}${parsed.search}\n${timestamp}\n${nonce}\n${body}\n`).sign(privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${process.env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${process.env.WECHAT_PAY_MERCHANT_SERIAL_NO}",signature="${signature}"`;
}

function verifyResponse(response, body) {
  const timestamp = response.headers.get("wechatpay-timestamp");
  const nonce = response.headers.get("wechatpay-nonce");
  const signature = response.headers.get("wechatpay-signature");
  if (!timestamp || !nonce || !signature) return false;
  return createVerify("RSA-SHA256").update(`${timestamp}\n${nonce}\n${body}\n`).verify(platformPublicKey, signature, "base64");
}

async function wechatGet(path) {
  const url = `https://api.mch.weixin.qq.com${path}`;
  const response = await fetch(url, { headers: { Authorization: authorization("GET", url), Accept: "application/json" } });
  const raw = await response.text();
  if (!verifyResponse(response, raw)) throw new Error(`WeChat response signature verification failed for ${path}`);
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`WeChat API ${response.status}: ${body?.message || "unknown"}`);
  return body;
}

function cookieFrom(response) { return (response.headers.get("set-cookie") || "").split(";")[0]; }
async function appApi(path, options = {}) {
  const response = await fetch(`${process.env.ACCEPTANCE_BASE_URL.replace(/\/$/, "")}${path}`, { ...options, headers: { ...(options.headers || {}), ...(options.cookie ? { Cookie: options.cookie } : {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Application ${options.method || "GET"} ${path} failed: ${response.status} ${body?.message || body?.code || ""}`);
  return { response, body };
}

const reportPath = resolve(process.env.ACCEPTANCE_REPORT_DIR || "acceptance-reports", `wechat-pay-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
try {
  const certificates = await wechatGet("/v3/certificates");
  if (!Array.isArray(certificates?.data)) throw new Error("WeChat certificate response is malformed");
  report.evidence.certificateCount = certificates.data.length;
  record("merchant authentication and WeChat response signature", "PASS", { certificateCount: certificates.data.length });

  const orderNo = process.env.WECHAT_ACCEPTANCE_ORDER_NO || "";
  if (orderNo) {
    const order = await wechatGet(`/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(process.env.WECHAT_PAY_MCH_ID)}`);
    report.evidence.providerOrder = { orderNo: order.out_trade_no, transactionId: order.transaction_id || null, state: order.trade_state, amountFen: order.amount?.total };
    record("known payment order query", "PASS", { state: order.trade_state });
  } else record("known payment order query", "SKIP", { reason: "WECHAT_ACCEPTANCE_ORDER_NO is not set" });

  if (process.env.WECHAT_ACCEPTANCE_EXECUTE_REFUND === "true") {
    if (!orderNo || !process.env.ACCEPTANCE_ADMIN_EMAIL || !process.env.ACCEPTANCE_ADMIN_PASSWORD) throw new Error("Real refund requires WECHAT_ACCEPTANCE_ORDER_NO and acceptance administrator credentials");
    const login = await appApi("/api/auth/login/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: process.env.ACCEPTANCE_ADMIN_EMAIL, password: process.env.ACCEPTANCE_ADMIN_PASSWORD }) });
    const cookie = cookieFrom(login.response);
    if (!cookie) throw new Error("Administrator login did not return a cookie");
    const orders = await appApi("/api/admin/payments/?status=PAID", { cookie });
    const localOrder = orders.body.orders?.find((item) => item.orderNo === orderNo);
    if (!localOrder) throw new Error("Configured acceptance order is not a refundable local PAID order");
    const refund = await appApi(`/api/admin/payments/${localOrder.id}/refund/`, { cookie, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "微信支付正式验收退款" }) });
    report.evidence.refund = refund.body;
    record("application refund reservation and WeChat refund request", "PASS", { refundNo: refund.body.refundNo, status: refund.body.status });
  } else record("real refund", "SKIP", { reason: "WECHAT_ACCEPTANCE_EXECUTE_REFUND is not true" });
  report.status = "PASSED";
} catch (error) {
  report.status = "FAILED";
  report.error = error instanceof Error ? error.message : String(error);
  record("acceptance completion", "FAIL", { error: report.error });
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`Acceptance report: ${reportPath}`);
}
