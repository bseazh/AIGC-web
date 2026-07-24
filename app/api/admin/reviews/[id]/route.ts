import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { enqueueTaskNotification } from "@/lib/notifications";
import { getGenerationQueue } from "@/lib/queue";

type ReviewRow = {
  id: string; asset_id: string; task_id: string | null; status: string; owner_id: string;
  workflow_key: string | null; task_status: string | null; points: number | null; email: string | null;
};

function verifySystemDecision(request: NextRequest, rawBody: string) {
  const secret = process.env.CONTENT_REVIEW_INTERNAL_SECRET;
  const timestamp = request.headers.get("x-review-timestamp") || "";
  const received = request.headers.get("x-review-signature") || "";
  if (!secret || secret.length < 32 || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(received)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rawBody = await request.text();
  const systemDecision = verifySystemDecision(request, rawBody);
  const administrator = systemDecision ? null : await authenticatedAdministrator(request);
  if (!systemDecision && !administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const actorId = administrator?.id || null;
  const reviewSource = systemDecision ? "SYSTEM" : "MANUAL";
  const { id } = await context.params;
  const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();
  const action = body?.action === "APPROVE" ? "APPROVE" : body?.action === "REJECT" ? "REJECT" : body?.action === "ESCALATE" ? "ESCALATE" : null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const reasonCode = typeof body?.reasonCode === "string" ? body.reasonCode.trim().slice(0, 80) : "";
  const severity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(body?.severity) ? body.severity : "HIGH";
  if (!action || (action === "REJECT" && !reasonCode)) return NextResponse.json({ code: "INVALID_REVIEW", message: "拒绝时必须选择违规原因" }, { status: 400 });

  const client = await db.connect();
  let responseStatus = "";
  let taskId: string | null = null;
  let queuedTaskIds: string[] = [];
  try {
    await client.query("BEGIN");
    const found = await client.query<ReviewRow>(
      `SELECT r.id, r.asset_id, r.task_id, r.status, a.owner_id, t.workflow_key, t.status AS task_status,
              t.points, u.email
       FROM content_review_records r
       JOIN assets a ON a.id = r.asset_id
       LEFT JOIN generation_tasks t ON t.id = r.task_id
       JOIN users u ON u.id = a.owner_id
       WHERE r.id = $1 FOR UPDATE OF r, a`,
      [id],
    );
    const review = found.rows[0];
    if (!review) { await client.query("ROLLBACK"); return NextResponse.json({ code: "REVIEW_NOT_FOUND" }, { status: 404 }); }
    if (!["PENDING", "NEEDS_MANUAL"].includes(review.status)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "REVIEW_ALREADY_DECIDED" }, { status: 409 }); }
    taskId = review.task_id;

    if (action === "ESCALATE") {
      await client.query(
        "UPDATE content_review_records SET status = 'NEEDS_MANUAL', review_source = $4, risk_level = 'MEDIUM', note = $2, reviewer_id = $3, metadata_json = metadata_json || $5::jsonb, updated_at = NOW() WHERE id = $1",
        [id, note || null, actorId, reviewSource, JSON.stringify(body?.metadata || {})],
      );
      responseStatus = "NEEDS_MANUAL";
    } else if (action === "APPROVE") {
      const reviewedAt = new Date().toISOString();
      await client.query(
        "UPDATE content_review_records SET status = 'APPROVED', review_source = $4, risk_level = 'LOW', note = $2, reviewer_id = $3, metadata_json = metadata_json || $5::jsonb, reviewed_at = NOW(), updated_at = NOW() WHERE id = $1",
        [id, note || null, actorId, reviewSource, JSON.stringify(body?.metadata || {})],
      );
      await client.query(
        "UPDATE assets SET audit_status = 'READY', metadata_json = metadata_json || $2::jsonb, updated_at = NOW() WHERE id = $1",
        [review.asset_id, JSON.stringify({ moderation: { status: "APPROVED", source: reviewSource, reviewerId: actorId, reviewedAt } })],
      );
      responseStatus = "APPROVED";
      if (!review.task_id) {
        const activated = await client.query<{ id: string }>(
          `UPDATE generation_tasks t SET status = 'QUEUED', updated_at = NOW()
           WHERE t.status = 'PENDING_INPUT_REVIEW'
             AND (t.input_json->'assetIds') @> to_jsonb(ARRAY[$1]::text[])
             AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(t.input_json->'assetIds') input_id
               JOIN assets input_asset ON input_asset.id = input_id::uuid
               WHERE input_asset.audit_status <> 'READY'
             )
           RETURNING t.id`,
          [review.asset_id],
        );
        queuedTaskIds = activated.rows.map((task) => task.id);
      }
      if (review.task_id && review.task_status === "PENDING_REVIEW") {
        const remaining = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM content_review_records WHERE task_id = $1 AND status <> 'APPROVED'",
          [review.task_id],
        );
        if (Number(remaining.rows[0]?.count || 0) === 0) {
          const task = await client.query<{ status: string }>("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [review.task_id]);
          if (task.rows[0]?.status === "PENDING_REVIEW") {
            await client.query("UPDATE generation_tasks SET status = 'SUCCEEDED', updated_at = NOW() WHERE id = $1", [review.task_id]);
            await client.query("UPDATE wallets SET frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [review.owner_id, review.points || 0]);
            const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1", [review.owner_id]);
            await client.query(
              `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
               VALUES ($1, 'SETTLE', 0, $2, 'GENERATION_TASK', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
              [review.owner_id, wallet.rows[0]?.available_points || 0, review.task_id, `settle:${review.task_id}`],
            );
            await enqueueTaskNotification(client, { id: review.task_id, userId: review.owner_id, email: review.email, workflowKey: review.workflow_key || "generation", points: review.points || 0 }, "SUCCEEDED");
          }
        }
      }
    } else {
      const reviewedAt = new Date().toISOString();
      await client.query(
        "UPDATE content_review_records SET status = 'REJECTED', review_source = $6, risk_level = $2, reason_code = $3, note = $4, reviewer_id = $5, metadata_json = metadata_json || $7::jsonb, reviewed_at = NOW(), updated_at = NOW() WHERE id = $1",
        [id, severity === "LOW" ? "LOW" : severity === "MEDIUM" ? "MEDIUM" : "HIGH", reasonCode, note || null, actorId, reviewSource, JSON.stringify(body?.metadata || {})],
      );
      await client.query(
        "UPDATE assets SET audit_status = 'REJECTED', metadata_json = metadata_json || $2::jsonb, updated_at = NOW() WHERE id = $1",
        [review.asset_id, JSON.stringify({ moderation: { status: "REJECTED", source: reviewSource, reasonCode, reviewerId: actorId, reviewedAt } })],
      );
      await client.query(
        `INSERT INTO content_violations (review_id, asset_id, task_id, category, severity, status, details_json)
         VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6::jsonb)`,
        [id, review.asset_id, review.task_id, reasonCode, severity, JSON.stringify({ note, reviewerId: actorId, source: reviewSource })],
      );
      responseStatus = "REJECTED";
      if (review.task_id && review.task_status === "PENDING_REVIEW") {
        const task = await client.query<{ status: string }>("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [review.task_id]);
        if (task.rows[0]?.status === "PENDING_REVIEW") {
          await client.query("UPDATE assets SET audit_status = 'REJECTED', updated_at = NOW() WHERE kind = 'OUTPUT' AND metadata_json->>'taskId' = $1 AND audit_status = 'PENDING_REVIEW'", [review.task_id]);
          await client.query("UPDATE content_review_records SET status = 'REJECTED', reason_code = COALESCE(reason_code, 'TASK_REJECTED'), reviewed_at = COALESCE(reviewed_at, NOW()), updated_at = NOW() WHERE task_id = $1 AND status IN ('PENDING', 'NEEDS_MANUAL')", [review.task_id]);
          const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [review.owner_id]);
          const balance = wallet.rows[0]?.available_points || 0;
          await client.query("UPDATE generation_tasks SET status = 'REJECTED', error_code = 'CONTENT_REJECTED', updated_at = NOW() WHERE id = $1", [review.task_id]);
          await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [review.owner_id, review.points || 0]);
          await client.query(
            `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
             VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
            [review.owner_id, review.points || 0, balance + (review.points || 0), review.task_id, `refund:${review.task_id}`],
          );
          await enqueueTaskNotification(client, { id: review.task_id, userId: review.owner_id, email: review.email, workflowKey: review.workflow_key || "generation", points: review.points || 0 }, "REJECTED");
        }
      } else if (!review.task_id) {
        const waiting = await client.query<{ id: string; workflow_key: string; points: number }>(
          `SELECT id, workflow_key, points FROM generation_tasks
           WHERE status = 'PENDING_INPUT_REVIEW' AND (input_json->'assetIds') @> to_jsonb(ARRAY[$1]::text[])
           FOR UPDATE`,
          [review.asset_id],
        );
        if (waiting.rowCount) {
          const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [review.owner_id]);
          let balance = wallet.rows[0]?.available_points || 0;
          const total = waiting.rows.reduce((sum, task) => sum + task.points, 0);
          await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [review.owner_id, total]);
          for (const waitingTask of waiting.rows) {
            balance += waitingTask.points;
            await client.query("UPDATE generation_tasks SET status = 'REJECTED', error_code = 'INPUT_CONTENT_REJECTED', updated_at = NOW() WHERE id = $1", [waitingTask.id]);
            await client.query(
              `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
               VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
              [review.owner_id, waitingTask.points, balance, waitingTask.id, `refund:${waitingTask.id}`],
            );
            await enqueueTaskNotification(client, { id: waitingTask.id, userId: review.owner_id, email: review.email, workflowKey: waitingTask.workflow_key, points: waitingTask.points }, "REJECTED");
          }
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("content review decision failed", error);
    return NextResponse.json({ code: "REVIEW_FAILED", message: "审核决定保存失败" }, { status: 500 });
  } finally { client.release(); }
  for (const queuedTaskId of queuedTaskIds) {
    try {
      await getGenerationQueue().add("generation-after-input-review", { taskId: queuedTaskId }, { jobId: queuedTaskId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    } catch (error) {
      console.error(`could not queue reviewed task ${queuedTaskId}`, error);
      await refundQueueFailure(queuedTaskId);
    }
  }
  await audit(actorId, systemDecision ? `AUTOMATED_CONTENT_REVIEW_${action}` : `ADMIN_CONTENT_REVIEW_${action}`, request, { type: "content_review", id }, { taskId, reasonCode: reasonCode || null, note });
  return NextResponse.json({ reviewId: id, status: responseStatus, taskId, activatedTasks: queuedTaskIds.length });
}

async function refundQueueFailure(taskId: string) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ user_id: string; workflow_key: string; points: number; status: string; email: string | null }>("SELECT t.user_id, t.workflow_key, t.points, t.status, u.email FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t", [taskId]);
    const task = found.rows[0];
    if (task?.status === "QUEUED") {
      const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [task.user_id]);
      const balance = wallet.rows[0]?.available_points || 0;
      await client.query("UPDATE generation_tasks SET status = 'FAILED', error_code = 'QUEUE_UNAVAILABLE', updated_at = NOW() WHERE id = $1", [taskId]);
      await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [task.user_id, task.points]);
      await client.query("INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT DO NOTHING", [task.user_id, task.points, balance + task.points, taskId, `refund:${taskId}`]);
      await enqueueTaskNotification(client, { id: taskId, userId: task.user_id, email: task.email, workflowKey: task.workflow_key, points: task.points }, "FAILED");
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); console.error(`reviewed task ${taskId} refund failed`, error); }
  finally { client.release(); }
}
