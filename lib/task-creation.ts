import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGenerationQueue } from "@/lib/queue";
import { authenticatedUser } from "@/lib/session";
import { resolvePromptConfig } from "@/lib/prompt-config";
import { enqueueTaskNotification } from "@/lib/notifications";
import { structuredLog, requestContext } from "@/lib/logger";
import { isAdministrator } from "@/lib/admin";
import { ADMIN_EXEMPT_BILLING_MODE } from "@/lib/task-billing";
import { contentReviewEnabled } from "@/lib/content-review";
import { DETAIL_PAGE_MAX_CARDS, DETAIL_PAGE_MIN_CARDS, normalizeDetailCards } from "@/lib/detail-page-plans";
import { parseImageAspectRatio } from "@/lib/image-aspect-ratio";

type ImageWorkflow = {
  key: string;
  enabled: boolean;
  pointsPerTask: number;
  outputsPerTask: number;
  userSelectableOutputCount?: boolean;
  structuredDetailCards?: boolean;
  internalPrompt?: string;
  minAssets?: number;
  aspectRatios: readonly string[];
  durations?: readonly number[];
  resolutions?: readonly string[];
  scenes?: readonly string[];
  styles?: readonly string[];
};

const selectableImageOutputCounts = [1, 2, 4] as const;

function requestedOutputCount(body: Record<string, unknown>, workflow: ImageWorkflow) {
  if (workflow.structuredDetailCards) {
    const count = normalizeDetailCards(body.detailCards).length;
    return count >= DETAIL_PAGE_MIN_CARDS && count <= DETAIL_PAGE_MAX_CARDS ? count : workflow.outputsPerTask;
  }
  if (!workflow.userSelectableOutputCount) return workflow.outputsPerTask;
  const requested = Number(body.outputCount);
  return selectableImageOutputCounts.includes(requested as (typeof selectableImageOutputCounts)[number])
    ? requested
    : workflow.outputsPerTask;
}

function normalizedSeriesPlan(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
    if (!title) return [];
    return [{
      id: typeof record.id === "string" ? record.id.slice(0, 64) : `series-${index + 1}`,
      title,
      angle: typeof record.angle === "string" ? record.angle.trim().slice(0, 80) : "",
      sellingPoint: typeof record.sellingPoint === "string" ? record.sellingPoint.trim().slice(0, 120) : "",
      copy: typeof record.copy === "string" ? record.copy.trim().slice(0, 120) : "",
      visualPrompt: typeof record.visualPrompt === "string" ? record.visualPrompt.trim().slice(0, 360) : "",
    }];
  });
}

type AssetSelector = (body: Record<string, unknown>) => string[];
type ReadyAsset = { id: string; storage_key: string; mime_type: string; metadata_json: Record<string, unknown>; audit_status: string };
type AssetValidator = (assets: ReadyAsset[]) => string | null;
type RequestValidator = (body: Record<string, unknown>) => string | null;
type InputExtras = (body: Record<string, unknown>) => Record<string, unknown>;

function missingProviderConfig(workflowKey: string) {
  const hasGemini = Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY);
  const missingSophnet = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"].filter((key) => !process.env[key]);
  if (workflowKey === "recreate-reference-image") return missingSophnet.length === 0 || hasGemini ? [] : [...missingSophnet, "或配置 GOOGLE_AI_API_KEY / GEMINI_API_KEY / NANO_BANANA_API_KEY"];
  return missingSophnet.length === 0 || hasGemini ? [] : [...missingSophnet, "或配置 GOOGLE_AI_API_KEY / GEMINI_API_KEY / NANO_BANANA_API_KEY"];
}

function providerNotConfiguredMessage(workflowKey: string) {
  const missing = missingProviderConfig(workflowKey);
  if (process.env.NODE_ENV === "production" || missing.length === 0) return "生成服务暂未开放";
  return `图片生成服务未配置，请在环境变量中补充：${missing.join("、")}`;
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function createImageTask(request: NextRequest, workflow: ImageWorkflow, selectAssets: AssetSelector = (body) => [typeof body.assetId === "string" ? body.assetId : ""], validateAssets?: AssetValidator, validateRequest?: RequestValidator, inputExtras?: InputExtras) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!workflow.enabled) return NextResponse.json({ code: "PROVIDER_NOT_CONFIGURED", message: providerNotConfiguredMessage(workflow.key) }, { status: 503 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "INVALID_REQUEST", message: "请求参数不正确" }, { status: 400 });
  const requestError = validateRequest?.(body);
  if (requestError) return NextResponse.json({ code: "INVALID_REQUEST", message: requestError }, { status: 400 });
  const assetIds = [...new Set(selectAssets(body).filter((id) => typeof id === "string" && id.length > 0))];
  if (assetIds.length < (workflow.minAssets ?? 1)) return NextResponse.json({ code: "ASSET_NOT_READY", message: "请补充必传素材" }, { status: 400 });
  const promptLimit = workflow.key.includes("video") ? 5000 : 1200;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, promptLimit) : "";
  if ((workflow.minAssets ?? 1) === 0 && !prompt) return NextResponse.json({ code: "INVALID_REQUEST", message: "请输入提示词" }, { status: 400 });
  const requestedAspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "";
  const acceptsStructuredDirection = workflow.key.includes("video") || workflow.key === "recreate-reference-image";
  const requestedScene = acceptsStructuredDirection && typeof body.scene === "string" ? body.scene : "";
  const requestedStyle = acceptsStructuredDirection && typeof body.style === "string" ? body.style : "";
  const requestedDuration = Number(body.duration);
  const requestedResolution = typeof body.resolution === "string" ? body.resolution : "";
  const imageAspectRatio = parseImageAspectRatio(requestedAspectRatio, workflow.aspectRatios, workflow.aspectRatios[0]);
  if (!imageAspectRatio) return NextResponse.json({ code: "INVALID_ASPECT_RATIO", message: "图片比例格式不正确，请输入正整数宽高，例如 8:20" }, { status: 400 });
  if (workflow.key.includes("video") && imageAspectRatio.mode === "custom") return NextResponse.json({ code: "INVALID_ASPECT_RATIO", message: "当前视频模型不支持自定义画幅" }, { status: 400 });
  const aspectRatio = imageAspectRatio.normalized;
  const scene = workflow.scenes?.includes(requestedScene) ? requestedScene : workflow.scenes?.[0] || "";
  const style = workflow.styles?.includes(requestedStyle) ? requestedStyle : workflow.styles?.[0] || "";
  const duration = workflow.durations?.includes(requestedDuration) ? requestedDuration : workflow.durations?.[workflow.durations.length - 1] || 15;
  const resolution = workflow.resolutions?.includes(requestedResolution) ? requestedResolution : workflow.resolutions?.[1] || "720p";
  const reviewEnabled = contentReviewEnabled();
  const acceptedStatuses = reviewEnabled ? ["PENDING_REVIEW", "READY"] : ["READY"];
  const assetResult = await db.query<ReadyAsset>(
    `SELECT id, storage_key, mime_type, metadata_json, audit_status FROM assets
     WHERE id = ANY($1::uuid[]) AND owner_id = $2
       AND ((kind = 'INPUT' AND audit_status = ANY($3::text[])) OR (kind = 'OUTPUT' AND audit_status = 'READY'))`,
    [assetIds, user.id, acceptedStatuses],
  );
  const assetsById = new Map(assetResult.rows.map((asset) => [asset.id, asset]));
  const assets = assetIds.map((id) => assetsById.get(id)).filter((asset): asset is ReadyAsset => Boolean(asset));
  if (assets.length !== assetIds.length) return NextResponse.json({ code: "ASSET_NOT_READY", message: "素材不可用或未完成上传" }, { status: 400 });
  const inputsReady = !reviewEnabled || assets.every((asset) => asset.audit_status === "READY");
  const assetError = validateAssets?.(assets);
  if (assetError) return NextResponse.json({ code: "INVALID_VIDEO_ASSETS", message: assetError }, { status: 400 });

  const taskId = randomUUID();
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const idempotencyKey = request.headers.get("Idempotency-Key") || randomUUID();
  const draftId = validUuid(body.draftId) ? body.draftId : null;
  const points = workflow.key === "video-mix" ? ({ 15: 40, 30: 70, 45: 100, 60: 130 } as Record<number, number>)[duration] : workflow.pointsPerTask;
  const adminExempt = isAdministrator(user.email || user.phone);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const walletResult = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [user.id]);
    const balance = walletResult.rows[0]?.available_points ?? 0;
    if (!adminExempt && balance < points) {
      await client.query("ROLLBACK");
      return NextResponse.json({ code: "INSUFFICIENT_POINTS", message: "积分不足" }, { status: 402 });
    }
    const promptConfig = workflow.key.includes("video") ? await resolvePromptConfig(client, workflow.key, user.id) : undefined;
    const detailCards = workflow.structuredDetailCards ? normalizeDetailCards(body.detailCards) : [];
    if (workflow.structuredDetailCards && detailCards.length < DETAIL_PAGE_MIN_CARDS) {
      await client.query("ROLLBACK");
      return NextResponse.json({ code: "DETAIL_CARDS_REQUIRED", message: `请至少保留 ${DETAIL_PAGE_MIN_CARDS} 张详情页卡片` }, { status: 400 });
    }
    const seriesPlan = normalizedSeriesPlan(body.seriesPlan);
    const visualBible = typeof body.visualBible === "string" ? body.visualBible.trim().slice(0, 1800) : "";
    const input = { assetId: assets[0]?.id || null, storageKey: assets[0]?.storage_key || null, assetIds: assets.map((asset) => asset.id), storageKeys: assets.map((asset) => asset.storage_key), assetMimeTypes: assets.map((asset) => asset.mime_type), prompt, aspectRatio, aspectRatioMode: imageAspectRatio.mode, requestedAspectRatio: imageAspectRatio.requested, customAspectRatioWidth: imageAspectRatio.width, customAspectRatioHeight: imageAspectRatio.height, duration, resolution, ...(acceptsStructuredDirection ? { scene, style } : {}), internalPrompt: workflow.internalPrompt || "", outputs: requestedOutputCount(body, workflow), ...(detailCards.length ? { detailCards } : {}), ...(seriesPlan.length ? { seriesPlan } : {}), ...(visualBible ? { visualBible } : {}), ...(adminExempt ? { billingMode: ADMIN_EXEMPT_BILLING_MODE, quotedPoints: points } : {}), ...(promptConfig ? { promptConfig } : {}), ...(inputExtras?.(body) || {}) };
    await client.query(
      `INSERT INTO generation_tasks (id, user_id, workflow_key, status, points, input_json, idempotency_key, request_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [taskId, user.id, workflow.key, inputsReady ? "QUEUED" : "PENDING_INPUT_REVIEW", points, JSON.stringify(input), idempotencyKey, requestId],
    );
    if (draftId) {
      await client.query(
        `UPDATE workflow_drafts
         SET status = 'ACTIVE', task_id = $4, archived_at = NULL, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND workflow_key = $3 AND status IN ('ACTIVE', 'ARCHIVED')`,
        [draftId, user.id, workflow.key, taskId],
      );
      await client.query(
        `INSERT INTO workflow_draft_events (draft_id, user_id, workflow_key, event_type, step_key, field_name, value_json, payload_json, task_id)
         VALUES ($1, $2, $3, 'TASK_SUBMITTED', 'generate', 'generation_task', $4::jsonb, NULL, $5)`,
        [
          draftId,
          user.id,
          workflow.key,
          JSON.stringify({ taskId, assetCount: assets.length, outputCount: input.outputs, duration, resolution, aspectRatio, status: inputsReady ? "QUEUED" : "PENDING_INPUT_REVIEW" }),
          taskId,
        ],
      );
    }
    if (adminExempt) {
      await client.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
         VALUES ($1, 'ADMIN_EXEMPT_TASK', 0, $2, 'ADMIN_EXEMPT_TASK', $3, $4)`,
        [user.id, balance, taskId, `admin-exempt:${taskId}`],
      );
    } else {
      await client.query("UPDATE wallets SET available_points = available_points - $2, frozen_points = frozen_points + $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [user.id, points]);
      await client.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
         VALUES ($1, 'FREEZE', $2, $3, 'GENERATION_TASK', $4, $5)`,
        [user.id, -points, balance - points, taskId, `freeze:${taskId}`],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ code: "DUPLICATE_REQUEST", message: "任务已创建" }, { status: 409 });
    structuredLog("error", "task_creation_failed", { ...requestContext(request), taskId, userId: user.id, error });
    return NextResponse.json({ code: "TASK_CREATE_FAILED", message: "创建任务失败" }, { status: 500 });
  } finally { client.release(); }

  if (inputsReady) {
    try {
      await getGenerationQueue().add("image-generation", { taskId }, { jobId: taskId, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    } catch (error) {
      structuredLog("error", "queue_submission_failed", { ...requestContext(request), taskId, userId: user.id, error });
      await refundTask(taskId, user.id, points, "QUEUE_UNAVAILABLE", adminExempt);
      return NextResponse.json({ code: "QUEUE_UNAVAILABLE", message: adminExempt ? "任务队列暂不可用" : "任务队列暂不可用，积分已退回" }, { status: 503 });
    }
  }
  structuredLog("info", "task_created", { requestId, taskId, userId: user.id, workflowKey: workflow.key, points, adminExempt });
  return NextResponse.json({ taskId, requestId, status: inputsReady ? "QUEUED" : "PENDING_INPUT_REVIEW", points, adminExempt }, { status: 201, headers: { "x-request-id": requestId } });
}

async function refundTask(taskId: string, userId: string, points: number, errorCode: string, adminExempt: boolean) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const wallet = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [userId]);
    const balance = wallet.rows[0]?.available_points ?? 0;
    await client.query("UPDATE generation_tasks SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE id = $1", [taskId, errorCode]);
    if (!adminExempt) {
      await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [userId, points]);
      await client.query(
        `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
         VALUES ($1, 'REFUND', $2, $3, 'GENERATION_TASK', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
        [userId, points, balance + points, taskId, `refund:${taskId}`],
      );
    }
    const task = await client.query<{ workflow_key: string; email: string | null }>("SELECT t.workflow_key, u.email FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE t.id = $1", [taskId]);
    if (task.rows[0]) await enqueueTaskNotification(client, { id: taskId, userId, email: task.rows[0].email, workflowKey: task.rows[0].workflow_key, points, adminExempt }, "FAILED");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
