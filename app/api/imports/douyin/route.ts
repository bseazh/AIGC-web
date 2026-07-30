import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { contentReviewEnabled } from "@/lib/content-review";
import {
  createSignedObjectUrl,
  removeObject,
  uploadLocalObject,
} from "@/lib/cos";
import { db } from "@/lib/db";
import {
  DouyinImportError,
  downloadDouyinVideo,
  inspectDouyinVideo,
  normalizeDouyinUrl,
  resolveDouyinClip,
} from "@/lib/douyin-import";
import { enqueueContentReview } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { authenticatedUser } from "@/lib/session";
import { storageSummary } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

async function releaseLock(key: string, token: string) {
  await redis
    .eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    )
    .catch(() => undefined);
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user)
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  let sourceUrl: string;
  try {
    sourceUrl = normalizeDouyinUrl(body?.url);
  } catch (error) {
    const typed = error as DouyinImportError;
    return NextResponse.json(
      { code: typed.code, message: typed.message },
      { status: typed.status || 400 },
    );
  }

  const attemptsKey = `douyin-import:attempts:${user.id}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 10 * 60);
  if (attempts > 20) {
    return NextResponse.json(
      {
        code: "DOUYIN_IMPORT_RATE_LIMITED",
        message: "链接解析和导入过于频繁，请 10 分钟后再试",
      },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  const lockKey = `douyin-import:active:${user.id}`;
  const lockToken = randomUUID();
  const locked = await redis.set(lockKey, lockToken, "EX", 120, "NX");
  if (!locked) {
    return NextResponse.json(
      {
        code: "DOUYIN_IMPORT_IN_PROGRESS",
        message: "已有一个抖音视频正在导入，请等待完成",
      },
      { status: 409 },
    );
  }

  let uploadedKey = "";
  let persisted = false;
  try {
    const source = await inspectDouyinVideo(sourceUrl);
    if (body?.action === "analyze") {
      await audit(user.id, "DOUYIN_VIDEO_ANALYZED", request, undefined, {
        sourceId: source.sourceId,
        durationSeconds: source.durationSeconds,
      });
      return NextResponse.json({
        status: "ANALYZED",
        title: source.title,
        durationSeconds: source.durationSeconds,
        clipRequired: source.durationSeconds > 15,
        clipDurations: [5, 10, 15],
      });
    }
    const clip = resolveDouyinClip(
      source.durationSeconds,
      body?.startSeconds,
      body?.clipDurationSeconds,
    );
    const imported = await downloadDouyinVideo(sourceUrl, source, clip);
    try {
      const storage = await storageSummary(user.id);
      if (storage.usedBytes + imported.byteSize > storage.quotaBytes) {
        return NextResponse.json(
          {
            code: "STORAGE_QUOTA_EXCEEDED",
            message: "存储空间不足，请删除不需要的素材后重试",
            storage,
          },
          { status: 413 },
        );
      }

      uploadedKey = `users/${user.id}/inputs/${randomUUID()}.mp4`;
      await uploadLocalObject(uploadedKey, imported.filePath, "video/mp4");
      const reviewEnabled = contentReviewEnabled();
      const auditStatus = reviewEnabled ? "PENDING_REVIEW" : "READY";
      const metadata = {
        durationSeconds: imported.durationSeconds,
        source: "DOUYIN",
        sourceId: imported.sourceId,
        sourceDurationSeconds: imported.sourceDurationSeconds,
        clipStartSeconds: imported.clipStartSeconds,
        clipEndSeconds: imported.clipEndSeconds,
        importedAt: new Date().toISOString(),
        moderation: reviewEnabled
          ? { status: "PENDING_REVIEW", submittedAt: new Date().toISOString() }
          : { status: "BYPASSED", bypassedAt: new Date().toISOString() },
      };
      const client = await db.connect();
      let assetId = "";
      let reviewId = "";
      try {
        await client.query("BEGIN");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, metadata_json)
           VALUES ($1, 'INPUT', $2, 'video/mp4', $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [
            user.id,
            uploadedKey,
            imported.byteSize,
            auditStatus,
            imported.title,
            JSON.stringify(metadata),
          ],
        );
        assetId = inserted.rows[0].id;
        if (reviewEnabled) {
          const review = await client.query<{ id: string }>(
            `INSERT INTO content_review_records (asset_id, phase, status, review_source, metadata_json)
             VALUES ($1, 'UPLOAD', 'PENDING', 'SYSTEM', $2::jsonb)
             RETURNING id`,
            [
              assetId,
              JSON.stringify({
                mimeType: "video/mp4",
                byteSize: imported.byteSize,
                source: "DOUYIN",
              }),
            ],
          );
          reviewId = review.rows[0].id;
        }
        await client.query("COMMIT");
        persisted = true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      if (reviewId) {
        enqueueContentReview(reviewId, assetId).catch((error) =>
          console.error("douyin import review enqueue failed", error),
        );
      }
      await audit(
        user.id,
        "DOUYIN_VIDEO_IMPORTED",
        request,
        { type: "asset", id: assetId },
        {
          durationSeconds: imported.durationSeconds,
          byteSize: imported.byteSize,
          sourceId: imported.sourceId,
          sourceDurationSeconds: imported.sourceDurationSeconds,
          clipStartSeconds: imported.clipStartSeconds,
          clipEndSeconds: imported.clipEndSeconds,
        },
      );
      if (reviewEnabled) {
        return NextResponse.json(
          { assetId, status: "PENDING_REVIEW", message: "视频已导入素材库" },
          { status: 202 },
        );
      }
      return NextResponse.json({
        assetId,
        status: "READY",
        name: imported.title,
        byteSize: imported.byteSize,
        durationSeconds: imported.durationSeconds,
        sourceDurationSeconds: imported.sourceDurationSeconds,
        clipStartSeconds: imported.clipStartSeconds,
        clipEndSeconds: imported.clipEndSeconds,
        url: await createSignedObjectUrl(uploadedKey, "GET", 3600),
      });
    } finally {
      await imported.cleanup();
    }
  } catch (error) {
    if (uploadedKey && !persisted)
      await removeObject(uploadedKey).catch(() => undefined);
    if (error instanceof DouyinImportError) {
      await audit(user.id, "DOUYIN_VIDEO_IMPORT_REJECTED", request, undefined, {
        code: error.code,
        ...error.details,
      });
      return NextResponse.json(
        { code: error.code, message: error.message, ...error.details },
        { status: error.status },
      );
    }
    console.error("douyin import failed", error);
    return NextResponse.json(
      {
        code: "DOUYIN_IMPORT_FAILED",
        message: "视频导入失败，请稍后重试或改用本地上传",
      },
      { status: 500 },
    );
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
