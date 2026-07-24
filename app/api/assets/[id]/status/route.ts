import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const result = await db.query<{ audit_status: string; reason_code: string | null; note: string | null; updated_at: string }>(
    `SELECT a.audit_status, r.reason_code, r.note, a.updated_at
     FROM assets a
     LEFT JOIN LATERAL (
       SELECT reason_code, note FROM content_review_records WHERE asset_id = a.id ORDER BY created_at DESC LIMIT 1
     ) r ON TRUE
     WHERE a.id = $1 AND a.owner_id = $2`,
    [id, user.id],
  );
  const asset = result.rows[0];
  if (!asset) return NextResponse.json({ code: "ASSET_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ assetId: id, status: asset.audit_status, reasonCode: asset.reason_code, note: asset.note, updatedAt: asset.updated_at });
}
