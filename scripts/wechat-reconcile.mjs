import { createPrivateKey, createSign, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const required = ["DATABASE_URL", "WECHAT_PAY_MCH_ID", "WECHAT_PAY_MERCHANT_SERIAL_NO", "WECHAT_PAY_PRIVATE_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

function loadPem(value) {
  if (value.includes("BEGIN")) return value.replace(/\\n/g, "\n");
  return readFile(value, "utf8");
}

function billDate() {
  if (process.env.WECHAT_RECONCILE_DATE) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(process.env.WECHAT_RECONCILE_DATE)) throw new Error("WECHAT_RECONCILE_DATE must use YYYY-MM-DD");
    return process.env.WECHAT_RECONCILE_DATE;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - 86_400_000));
}

function parseCsvLine(line) {
  const output = []; let current = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { output.push(current); current = ""; }
    else current += character;
  }
  output.push(current);
  return output.map((value) => value.replace(/^`/, "").replace(/\r$/, "").trim());
}

function parseBill(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.includes("商户订单号") && line.includes("微信订单号"));
  if (headerIndex < 0) throw new Error("WeChat trade bill header was not found");
  const headers = parseCsvLine(lines[headerIndex]);
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.startsWith("总交易单数") || line.startsWith("总交易额")) break;
    const values = parseCsvLine(line);
    if (values.length < headers.length || !values.some(Boolean)) continue;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }
  return rows;
}

function fen(value) {
  const amount = Number(String(value || "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function providerPaid(row) {
  return /成功|SUCCESS/i.test(row["交易状态"] || "") && !/退款/i.test(row["交易状态"] || "");
}

async function downloadTradeBill(date) {
  if (process.env.WECHAT_RECONCILE_BILL_FILE) return readFile(process.env.WECHAT_RECONCILE_BILL_FILE, "utf8");
  const privateKey = await loadPem(process.env.WECHAT_PAY_PRIVATE_KEY);
  createPrivateKey(privateKey);
  const path = `/v3/bill/tradebill?bill_date=${encodeURIComponent(date)}&bill_type=ALL`;
  const url = `https://api.mch.weixin.qq.com${path}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signature = createSign("RSA-SHA256").update(`GET\n${path}\n${timestamp}\n${nonce}\n\n`).sign(privateKey, "base64");
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${process.env.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${process.env.WECHAT_PAY_MERCHANT_SERIAL_NO}",signature="${signature}"`;
  const response = await fetch(url, { headers: { Authorization: authorization, Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.download_url) throw new Error(`WeChat trade bill request failed: ${payload?.message || response.status}`);
  const downloaded = await fetch(payload.download_url);
  if (!downloaded.ok) throw new Error(`WeChat trade bill download failed: ${downloaded.status}`);
  return downloaded.text();
}

const date = billDate();
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let runId = "";
try {
  const run = await client.query(
    `INSERT INTO payment_reconciliation_runs (bill_date, status) VALUES ($1, 'RUNNING')
     ON CONFLICT (bill_date) DO UPDATE SET status = 'RUNNING', error_message = NULL, completed_at = NULL, updated_at = NOW()
     RETURNING id`,
    [date],
  );
  runId = run.rows[0].id;
  await client.query("DELETE FROM payment_reconciliation_items WHERE run_id = $1", [runId]);
  const providerRows = parseBill(await downloadTradeBill(date));
  const local = await client.query(
    `SELECT id, order_no, provider_transaction_id, status, amount_fen, points, paid_at
     FROM payment_orders WHERE (paid_at AT TIME ZONE 'Asia/Shanghai')::date = $1::date OR (created_at AT TIME ZONE 'Asia/Shanghai')::date = $1::date`,
    [date],
  );
  const localByOrder = new Map(local.rows.map((row) => [row.order_no, row]));
  const providerByOrder = new Map(providerRows.map((row) => [row["商户订单号"], row]).filter(([key]) => key));
  const issues = [];
  let matched = 0;
  for (const [orderNo, order] of localByOrder) {
    const provider = providerByOrder.get(orderNo);
    if (!provider) { issues.push({ order, orderNo, issue: "MISSING_PROVIDER_ORDER", provider: {} }); continue; }
    const amountFen = fen(provider["订单金额"] || provider["应结订单金额"]);
    const statusMatches = providerPaid(provider) ? ["PAID", "REFUNDED"].includes(order.status) : !["PAID", "REFUNDED"].includes(order.status);
    const transactionId = provider["微信订单号"] || "";
    const problem = amountFen !== order.amount_fen ? "AMOUNT_MISMATCH" : !statusMatches ? "STATUS_MISMATCH" : order.provider_transaction_id && transactionId && order.provider_transaction_id !== transactionId ? "TRANSACTION_ID_MISMATCH" : "";
    if (problem) issues.push({ order, orderNo, issue: problem, provider }); else matched += 1;
  }
  for (const [orderNo, provider] of providerByOrder) if (!localByOrder.has(orderNo)) issues.push({ order: null, orderNo, issue: "MISSING_LOCAL_ORDER", provider });
  await client.query("BEGIN");
  for (const item of issues) {
    await client.query(
      `INSERT INTO payment_reconciliation_items (run_id, order_id, order_no, provider_transaction_id, issue_type, local_json, provider_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [runId, item.order?.id || null, item.orderNo || null, item.provider["微信订单号"] || item.order?.provider_transaction_id || null, item.issue, JSON.stringify(item.order || {}), JSON.stringify(item.provider || {})],
    );
  }
  const report = { billDate: date, generatedAt: new Date().toISOString(), localCount: local.rows.length, providerCount: providerRows.length, matchedCount: matched, mismatchCount: issues.length, issues: issues.map((item) => ({ orderNo: item.orderNo, issueType: item.issue, local: item.order, provider: item.provider })) };
  const reportPath = resolve(process.env.WECHAT_RECONCILIATION_REPORT_DIR || "acceptance-reports", `wechat-reconciliation-${date}.json`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await client.query(
    "UPDATE payment_reconciliation_runs SET status = 'SUCCEEDED', local_count = $2, provider_count = $3, matched_count = $4, mismatch_count = $5, report_path = $6, completed_at = NOW(), updated_at = NOW() WHERE id = $1",
    [runId, local.rows.length, providerRows.length, matched, issues.length, reportPath],
  );
  await client.query("INSERT INTO operations_runs (operation, status, summary) VALUES ('WECHAT_RECONCILIATION', 'SUCCEEDED', $1)", [`date=${date} matched=${matched} mismatches=${issues.length}`]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "SUCCEEDED", reportPath, ...report }, null, 2));
  if (issues.length) process.exitCode = 2;
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  if (runId) await client.query("UPDATE payment_reconciliation_runs SET status = 'FAILED', error_message = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1", [runId, error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN"]).catch(() => undefined);
  await client.query("INSERT INTO operations_runs (operation, status, summary) VALUES ('WECHAT_RECONCILIATION', 'FAILED', $1)", [error instanceof Error ? error.message.slice(0, 1000) : "UNKNOWN"]).catch(() => undefined);
  throw error;
} finally { await client.end(); }
