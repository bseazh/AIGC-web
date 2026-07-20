import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const kind = request.nextUrl.searchParams.get("kind") || "ALL";
  const query = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  const params: string[] = [user.id];
  let where = "owner_id = $1 AND audit_status = 'READY'";
  if (["INPUT", "OUTPUT"].includes(kind)) {
    params.push(kind);
    where += ` AND kind = $${params.length}`;
  }
  if (query) {
    params.push(`%${query}%`);
    where += ` AND COALESCE(original_name, '') ILIKE $${params.length}`;
  }
  const result = await db.query<{
    id: string; kind: string; storage_key: string; mime_type: string; byte_size: string;
    original_name: string | null; metadata_json: Record<string, unknown>; created_at: string;
  }>(`SELECT id, kind, storage_key, mime_type, byte_size, original_name, metadata_json, created_at
      FROM assets WHERE ${where} ORDER BY created_at DESC LIMIT 100`, params);
  const assets = await Promise.all(result.rows.map(async (asset) => ({
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mime_type,
    byteSize: Number(asset.byte_size),
    originalName: asset.original_name || "未命名素材",
    taskId: typeof asset.metadata_json?.taskId === "string" ? asset.metadata_json.taskId : null,
    url: await createSignedObjectUrl(asset.storage_key, "GET", 3600),
    createdAt: asset.created_at,
  })));
  const usage = await db.query<{ bytes: string }>(
    "SELECT COALESCE(SUM(byte_size), 0)::text AS bytes FROM assets WHERE owner_id = $1 AND audit_status = 'READY'", [user.id],
  );
  return NextResponse.json({ assets, totalBytes: Number(usage.rows[0]?.bytes || 0) });
}
