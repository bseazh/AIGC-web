import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue";
import { enqueueTaskNotification } from "@/lib/notifications";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) return NextResponse.json({ code: "REASON_REQUIRED", message: "人工重试必须填写原因" }, { status: 400 });
  const retryTaskId = randomUUID();
  const client = await db.connect();
  let ownerId = "";
  let points = 0;
  let workflowKey = "generation";
  let ownerEmail: string | null = null;
  try {
    await client.query("BEGIN");
    const found = await client.query<{ user_id: string; workflow_key: string; status: string; points: number; input_json: Record<string, unknown>; email: string | null }>(
      "SELECT t.user_id, t.workflow_key, t.status, t.points, t.input_json, u.email FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t", [id],
    );
    const original = found.rows[0];
    if (!original) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 }); }
    if (!["FAILED", "REJECTED", "CANCELED"].includes(original.status)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_RETRYABLE", message: "只有失败、拒绝或取消的任务可重试" }, { status: 409 }); }
    ownerId = original.user_id; points = original.points; workflowKey = original.workflow_key; ownerEmail = original.email;
    const assetIds = Array.isArray(original.input_json?.assetIds) ? original.input_json.assetIds.filter((value): value is string => typeof value === "string") : [];
    const ready = assetIds.length ? await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND audit_status = 'READY'", [assetIds, ownerId]) : { rows: [{ count: "0" }] };
    if (Number(ready.rows[0]?.count || 0) !== assetIds.length) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INPUT_ASSET_UNAVAILABLE", message: "原任务素材不可用" }, { status: 409 }); }
    const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [ownerId]);
    const balance = wallet.rows[0]?.available_points || 0;
    if (balance < points) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INSUFFICIENT_POINTS", message: "用户积分不足，不能人工重试" }, { status: 409 }); }
    const retryInput = { ...original.input_json, retryOf: id, adminRetry: { administratorId: administrator.id, reason, requestedAt: new Date().toISOString() } };
    await client.query("INSERT INTO generation_tasks (id, user_id, workflow_key, status, points, input_json, idempotency_key) VALUES ($1, $2, $3, 'QUEUED', $4, $5::jsonb, $6)", [retryTaskId, ownerId, original.workflow_key, points, JSON.stringify(retryInput), `admin-retry:${id}:${retryTaskId}`]);
    await client.query("UPDATE wallets SET available_points = available_points - $2, frozen_points = frozen_points + $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [ownerId, points]);
    await client.query("INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'FREEZE', $2, $3, 'GENERATION_TASK', $4, $5)", [ownerId, -points, balance - points, retryTaskId, `freeze:${retryTaskId}`]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); console.error("admin task retry failed", error); return NextResponse.json({ code: "TASK_RETRY_FAILED" }, { status: 500 }); }
  finally { client.release(); }
  try {
    await getGenerationQueue().add("admin-generation-retry", { taskId: retryTaskId }, { jobId: retryTaskId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  } catch (error) {
    const refund = await db.connect();
    try {
      await refund.query("BEGIN");
      const task = await refund.query<{ status: string }>("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [retryTaskId]);
      if (task.rows[0]?.status === "QUEUED") {
        const wallet = await refund.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [ownerId]);
        const balance = wallet.rows[0]?.available_points || 0;
        await refund.query("UPDATE generation_tasks SET status = 'FAILED', error_code = 'QUEUE_UNAVAILABLE', updated_at = NOW() WHERE id = $1", [retryTaskId]);
        await refund.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, updated_at = NOW() WHERE user_id = $1", [ownerId, points]);
        await refund.query("INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT DO NOTHING", [ownerId, points, balance + points, retryTaskId, `refund:${retryTaskId}`]);
        await enqueueTaskNotification(refund, { id: retryTaskId, userId: ownerId, email: ownerEmail, workflowKey, points }, "FAILED");
      }
      await refund.query("COMMIT");
    } catch (refundError) { await refund.query("ROLLBACK"); console.error("admin retry refund failed", refundError); }
    finally { refund.release(); }
    return NextResponse.json({ code: "QUEUE_UNAVAILABLE", message: "队列不可用，积分已退回" }, { status: 503 });
  }
  await audit(administrator.id, "ADMIN_TASK_RETRIED", request, { type: "generation_task", id }, { retryTaskId, ownerId, reason });
  return NextResponse.json({ taskId: retryTaskId, status: "QUEUED" }, { status: 201 });
}
