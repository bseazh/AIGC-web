import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { taskStatusLabel } from "@/lib/presenters";
import { workflowName } from "@/lib/presenters";
import { isAdminExemptTask } from "@/lib/task-billing";

function summarizeInput(input: Record<string, unknown>) {
  return {
    prompt: typeof input.prompt === "string" ? input.prompt : "",
    scene: typeof input.scene === "string" ? input.scene : "",
    style: typeof input.style === "string" ? input.style : "",
    aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : "",
    duration: typeof input.duration === "number" || typeof input.duration === "string" ? String(input.duration) : "",
    resolution: typeof input.resolution === "string" ? input.resolution : "",
    assetCount: Array.isArray(input.assetIds) ? input.assetIds.length : 0,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const result = await db.query<{
    id: string;
    workflow_key: string;
    status: string;
    points: number;
    input_json: Record<string, unknown>;
    output_json: { assets?: Array<{ assetId: string; storageKey: string }>; expiredAssets?: Array<{ assetId?: string; expiredAt?: string }> };
    error_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT id, workflow_key, status, points, input_json, output_json, error_code, created_at, updated_at FROM generation_tasks WHERE id = $1 AND user_id = $2",
    [id, user.id],
  );
  const task = result.rows[0];
  if (!task) return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 });
  const projectResult = await db.query<{ id: string; title: string }>(
    "SELECT id, title FROM workflow_drafts WHERE task_id = $1 AND user_id = $2 AND status IN ('ACTIVE', 'ARCHIVED') ORDER BY updated_at DESC LIMIT 1",
    [task.id, user.id],
  );
  const outputAssets = task.output_json?.assets || [];
  const expiredAssets = task.output_json?.expiredAssets || [];
  const assetIds = outputAssets.map((asset) => asset.assetId);
  const assetRows = assetIds.length ? await db.query<{ id: string; storage_key: string; mime_type: string; original_name: string | null; metadata_json: Record<string, unknown> }>(
    "SELECT id, storage_key, mime_type, original_name, metadata_json FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND kind = 'OUTPUT' AND audit_status = 'READY'", [assetIds, user.id],
  ) : { rows: [] };
  const assetsById = new Map(assetRows.rows.map((asset) => [asset.id, asset]));
  const outputs = await Promise.all(outputAssets.map(async (output) => {
    const asset = assetsById.get(output.assetId);
    if (!asset) return null;
    const library = typeof asset.metadata_json?.library === "object" && asset.metadata_json.library ? asset.metadata_json.library as Record<string, unknown> : {};
    return {
      assetId: asset.id,
      mimeType: asset.mime_type,
      name: asset.original_name || "生成结果",
      url: await createSignedObjectUrl(asset.storage_key, "GET", 3600),
      savedToLibrary: library.saved === true,
      expiresAt: typeof library.expiresAt === "string" ? library.expiresAt : null,
    };
  }));
  return NextResponse.json({
    taskId: task.id,
    workflowKey: task.workflow_key,
    workflowName: workflowName(task.workflow_key),
    status: task.status,
    statusLabel: taskStatusLabel(task.status),
    points: task.points,
    adminExempt: isAdminExemptTask(task.input_json),
    outputs: outputs.filter((output): output is NonNullable<typeof output> => Boolean(output)),
    expiredOutputCount: expiredAssets.length,
    originalOutputCount: outputAssets.length + expiredAssets.length,
    inputSummary: summarizeInput(task.input_json),
    project: projectResult.rows[0] ? { id: projectResult.rows[0].id, title: projectResult.rows[0].title } : null,
    errorCode: task.error_code,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  });
}
