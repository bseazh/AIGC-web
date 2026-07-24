import { NextRequest, NextResponse } from "next/server";
import { inspectObject } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { enqueueContentReview } from "@/lib/queue";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.assetId !== "string") {
    return NextResponse.json({ code: "INVALID_ASSET" }, { status: 400 });
  }
  const result = await db.query<{ id: string; storage_key: string; byte_size: string; mime_type: string }>(
    "SELECT id, storage_key, byte_size, mime_type FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'UPLOADING'",
    [body.assetId, user.id],
  );
  const asset = result.rows[0];
  if (!asset) return NextResponse.json({ code: "ASSET_NOT_FOUND" }, { status: 404 });

  try {
    const metadata = await inspectObject(asset.storage_key);
    const actualSize = metadata.contentLength;
    const actualType = metadata.contentType;
    if (actualSize !== Number(asset.byte_size) || (actualType && actualType !== asset.mime_type)) {
      return NextResponse.json({ code: "UPLOAD_MISMATCH", message: "上传文件校验失败" }, { status: 400 });
    }
    const videoDurationSeconds = Number(body?.videoDurationSeconds);
    if (asset.mime_type === "video/mp4" && (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0 || videoDurationSeconds > 24 * 60 * 60)) {
      return NextResponse.json({ code: "VIDEO_METADATA_REQUIRED", message: "无法读取视频时长，请重新选择可正常播放的 MP4 文件" }, { status: 400 });
    }
    const metadataJson = asset.mime_type === "video/mp4" ? { durationSeconds: Math.round(videoDurationSeconds * 1000) / 1000 } : {};
    const client = await db.connect();
    let reviewId = "";
    try {
      await client.query("BEGIN");
      const changed = await client.query(
        `UPDATE assets SET audit_status = 'PENDING_REVIEW', metadata_json = metadata_json || $2::jsonb, updated_at = NOW()
         WHERE id = $1 AND audit_status = 'UPLOADING' RETURNING id`,
        [asset.id, JSON.stringify({ ...metadataJson, moderation: { status: "PENDING_REVIEW", submittedAt: new Date().toISOString() } })],
      );
      if (!changed.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ code: "ASSET_STATE_CHANGED" }, { status: 409 });
      }
      const review = await client.query<{ id: string }>(
        `INSERT INTO content_review_records (asset_id, phase, status, review_source, metadata_json)
         VALUES ($1, 'UPLOAD', 'PENDING', 'SYSTEM', $2::jsonb)
         ON CONFLICT (asset_id) WHERE status IN ('PENDING', 'NEEDS_MANUAL') DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [asset.id, JSON.stringify({ mimeType: asset.mime_type, byteSize: actualSize })],
      );
      reviewId = review.rows[0]?.id || "";
      await client.query("COMMIT");
    } catch (reviewError) {
      await client.query("ROLLBACK");
      throw reviewError;
    } finally {
      client.release();
    }
    if (reviewId) {
      try { await enqueueContentReview(reviewId, asset.id); }
      catch (queueError) { console.error("automatic moderation queue unavailable; review remains manual", queueError); }
    }
    await audit(user.id, "ASSET_REVIEW_SUBMITTED", request, { type: "asset", id: asset.id });
    return NextResponse.json({ assetId: asset.id, status: "PENDING_REVIEW", message: "素材已上传，审核通过后可用于创作" });
  } catch (error) {
    console.error("upload confirmation failed", error);
    return NextResponse.json({ code: "UPLOAD_NOT_FOUND", message: "尚未检测到上传文件" }, { status: 400 });
  }
}
