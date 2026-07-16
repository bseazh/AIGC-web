import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { heroImageWorkflow } from "@/lib/product-config";
import { authenticatedUser } from "@/lib/session";

const extensionByMime: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const byteSize = Number(body?.byteSize);
  const originalName = typeof body?.fileName === "string" ? body.fileName.slice(0, 255) : "upload";
  const extension = extensionByMime[mimeType];
  if (!extension || !heroImageWorkflow.acceptedMimeTypes.includes(mimeType as never)) {
    return NextResponse.json({ code: "UNSUPPORTED_FILE", message: "仅支持 JPG、PNG、WebP" }, { status: 400 });
  }
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > heroImageWorkflow.maxFileBytes) {
    return NextResponse.json({ code: "FILE_TOO_LARGE", message: "图片不能超过 10MB" }, { status: 400 });
  }

  const key = `users/${user.id}/inputs/${randomUUID()}.${extension}`;
  const result = await db.query<{ id: string }>(
    `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name)
     VALUES ($1, 'INPUT', $2, $3, $4, 'UPLOADING', $5)
     RETURNING id`,
    [user.id, key, mimeType, byteSize, originalName],
  );
  const uploadUrl = await createSignedObjectUrl(key, "PUT", 600);
  return NextResponse.json({ assetId: result.rows[0].id, uploadUrl, expiresIn: 600 });
}
