import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue";
import { authenticatedUser } from "@/lib/session";

type ImageWorkflow = {
  key: string;
  enabled: boolean;
  pointsPerTask: number;
  outputsPerTask: number;
  aspectRatios: readonly string[];
  scenes: readonly string[];
  styles: readonly string[];
};

type AssetSelector = (body: Record<string, unknown>) => string[];

export async function createImageTask(request: NextRequest, workflow: ImageWorkflow, selectAssets: AssetSelector = (body) => [typeof body.assetId === "string" ? body.assetId : ""]) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!workflow.enabled) return NextResponse.json({ code: "PROVIDER_NOT_CONFIGURED", message: "生成服务暂未开放" }, { status: 503 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "INVALID_REQUEST", message: "请求参数不正确" }, { status: 400 });
  const assetIds = [...new Set(selectAssets(body).filter((id) => typeof id === "string" && id.length > 0))];
  if (assetIds.length === 0) return NextResponse.json({ code: "ASSET_NOT_READY", message: "请先完成图片上传" }, { status: 400 });
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
  const requestedAspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "";
  const requestedScene = typeof body.scene === "string" ? body.scene : "";
  const requestedStyle = typeof body.style === "string" ? body.style : "";
  const aspectRatio = workflow.aspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : workflow.aspectRatios[0];
  const scene = workflow.scenes.includes(requestedScene) ? requestedScene : workflow.scenes[0];
  const style = workflow.styles.includes(requestedStyle) ? requestedStyle : workflow.styles[0];
  const assetResult = await db.query<{ id: string; storage_key: string }>(
    "SELECT id, storage_key FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND audit_status = 'READY' AND kind = 'INPUT'",
    [assetIds, user.id],
  );
  const assetsById = new Map(assetResult.rows.map((asset) => [asset.id, asset]));
  const assets = assetIds.map((id) => assetsById.get(id)).filter((asset): asset is { id: string; storage_key: string } => Boolean(asset));
  if (assets.length !== assetIds.length) return NextResponse.json({ code: "ASSET_NOT_READY", message: "请先完成图片上传" }, { status: 400 });

  const taskId = randomUUID();
  const idempotencyKey = request.headers.get("Idempotency-Key") || randomUUID();
  const points = workflow.pointsPerTask;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const walletResult = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [user.id]);
    const balance = walletResult.rows[0]?.available_points ?? 0;
    if (balance < points) {
      await client.query("ROLLBACK");
      return NextResponse.json({ code: "INSUFFICIENT_POINTS", message: "积分不足" }, { status: 402 });
    }
    const input = { assetId: assets[0].id, storageKey: assets[0].storage_key, assetIds: assets.map((asset) => asset.id), storageKeys: assets.map((asset) => asset.storage_key), prompt, aspectRatio, scene, style, outputs: workflow.outputsPerTask };
    await client.query(
      `INSERT INTO generation_tasks (id, user_id, workflow_key, status, points, input_json, idempotency_key)
       VALUES ($1, $2, $3, 'QUEUED', $4, $5::jsonb, $6)`,
      [taskId, user.id, workflow.key, points, JSON.stringify(input), idempotencyKey],
    );
    await client.query("UPDATE wallets SET available_points = available_points - $2, frozen_points = frozen_points + $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [user.id, points]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'FREEZE', $2, $3, 'GENERATION_TASK', $4, $5)`,
      [user.id, -points, balance - points, taskId, `freeze:${taskId}`],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ code: "DUPLICATE_REQUEST", message: "任务已创建" }, { status: 409 });
    console.error("task creation failed", error);
    return NextResponse.json({ code: "TASK_CREATE_FAILED", message: "创建任务失败" }, { status: 500 });
  } finally { client.release(); }

  try {
    await getGenerationQueue().add("image-generation", { taskId }, { jobId: taskId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
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
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
