import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function expectConstraint(name, query, params, expectedCode) {
  await client.query(`SAVEPOINT ${name}`);
  try {
    await client.query(query, params);
    assert.fail(`${name} did not reject invalid data`);
  } catch (error) {
    assert.equal(error.code, expectedCode, `${name} returned PostgreSQL error ${error.code}`);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
  }
}

try {
  await client.query("BEGIN");
  const userId = randomUUID();
  const assetId = randomUUID();
  const taskId = randomUUID();
  await client.query("INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, 'test', 'State regression')", [userId, `state-${userId}@example.invalid`]);
  await client.query("INSERT INTO wallets (user_id, available_points, frozen_points) VALUES ($1, 90, 10)", [userId]);
  await client.query("INSERT INTO assets (id, owner_id, kind, storage_key, mime_type, byte_size, audit_status) VALUES ($1, $2, 'INPUT', $3, 'image/png', 1, 'PENDING_REVIEW')", [assetId, userId, `regression/${assetId}.png`]);
  await client.query("INSERT INTO generation_tasks (id, user_id, workflow_key, status, points, input_json) VALUES ($1, $2, 'regression', 'PENDING_INPUT_REVIEW', 10, $3::jsonb)", [taskId, userId, JSON.stringify({ assetIds: [assetId] })]);

  await expectConstraint("invalid_task_status", "UPDATE generation_tasks SET status = 'INVALID' WHERE id = $1", [taskId], "23514");
  await client.query("INSERT INTO content_review_records (asset_id, phase, status) VALUES ($1, 'UPLOAD', 'PENDING')", [assetId]);
  await expectConstraint("one_active_review", "INSERT INTO content_review_records (asset_id, phase, status) VALUES ($1, 'UPLOAD', 'NEEDS_MANUAL')", [assetId], "23505");

  const sessionId = randomUUID();
  await client.query("INSERT INTO login_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')", [sessionId, userId]);
  const activeBefore = await client.query("SELECT 1 FROM login_sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()", [sessionId]);
  assert.equal(activeBefore.rowCount, 1, "new session should be active");
  await client.query("UPDATE login_sessions SET revoked_at = NOW(), revoke_reason = 'REGRESSION' WHERE id = $1", [sessionId]);
  const activeAfter = await client.query("SELECT 1 FROM login_sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > NOW()", [sessionId]);
  assert.equal(activeAfter.rowCount, 0, "revoked session should not be active");

  await client.query("INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key) VALUES ($1, 'state@example.invalid', 'TEST', 'test', 'test', $2)", [userId, `state:${taskId}`]);
  await expectConstraint("notification_idempotency", "INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key) VALUES ($1, 'state@example.invalid', 'TEST', 'test', 'test', $2)", [userId, `state:${taskId}`], "23505");

  await client.query("UPDATE users SET status = 'DELETED', email = NULL, phone = NULL WHERE id = $1", [userId]);
  const deleted = await client.query("SELECT status, email, phone FROM users WHERE id = $1", [userId]);
  assert.deepEqual(deleted.rows[0], { status: "DELETED", email: null, phone: null }, "deleted account should allow identifier removal");

  await client.query("ROLLBACK");
  console.log("PASS: database state-machine regression");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
