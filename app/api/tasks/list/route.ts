import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { taskStatusLabel, workflowName } from "@/lib/presenters";
import { authenticatedUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status") || "ALL";
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 30), 1), 100);
  const allowedStatuses = ["PENDING_INPUT_REVIEW", "QUEUED", "RUNNING", "PENDING_REVIEW", "SUCCEEDED", "FAILED", "REJECTED", "CANCELED"];
  const params: Array<string | number> = [user.id];
  let where = "user_id = $1";
  if (status === "ACTIVE") {
    where += " AND status IN ('PENDING_INPUT_REVIEW', 'QUEUED', 'RUNNING', 'PENDING_REVIEW')";
  } else if (allowedStatuses.includes(status)) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  params.push(limit);

  const result = await db.query<{
    id: string; workflow_key: string; status: string; points: number; input_json: Record<string, unknown>;
    output_json: { assets?: Array<{ assetId: string; storageKey: string }> }; error_code: string | null;
    created_at: string; updated_at: string;
  }>(`SELECT id, workflow_key, status, points, input_json, output_json, error_code, created_at, updated_at
      FROM generation_tasks WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);

  const tasks = await Promise.all(result.rows.map(async (task) => {
    const output = task.output_json?.assets?.[0];
    return {
      id: task.id,
      workflowKey: task.workflow_key,
      workflowName: workflowName(task.workflow_key),
      status: task.status,
      statusLabel: taskStatusLabel(task.status),
      points: task.points,
      params: {
        aspectRatio: task.input_json?.aspectRatio || null,
        scene: task.input_json?.scene || null,
        style: task.input_json?.style || null,
      },
      outputCount: task.output_json?.assets?.length || 0,
      thumbnailUrl: task.status === "SUCCEEDED" && output ? await createSignedObjectUrl(output.storageKey, "GET", 3600) : null,
      errorCode: task.error_code,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    };
  }));
  const activeCountResult = await db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM generation_tasks WHERE user_id = $1 AND status IN ('PENDING_INPUT_REVIEW', 'QUEUED', 'RUNNING', 'PENDING_REVIEW')", [user.id],
  );
  return NextResponse.json({ tasks, activeCount: Number(activeCountResult.rows[0]?.count || 0) });
}
