import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const requestedStatus = request.nextUrl.searchParams.get("status") || "ACTIVE";
  const status = ["PENDING", "NEEDS_MANUAL", "APPROVED", "REJECTED"].includes(requestedStatus) ? requestedStatus : null;
  const params: string[] = [];
  let where = "r.status IN ('PENDING', 'NEEDS_MANUAL')";
  if (status) { params.push(status); where = `r.status = $${params.length}`; }
  const result = await db.query<{
    id: string; asset_id: string; task_id: string | null; phase: string; status: string; risk_level: string;
    reason_code: string | null; note: string | null; created_at: string; kind: string; mime_type: string;
    original_name: string | null; storage_key: string; owner_name: string; owner_identifier: string;
  }>(
    `SELECT r.id, r.asset_id, r.task_id, r.phase, r.status, r.risk_level, r.reason_code, r.note, r.created_at,
            a.kind, a.mime_type, a.original_name, a.storage_key, u.display_name AS owner_name,
            COALESCE(u.email, u.phone, '-') AS owner_identifier
     FROM content_review_records r
     JOIN assets a ON a.id = r.asset_id
     JOIN users u ON u.id = a.owner_id
     WHERE ${where} ORDER BY CASE WHEN r.status IN ('PENDING', 'NEEDS_MANUAL') THEN CASE r.status WHEN 'NEEDS_MANUAL' THEN 0 ELSE 1 END ELSE 0 END,
              CASE WHEN r.status IN ('PENDING', 'NEEDS_MANUAL') THEN r.created_at END ASC,
              CASE WHEN r.status IN ('APPROVED', 'REJECTED') THEN r.created_at END DESC
     LIMIT 100`,
    params,
  );
  const reviews = await Promise.all(result.rows.map(async (review) => ({
    id: review.id,
    assetId: review.asset_id,
    taskId: review.task_id,
    phase: review.phase,
    status: review.status,
    riskLevel: review.risk_level,
    reasonCode: review.reason_code,
    note: review.note,
    createdAt: review.created_at,
    asset: { kind: review.kind, mimeType: review.mime_type, originalName: review.original_name || "未命名素材", previewUrl: await createSignedObjectUrl(review.storage_key, "GET", 900) },
    owner: { displayName: review.owner_name, identifier: review.owner_identifier },
  })));
  return NextResponse.json({ reviews });
}
