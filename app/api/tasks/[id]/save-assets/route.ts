import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { assetIds?: unknown } | null;
  const requestedAssetIds = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((value): value is string => typeof value === "string")
    : [];

  const task = await db.query<{ id: string; output_json: { assets?: Array<{ assetId?: string }> } }>(
    "SELECT id, output_json FROM generation_tasks WHERE id = $1 AND user_id = $2 AND status = 'SUCCEEDED'",
    [id, user.id],
  );
  const found = task.rows[0];
  if (!found) return NextResponse.json({ code: "TASK_NOT_FOUND" }, { status: 404 });

  const taskAssetIds = (found.output_json?.assets || []).map((asset) => asset.assetId).filter((assetId): assetId is string => typeof assetId === "string");
  const assetIds = requestedAssetIds.length ? requestedAssetIds.filter((assetId) => taskAssetIds.includes(assetId)) : taskAssetIds;
  if (!assetIds.length) return NextResponse.json({ code: "NO_OUTPUT_ASSETS", message: "没有可保存的任务结果" }, { status: 400 });

  const result = await db.query<{ id: string }>(
    `UPDATE assets
      SET metadata_json = metadata_json || $3::jsonb,
          updated_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND owner_id = $2
        AND kind = 'OUTPUT'
        AND audit_status = 'READY'
        AND (
          COALESCE(metadata_json #>> '{library,saved}', 'false') = 'true'
          OR COALESCE((metadata_json #>> '{library,expiresAt}')::timestamptz, created_at + INTERVAL '48 hours') > NOW()
        )
      RETURNING id`,
    [assetIds, user.id, JSON.stringify({ library: { saved: true, retention: "SAVED_ASSET", savedAt: new Date().toISOString(), expiresAt: null } })],
  );
  if (!result.rowCount) return NextResponse.json({ code: "OUTPUT_EXPIRED", message: "任务结果已过期，无法加入素材库" }, { status: 410 });
  await audit(user.id, "TASK_OUTPUTS_SAVED_TO_LIBRARY", request, { type: "generation_task", id }, { assetIds: result.rows.map((row) => row.id) });
  return NextResponse.json({ ok: true, savedAssetIds: result.rows.map((row) => row.id), savedCount: result.rowCount });
}
