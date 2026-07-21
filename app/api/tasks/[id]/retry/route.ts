import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue";
import { authenticatedUser } from "@/lib/session";

const retryableStatuses = ["FAILED", "REJECTED", "CANCELED"];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const retryTaskId = randomUUID();
  const idempotencyKey = request.headers.get("Idempotency-Key") || randomUUID();
  const client = await db.connect();
  let points = 0;
  try {
    await client.query("BEGIN");
    const originalResult = await client.query<{ workflow_key: string; status: string; points: number; input_json: Record<string, unknown> }>(
      "SELECT workflow_key, status, points, input_json FROM generation_tasks WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, user.id],
    );
    const original = originalResult.rows[0];
    if (!original) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 }); }
    if (!retryableStatuses.includes(original.status)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_RETRYABLE", message: "仅失败、拒绝或取消的任务可重新发起" }, { status: 409 }); }
    const input = original.input_json || {};
    const assetIds = Array.isArray(input.assetIds) ? input.assetIds.filter((assetId): assetId is string => typeof assetId === "string") : [];
    const readyAssets = assetIds.length ? await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND kind = 'INPUT' AND audit_status = 'READY'", [assetIds, user.id],
    ) : { rows: [{ count: "0" }] };
    if (Number(readyAssets.rows[0]?.count || 0) !== assetIds.length) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INPUT_ASSET_UNAVAILABLE", message: "原始素材已不可用，请返回创作页重新上传" }, { status: 409 }); }
    const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [user.id]);
    points = original.points;
    const balance = wallet.rows[0]?.available_points ?? 0;
    if (balance < points) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INSUFFICIENT_POINTS", message: "积分不足，无法重新发起" }, { status: 402 }); }
    const retryInput = { ...input, retryOf: id, retriedAt: new Date().toISOString() };
    await client.query("INSERT INTO generation_tasks (id, user_id, workflow_key, status, points, input_json, idempotency_key) VALUES ($1, $2, $3, 'QUEUED', $4, $5::jsonb, $6)", [retryTaskId, user.id, original.workflow_key, points, JSON.stringify(retryInput), idempotencyKey]);
    await client.query("UPDATE wallets SET available_points = available_points - $2, frozen_points = frozen_points + $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [user.id, points]);
    await client.query("INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'FREEZE', $2, $3, 'GENERATION_TASK', $4, $5)", [user.id, -points, balance - points, retryTaskId, `freeze:${retryTaskId}`]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ code: "DUPLICATE_REQUEST", message: "重复的重新发起请求" }, { status: 409 });
    console.error("retry task creation failed", error);
    return NextResponse.json({ code: "TASK_RETRY_FAILED", message: "重新发起失败" }, { status: 500 });
  } finally { client.release(); }
  try {
    await getGenerationQueue().add("generation-retry", { taskId: retryTaskId }, { jobId: retryTaskId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  } catch (error) {
    console.error("retry queue submission failed", error);
    const refundClient = await db.connect();
    try {
      await refundClient.query("BEGIN");
      const queued = await refundClient.query<{ status: string }>("SELECT status FROM generation_tasks WHERE id = $1 FOR UPDATE", [retryTaskId]);
      if (queued.rows[0]?.status === "QUEUED") {
        const wallet = await refundClient.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [user.id]);
        const balance = wallet.rows[0]?.available_points ?? 0;
        await refundClient.query("UPDATE generation_tasks SET status = 'FAILED', error_code = 'QUEUE_UNAVAILABLE', updated_at = NOW() WHERE id = $1", [retryTaskId]);
        await refundClient.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [user.id, points]);
        await refundClient.query("INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING", [user.id, points, balance + points, retryTaskId, `refund:${retryTaskId}`]);
      }
      await refundClient.query("COMMIT");
    } catch (refundError) { await refundClient.query("ROLLBACK"); console.error("retry refund failed", refundError); }
    finally { refundClient.release(); }
    return NextResponse.json({ code: "QUEUE_UNAVAILABLE", message: "任务队列暂不可用，积分已退回" }, { status: 503 });
  }
  return NextResponse.json({ taskId: retryTaskId, status: "QUEUED", points }, { status: 201 });
}
