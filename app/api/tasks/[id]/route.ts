import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { taskStatusLabel } from "@/lib/presenters";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const result = await db.query<{
    id: string;
    status: string;
    points: number;
    output_json: { assets?: Array<{ assetId: string; storageKey: string }> };
    error_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    "SELECT id, status, points, output_json, error_code, created_at, updated_at FROM generation_tasks WHERE id = $1 AND user_id = $2",
    [id, user.id],
  );
  const task = result.rows[0];
  if (!task) return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 });
  const outputs = await Promise.all((task.output_json?.assets || []).map(async (asset) => ({
    assetId: asset.assetId,
    url: await createSignedObjectUrl(asset.storageKey, "GET", 3600),
  })));
  return NextResponse.json({
    taskId: task.id,
    status: task.status,
    statusLabel: taskStatusLabel(task.status),
    points: task.points,
    outputs,
    errorCode: task.error_code,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  });
}
