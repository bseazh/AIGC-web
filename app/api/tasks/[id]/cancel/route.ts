import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue";
import { authenticatedUser } from "@/lib/session";

const cancelableStatuses = new Set(["PENDING_INPUT_REVIEW", "QUEUED"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const client = await db.connect();
  let previousStatus = "";
  let points = 0;
  try {
    await client.query("BEGIN");
    const found = await client.query<{ status: string; points: number }>("SELECT status, points FROM generation_tasks WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, user.id]);
    const task = found.rows[0];
    if (!task) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 }); }
    if (!cancelableStatuses.has(task.status)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_CANCELABLE", message: "只有素材审核中或排队中的任务可以取消" }, { status: 409 }); }
    previousStatus = task.status; points = task.points;
    const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [user.id]);
    const balance = wallet.rows[0]?.available_points || 0;
    await client.query("UPDATE generation_tasks SET status = 'CANCELED', error_code = 'USER_CANCELED', updated_at = NOW() WHERE id = $1", [id]);
    await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [user.id, points]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
      [user.id, points, balance + points, id, `refund:${id}`],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK"); console.error("task cancellation failed", error);
    return NextResponse.json({ code: "TASK_CANCEL_FAILED", message: "任务取消失败，请稍后重试" }, { status: 500 });
  } finally { client.release(); }

  try {
    const job = await getGenerationQueue().getJob(id);
    if (job) await job.remove();
  } catch (error) { console.warn(`could not remove canceled queue job ${id}`, error); }
  await audit(user.id, "TASK_CANCELED", request, { type: "generation_task", id }, { previousStatus, refundedPoints: points });
  return NextResponse.json({ taskId: id, status: "CANCELED", refundedPoints: points });
}
