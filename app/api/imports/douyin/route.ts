import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { contentReviewEnabled } from "@/lib/content-review";
import {
  createSignedObjectUrl,
  downloadObjectToFile,
  removeObject,
  uploadLocalObject,
} from "@/lib/cos";
import { db } from "@/lib/db";
import {
  DouyinImportError,
  downloadDouyinVideo,
  downloadDouyinSourceVideo,
  inspectDouyinVideo,
  importCachedDouyinVideo,
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

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function referencePrompt(title: string, durationSeconds: number) {
  return [
    `参考视频《${title}》，分析多帧关键画面，不复制原商品、人物、品牌和字幕。`,
    "重点提取：开场钩子、商品出现方式、镜头景别、运镜速度、转场节奏、手部/人物互动、收尾 CTA 节奏。",
    `按 ${Math.min(durationSeconds, 15).toFixed(1)} 秒以内的截取片段生成原创换品复刻视频，保留节奏结构但替换成用户商品和参考图。`,
  ].join("\n");
}

function keyframeSeconds(durationSeconds: number) {
  const safeDuration = Math.max(0, durationSeconds);
  const points = [0.12, 0.32, 0.52, 0.72, 0.9].map((ratio) =>
    Math.round(Math.max(0, safeDuration * ratio) * 10) / 10,
  );
  return [...new Set(points)].slice(0, 5);
}

async function createSourceCache(userId: string, sourceUrl: string, source: Awaited<ReturnType<typeof inspectDouyinVideo>>) {
  const downloaded = await downloadDouyinSourceVideo(sourceUrl, source);
  try {
    const storageKey = `users/${userId}/temporary/douyin/${randomUUID()}.mp4`;
    await uploadLocalObject(storageKey, downloaded.filePath, "video/mp4");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const inserted = await db.query<{ id: string; expires_at: string }>(
      `INSERT INTO douyin_video_caches
       (user_id, source_url, source_id, title, storage_key, byte_size, duration_seconds, metadata_json, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id, expires_at`,
      [
        userId,
        sourceUrl,
        source.sourceId,
        source.title,
        storageKey,
        downloaded.byteSize,
        source.durationSeconds,
        JSON.stringify({
          referencePrompt: referencePrompt(source.title, source.durationSeconds),
          keyframeSeconds: keyframeSeconds(source.durationSeconds),
          cachedAt: new Date().toISOString(),
        }),
        expiresAt,
      ],
    );
    return {
      id: inserted.rows[0].id,
      storageKey,
      byteSize: downloaded.byteSize,
      expiresAt: inserted.rows[0].expires_at,
      previewUrl: await createSignedObjectUrl(storageKey, "GET", 3600),
    };
  } finally {
    await downloaded.cleanup();
  }
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
    const cacheId = validUuid(body?.cacheId) ? body.cacheId : null;
    let cachedSource:
      | {
          id: string;
          storage_key: string;
          source_id: string | null;
          title: string;
          duration_seconds: string;
          byte_size: string;
        }
      | undefined;
    if (cacheId) {
      const cacheResult = await db.query<NonNullable<typeof cachedSource>>(
        `SELECT id, storage_key, source_id, title, duration_seconds, byte_size
         FROM douyin_video_caches
         WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE' AND expires_at > NOW()`,
        [cacheId, user.id],
      );
      cachedSource = cacheResult.rows[0];
    }
    const source = cachedSource
      ? {
          title: cachedSource.title,
          sourceId: cachedSource.source_id,
          durationSeconds: Number(cachedSource.duration_seconds),
        }
      : await inspectDouyinVideo(sourceUrl);
    if (body?.action === "analyze") {
      const cache = await createSourceCache(user.id, sourceUrl, source);
      await audit(user.id, "DOUYIN_VIDEO_ANALYZED", request, undefined, {
        sourceId: source.sourceId,
        durationSeconds: source.durationSeconds,
        cacheId: cache.id,
      });
      return NextResponse.json({
        status: "ANALYZED",
        title: source.title,
        durationSeconds: source.durationSeconds,
        clipRequired: source.durationSeconds > 15,
        clipDurations: [5, 10, 15],
        cacheId: cache.id,
        cachePreviewUrl: cache.previewUrl,
        cacheByteSize: cache.byteSize,
        cacheExpiresAt: cache.expiresAt,
        referencePrompt: referencePrompt(source.title, source.durationSeconds),
        keyframeSeconds: keyframeSeconds(source.durationSeconds),
      });
    }
    const clip = resolveDouyinClip(
      source.durationSeconds,
      body?.startSeconds,
      body?.clipDurationSeconds,
    );
    let cacheDirectory = "";
    const imported = cachedSource
      ? await (async () => {
          cacheDirectory = await mkdtemp(join(tmpdir(), "aigc-douyin-cache-"));
          const cachedPath = join(cacheDirectory, "source.mp4");
          try {
            await downloadObjectToFile(cachedSource.storage_key, cachedPath);
            return await importCachedDouyinVideo(cachedPath, source, clip, cacheDirectory);
          } catch (error) {
            await rm(cacheDirectory, { recursive: true, force: true }).catch(() => undefined);
            throw error;
          }
        })()
      : await downloadDouyinVideo(sourceUrl, source, clip);
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
