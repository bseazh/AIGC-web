import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const savedAt = new Date().toISOString();
  const result = await db.query<{ id: string }>(
    `UPDATE assets
        SET metadata_json = metadata_json || $3::jsonb,
            updated_at = NOW()
      WHERE id = $1
        AND owner_id = $2
        AND kind = 'OUTPUT'
        AND audit_status = 'READY'
        AND (
          COALESCE(metadata_json #>> '{library,saved}', 'false') = 'true'
          OR COALESCE((metadata_json #>> '{library,expiresAt}')::timestamptz, created_at + INTERVAL '48 hours') > NOW()
        )
      RETURNING id`,
    [id, user.id, JSON.stringify({ library: { saved: true, retention: "SAVED_ASSET", savedAt, expiresAt: null } })],
  );
  if (!result.rows[0]) return NextResponse.json({ code: "ASSET_NOT_FOUND", message: "结果不存在、已过期或暂不可保存" }, { status: 404 });
  await audit(user.id, "OUTPUT_ASSET_SAVED_TO_LIBRARY", request, { type: "asset", id }, { savedAt });
  return NextResponse.json({ ok: true, assetId: id, savedAt });
}
