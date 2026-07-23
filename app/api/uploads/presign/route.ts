import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { storageSummary } from "@/lib/storage";
import { audit } from "@/lib/audit";

const extensionByMime: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
};

const maxBytesByMime: Record<string, number> = {
  "image/jpeg": 10 * 1024 * 1024,
  "image/png": 10 * 1024 * 1024,
  "image/webp": 10 * 1024 * 1024,
  "video/mp4": 100 * 1024 * 1024,
  "audio/mpeg": 30 * 1024 * 1024,
  "audio/mp3": 30 * 1024 * 1024,
  "audio/wav": 30 * 1024 * 1024,
};

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const byteSize = Number(body?.byteSize);
  const originalName = typeof body?.fileName === "string" ? body.fileName.slice(0, 255) : "upload";
  const extension = extensionByMime[mimeType];
  if (!extension) {
    return NextResponse.json({ code: "UNSUPPORTED_FILE", message: "仅支持 JPG、PNG、WebP、MP4、MP3、WAV" }, { status: 400 });
  }
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > maxBytesByMime[mimeType]) {
    return NextResponse.json({ code: "FILE_TOO_LARGE", message: "图片最大 10MB，视频最大 100MB，音频最大 30MB" }, { status: 400 });
  }
  const storage = await storageSummary(user.id);
  if (storage.usedBytes + byteSize > storage.quotaBytes) return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED", message: "存储空间不足，请删除不需要的素材后重试", storage }, { status: 413 });

  const key = `users/${user.id}/inputs/${randomUUID()}.${extension}`;
  const result = await db.query<{ id: string }>(
    `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name)
     VALUES ($1, 'INPUT', $2, $3, $4, 'UPLOADING', $5)
     RETURNING id`,
    [user.id, key, mimeType, byteSize, originalName],
  );
  const uploadUrl = await createSignedObjectUrl(key, "PUT", 600);
  await audit(user.id, "ASSET_UPLOAD_CREATED", request, { type: "asset", id: result.rows[0].id }, { byteSize, mimeType });
  return NextResponse.json({ assetId: result.rows[0].id, uploadUrl, expiresIn: 600 });
}
