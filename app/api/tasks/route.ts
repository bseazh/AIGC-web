import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { heroImageWorkflow } from "@/lib/product-config";
import { getGenerationQueue } from "@/lib/queue";
import { authenticatedUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!heroImageWorkflow.enabled) {
    return NextResponse.json({ code: "PROVIDER_NOT_CONFIGURED", message: "生成服务暂未开放" }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const assetId = typeof body?.assetId === "string" ? body.assetId : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
  const ratio = heroImageWorkflow.aspectRatios.includes(body?.aspectRatio) ? body.aspectRatio : "1:1";
  const scene = heroImageWorkflow.scenes.includes(body?.scene) ? body.scene : heroImageWorkflow.scenes[0];
  const style = heroImageWorkflow.styles.includes(body?.style) ? body.style : heroImageWorkflow.styles[0];
  const assetResult = await db.query<{ id: string; storage_key: string }>(
    "SELECT id, storage_key FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY' AND kind = 'INPUT'",
    [assetId, user.id],
  );
  const asset = assetResult.rows[0];
  if (!asset) return NextResponse.json({ code: "ASSET_NOT_READY", message: "请先完成图片上传" }, { status: 400 });

  const taskId = randomUUID();
  const idempotencyKey = request.headers.get("Idempotency-Key") || randomUUID();
  const points = heroImageWorkflow.pointsPerTask;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const walletResult = await client.query<{ available_points: number }>(
      "SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE",
      [user.id],
    );
    const balance = walletResult.rows[0]?.available_points ?? 0;
    if (balance < points) {
      await client.query("ROLLBACK");
      return NextResponse.json({ code: "INSUFFICIENT_POINTS", message: "积分不足" }, { status: 402 });
    }
    const input = { assetId: asset.id, storageKey: asset.storage_key, prompt, aspectRatio: ratio, scene, style, outputs: heroImageWorkflow.outputsPerTask };
    await client.query(
      `INSERT INTO generation_tasks (id, user_id, workflow_key, status, points, input_json, idempotency_key)
       VALUES ($1, $2, $3, 'QUEUED', $4, $5::jsonb, $6)`,
      [taskId, user.id, heroImageWorkflow.key, points, JSON.stringify(input), idempotencyKey],
    );
    await client.query(
      "UPDATE wallets SET available_points = available_points - $2, frozen_points = frozen_points + $2, version = version + 1, updated_at = NOW() WHERE user_id = $1",
      [user.id, points],
    );
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'FREEZE', $2, $3, 'GENERATION_TASK', $4, $5)`,
      [user.id, -points, balance - points, taskId, `freeze:${taskId}`],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ code: "DUPLICATE_REQUEST", message: "任务已创建" }, { status: 409 });
    }
    console.error("task creation failed", error);
    return NextResponse.json({ code: "TASK_CREATE_FAILED", message: "创建任务失败" }, { status: 500 });
  } finally {
    client.release();
  }

  try {
    await getGenerationQueue().add("product-hero-image", { taskId }, { jobId: taskId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  } catch (error) {
    console.error("queue submission failed", error);
    await refundTask(taskId, user.id, points, "QUEUE_UNAVAILABLE");
    return NextResponse.json({ code: "QUEUE_UNAVAILABLE", message: "任务队列暂不可用，积分已退回" }, { status: 503 });
  }

  return NextResponse.json({ taskId, status: "QUEUED", points }, { status: 201 });
}

async function refundTask(taskId: string, userId: string, points: number, errorCode: string) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [userId]);
    const balance = wallet.rows[0]?.available_points ?? 0;
    await client.query("UPDATE generation_tasks SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE id = $1", [taskId, errorCode]);
    await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [userId, points]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
      [userId, points, balance + points, taskId, `refund:${taskId}`],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
