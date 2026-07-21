import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { taskStatusLabel } from "@/lib/presenters";
import { workflowName } from "@/lib/presenters";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const result = await db.query<{
    id: string;
    workflow_key: string;
    status: string;
    points: number;
    output_json: { assets?: Array<{ assetId: string; storageKey: string }> };
    error_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT id, workflow_key, status, points, output_json, error_code, created_at, updated_at FROM generation_tasks WHERE id = $1 AND user_id = $2",
    [id, user.id],
  );
  const task = result.rows[0];
  if (!task) return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 });
  const outputAssets = task.output_json?.assets || [];
  const assetIds = outputAssets.map((asset) => asset.assetId);
  const assetRows = assetIds.length ? await db.query<{ id: string; storage_key: string; mime_type: string; original_name: string | null }>(
    "SELECT id, storage_key, mime_type, original_name FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND kind = 'OUTPUT' AND audit_status = 'READY'", [assetIds, user.id],
  ) : { rows: [] };
  const assetsById = new Map(assetRows.rows.map((asset) => [asset.id, asset]));
  const outputs = await Promise.all(outputAssets.map(async (output) => {
    const asset = assetsById.get(output.assetId);
    if (!asset) return null;
    return { assetId: asset.id, mimeType: asset.mime_type, name: asset.original_name || "生成结果", url: await createSignedObjectUrl(asset.storage_key, "GET", 3600) };
  }));
  return NextResponse.json({
    taskId: task.id,
    workflowName: workflowName(task.workflow_key),
    status: task.status,
    statusLabel: taskStatusLabel(task.status),
    points: task.points,
    outputs: outputs.filter((output): output is NonNullable<typeof output> => Boolean(output)),
    errorCode: task.error_code,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  });
}
