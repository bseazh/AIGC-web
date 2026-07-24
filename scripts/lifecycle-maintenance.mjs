import { Queue } from "bullmq";
import COS from "cos-nodejs-sdk-v5";
import pg from "pg";

const required = ["DATABASE_URL", "REDIS_URL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const inputReviewTimeoutHours = Number(process.env.INPUT_REVIEW_TIMEOUT_HOURS || 24);
const outputReviewTimeoutHours = Number(process.env.OUTPUT_REVIEW_TIMEOUT_HOURS || 24);
const deletionCoolingDays = Number(process.env.ACCOUNT_DELETION_COOLING_DAYS || 7);
for (const [name, value] of [["INPUT_REVIEW_TIMEOUT_HOURS", inputReviewTimeoutHours], ["OUTPUT_REVIEW_TIMEOUT_HOURS", outputReviewTimeoutHours], ["ACCOUNT_DELETION_COOLING_DAYS", deletionCoolingDays]]) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const redisUrl = new URL(process.env.REDIS_URL);
const queue = new Queue("generation", { connection: { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), password: redisUrl.password || undefined, maxRetriesPerRequest: null } });
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const bucket = { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION };

function removeObject(Key) {
  return new Promise((resolve, reject) => cos.deleteObject({ ...bucket, Key }, (error) => error ? reject(error) : resolve()));
}

async function refundTask(taskId, targetStatus, errorCode) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT t.id, t.user_id, t.workflow_key, t.points, t.status, u.email
       FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t`,
      [taskId],
    );
    const task = found.rows[0];
    if (!task || !["PENDING_INPUT_REVIEW", "PENDING_REVIEW"].includes(task.status)) {
      await client.query("ROLLBACK"); return false;
    }
    const wallet = await client.query("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [task.user_id]);
    const balance = wallet.rows[0]?.available_points || 0;
    await client.query("UPDATE generation_tasks SET status = $2, error_code = $3, updated_at = NOW() WHERE id = $1", [task.id, targetStatus, errorCode]);
    await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [task.user_id, task.points]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
      [task.user_id, task.points, balance + task.points, task.id, `refund:${task.id}`],
    );
    if (task.status === "PENDING_REVIEW") {
      await client.query("UPDATE assets SET audit_status = 'REJECTED', updated_at = NOW() WHERE kind = 'OUTPUT' AND metadata_json->>'taskId' = $1 AND audit_status <> 'REJECTED'", [task.id]);
      await client.query("UPDATE content_review_records SET status = 'REJECTED', review_source = 'SYSTEM', risk_level = 'UNKNOWN', reason_code = $2, note = 'Review deadline exceeded', reviewed_at = NOW(), updated_at = NOW() WHERE task_id = $1 AND status IN ('PENDING', 'NEEDS_MANUAL')", [task.id, errorCode]);
    }
    if (task.email) {
      const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>任务 <strong>${task.id}</strong> 因审核等待超时未完成，${task.points} 积分已自动退回。</p></div>`;
      await client.query(
        `INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key)
         VALUES ($1, $2, 'TASK_FAILED', '你的创作任务未完成', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
        [task.user_id, task.email, html, `task_failed:${task.id}`],
      );
    }
    await client.query("COMMIT"); return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function reconcileWaitingTasks() {
  const rejected = await pool.query(
    `SELECT DISTINCT t.id FROM generation_tasks t
     CROSS JOIN LATERAL jsonb_array_elements_text(t.input_json->'assetIds') input_id
     JOIN assets a ON a.id = input_id::uuid
     WHERE t.status = 'PENDING_INPUT_REVIEW' AND a.audit_status = 'REJECTED' LIMIT 100`,
  );
  let rejectedCount = 0;
  for (const task of rejected.rows) if (await refundTask(task.id, "REJECTED", "INPUT_CONTENT_REJECTED")) rejectedCount += 1;

  const ready = await pool.query(
    `SELECT t.id FROM generation_tasks t
     WHERE t.status = 'PENDING_INPUT_REVIEW'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(t.input_json->'assetIds') input_id
         JOIN assets a ON a.id = input_id::uuid WHERE a.audit_status <> 'READY'
       )
     ORDER BY t.created_at LIMIT 100`,
  );
  let activated = 0;
  for (const task of ready.rows) {
    const changed = await pool.query("UPDATE generation_tasks SET status = 'QUEUED', updated_at = NOW() WHERE id = $1 AND status = 'PENDING_INPUT_REVIEW' RETURNING id", [task.id]);
    if (!changed.rowCount) continue;
    try {
      await queue.add("generation-after-maintenance", { taskId: task.id }, { jobId: task.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
      activated += 1;
    } catch (error) {
      await pool.query("UPDATE generation_tasks SET status = 'PENDING_INPUT_REVIEW', updated_at = NOW() WHERE id = $1 AND status = 'QUEUED'", [task.id]);
      throw error;
    }
  }
  return { rejected: rejectedCount, activated };
}

async function expireReviewWaits() {
  const input = await pool.query("SELECT id FROM generation_tasks WHERE status = 'PENDING_INPUT_REVIEW' AND created_at < NOW() - ($1 * INTERVAL '1 hour') ORDER BY created_at LIMIT 100", [inputReviewTimeoutHours]);
  const output = await pool.query("SELECT id FROM generation_tasks WHERE status = 'PENDING_REVIEW' AND updated_at < NOW() - ($1 * INTERVAL '1 hour') ORDER BY updated_at LIMIT 100", [outputReviewTimeoutHours]);
  let inputExpired = 0; let outputExpired = 0;
  for (const task of input.rows) if (await refundTask(task.id, "FAILED", "INPUT_REVIEW_TIMEOUT")) inputExpired += 1;
  for (const task of output.rows) if (await refundTask(task.id, "FAILED", "OUTPUT_REVIEW_TIMEOUT")) outputExpired += 1;
  return { inputExpired, outputExpired };
}

async function finalizeDeletedAccounts() {
  const found = await pool.query(
    `SELECT id FROM users WHERE status = 'DELETION_PENDING'
     AND deletion_requested_at < NOW() - ($1 * INTERVAL '1 day') ORDER BY deletion_requested_at LIMIT 25`,
    [deletionCoolingDays],
  );
  let finalized = 0;
  for (const candidate of found.rows) {
    const assets = await pool.query("SELECT storage_key FROM assets WHERE owner_id = $1", [candidate.id]);
    for (const asset of assets.rows) await removeObject(asset.storage_key);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT id FROM users WHERE id = $1 AND status = 'DELETION_PENDING' AND deletion_requested_at < NOW() - ($2 * INTERVAL '1 day') FOR UPDATE", [candidate.id, deletionCoolingDays]);
      if (!locked.rowCount) { await client.query("ROLLBACK"); continue; }
      await client.query("UPDATE users SET avatar_asset_id = NULL WHERE id = $1", [candidate.id]);
      await client.query("DELETE FROM complaint_attachments WHERE complaint_id IN (SELECT id FROM complaints WHERE user_id = $1)", [candidate.id]);
      await client.query("DELETE FROM assets WHERE owner_id = $1", [candidate.id]);
      await client.query("UPDATE generation_tasks SET input_json = '{}'::jsonb, output_json = '{}'::jsonb, updated_at = NOW() WHERE user_id = $1", [candidate.id]);
      await client.query("UPDATE content_authorizations SET source_url = NULL, consent_json = '{\"retainedForLegalCompliance\":true}'::jsonb, ip_address = NULL, user_agent = NULL WHERE user_id = $1", [candidate.id]);
      await client.query("UPDATE complaints SET description = '[account deleted]', updated_at = NOW() WHERE user_id = $1", [candidate.id]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [candidate.id]);
      await client.query("DELETE FROM login_sessions WHERE user_id = $1", [candidate.id]);
      await client.query("UPDATE users SET email = NULL, phone = NULL, password_hash = 'deleted', display_name = '已注销用户', status = 'DELETED', token_version = token_version + 1, updated_at = NOW() WHERE id = $1", [candidate.id]);
      await client.query("INSERT INTO audit_events (user_id, event_type, resource_type, resource_id, details_json) VALUES ($1, 'ACCOUNT_DELETION_FINALIZED', 'USER', $1, $2::jsonb)", [candidate.id, JSON.stringify({ coolingDays: deletionCoolingDays })]);
      await client.query("COMMIT"); finalized += 1;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return { found: found.rowCount, finalized };
}

try {
  const waitingTasks = await reconcileWaitingTasks();
  const reviewTimeouts = await expireReviewWaits();
  const accountDeletions = await finalizeDeletedAccounts();
  const summary = { event: "lifecycle_maintenance_complete", waitingTasks, reviewTimeouts, accountDeletions };
  await pool.query("INSERT INTO operations_runs (operation, status, summary) VALUES ('LIFECYCLE_MAINTENANCE', 'SUCCEEDED', $1)", [JSON.stringify(summary)]);
  console.log(JSON.stringify(summary));
} catch (error) {
  await pool.query("INSERT INTO operations_runs (operation, status, summary) VALUES ('LIFECYCLE_MAINTENANCE', 'FAILED', $1)", [error instanceof Error ? error.message.slice(0, 2000) : "LIFECYCLE_MAINTENANCE_FAILED"]).catch(() => undefined);
  throw error;
} finally {
  await queue.close().catch(() => undefined);
  await pool.end();
}
