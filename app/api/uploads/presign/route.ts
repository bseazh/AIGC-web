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

function normalizeContentHash(value: unknown) {
  const hash = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const byteSize = Number(body?.byteSize);
  const originalName = typeof body?.fileName === "string" ? body.fileName.slice(0, 255) : "upload";
  const contentHash = normalizeContentHash(body?.contentHash);
  const temporaryDerived = body?.temporaryDerived === true;
  const extension = extensionByMime[mimeType];
  if (!extension) {
    return NextResponse.json({ code: "UNSUPPORTED_FILE", message: "仅支持 JPG、PNG、WebP、MP4、MP3、WAV" }, { status: 400 });
  }
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > maxBytesByMime[mimeType]) {
    return NextResponse.json({ code: "FILE_TOO_LARGE", message: "图片最大 10MB，视频最大 100MB，音频最大 30MB" }, { status: 400 });
  }
  if (contentHash && !temporaryDerived) {
    const duplicate = await db.query<{ id: string }>(
      `SELECT id
       FROM assets
       WHERE owner_id = $1
         AND kind = 'INPUT'
         AND mime_type = $2
         AND content_hash = $3
         AND audit_status = 'READY'
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [user.id, mimeType, contentHash],
    );
    if (duplicate.rows[0]) {
      await audit(user.id, "ASSET_UPLOAD_DEDUPED", request, { type: "asset", id: duplicate.rows[0].id }, { byteSize, mimeType, contentHash });
      return NextResponse.json({ assetId: duplicate.rows[0].id, duplicate: true });
    }
  }
  const storage = await storageSummary(user.id);
  if (storage.usedBytes + byteSize > storage.quotaBytes) return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED", message: "存储空间不足，请删除不需要的素材后重试", storage }, { status: 413 });

  const kind = temporaryDerived ? "OUTPUT" : "INPUT";
  const key = temporaryDerived
    ? `users/${user.id}/outputs/derived/${randomUUID()}.${extension}`
    : `users/${user.id}/inputs/${randomUUID()}.${extension}`;
  const expiresAt = new Date(Date.now() + Number(process.env.TEMP_OUTPUT_RETENTION_HOURS || 48) * 60 * 60 * 1000).toISOString();
  const result = await db.query<{ id: string }>(
    `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, content_hash, metadata_json)
     VALUES ($1, $2, $3, $4, $5, 'UPLOADING', $6, $7, $8::jsonb)
     RETURNING id`,
    [user.id, kind, key, mimeType, byteSize, originalName, contentHash || null, JSON.stringify({
      ...(contentHash ? { contentHash } : {}),
      ...(temporaryDerived ? { derived: true, library: { saved: false, retention: "TEMPORARY_DERIVED", expiresAt } } : {}),
    })],
  );
  const uploadUrl = await createSignedObjectUrl(key, "PUT", 600);
  await audit(user.id, temporaryDerived ? "TEMPORARY_DERIVED_ASSET_CREATED" : "ASSET_UPLOAD_CREATED", request, { type: "asset", id: result.rows[0].id }, { byteSize, mimeType, expiresAt: temporaryDerived ? expiresAt : null });
  return NextResponse.json({ assetId: result.rows[0].id, uploadUrl, expiresIn: 600, temporaryDerived, expiresAt: temporaryDerived ? expiresAt : null });
}
