import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

import { contentReviewEnabled } from "@/lib/content-review";
import { createSignedObjectUrl, downloadObjectToFile, uploadLocalObject } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { storageSummary } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const execute = promisify(execFile);
const ffmpegPath =
  process.env.FFMPEG_PATH ||
  (process.platform === "darwin" ? "ffmpeg" : "/usr/bin/ffmpeg");

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function targetSize(aspectRatio: unknown) {
  return aspectRatio === "16:9"
    ? { width: 1280, height: 720, label: "16:9" }
    : { width: 720, height: 1280, label: "9:16" };
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!validUuid(body?.assetId))
    return NextResponse.json({ code: "INVALID_ASSET", message: "请先准备对标 MP4" }, { status: 400 });
  const result = await db.query<{
    id: string;
    storage_key: string;
    mime_type: string;
    byte_size: string;
    original_name: string | null;
    metadata_json: Record<string, unknown>;
  }>(
    "SELECT id, storage_key, mime_type, byte_size, original_name, metadata_json FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY'",
    [body.assetId, user.id],
  );
  const source = result.rows[0];
  if (!source || source.mime_type !== "video/mp4")
    return NextResponse.json({ code: "ASSET_NOT_FOUND", message: "请提供可用 MP4 对标视频" }, { status: 404 });

  const directory = await mkdtemp(join(tmpdir(), "recreate-video-sanitize-"));
  const inputPath = join(directory, "source.mp4");
  const outputPath = join(directory, "motion-structure-reference.mp4");
  const size = targetSize(body?.aspectRatio);
  try {
    await downloadObjectToFile(source.storage_key, inputPath);
    await execute(
      ffmpegPath,
      [
        "-y",
        "-i",
        inputPath,
        "-t",
        "15",
        "-an",
        "-vf",
        [
          "fps=15",
          "scale=720:-2:force_original_aspect_ratio=decrease",
          "format=gray",
          "edgedetect=low=0.06:high=0.18",
          "negate",
          "eq=contrast=1.22:brightness=0.03",
          `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease`,
          `pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2:color=white`,
          "drawgrid=w=iw/6:h=ih/10:t=1:c=black@0.12",
          "format=yuv420p",
        ].join(","),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const outputSize = (await stat(outputPath)).size;
    const storage = await storageSummary(user.id);
    if (storage.usedBytes + outputSize > storage.quotaBytes) {
      return NextResponse.json(
        { code: "STORAGE_QUOTA_EXCEEDED", message: "存储空间不足，请删除不需要的素材后重试", storage },
        { status: 413 },
      );
    }
    const storageKey = `users/${user.id}/inputs/${randomUUID()}-motion-structure-reference.mp4`;
    await uploadLocalObject(storageKey, outputPath, "video/mp4");
    const reviewEnabled = contentReviewEnabled();
    const metadata = {
      durationSeconds: Math.min(15, Number(source.metadata_json?.durationSeconds) || 15),
      sourceAssetId: source.id,
      privacyReference: true,
      transform: "edge-motion-structure-no-audio-minimum-ark-resolution",
      aspectRatio: size.label,
      pixelCount: size.width * size.height,
      generatedAt: new Date().toISOString(),
      moderation: reviewEnabled
        ? { status: "PENDING_REVIEW", submittedAt: new Date().toISOString() }
        : { status: "BYPASSED", bypassedAt: new Date().toISOString() },
    };
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO assets (owner_id, kind, storage_key, mime_type, byte_size, audit_status, original_name, metadata_json)
       VALUES ($1, 'INPUT', $2, 'video/mp4', $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [
        user.id,
        storageKey,
        outputSize,
        reviewEnabled ? "PENDING_REVIEW" : "READY",
        `动作结构参考-${source.original_name || "对标视频"}`,
        JSON.stringify(metadata),
      ],
    );
    return NextResponse.json({
      assetId: inserted.rows[0].id,
      url: await createSignedObjectUrl(storageKey, "GET", 3600),
      byteSize: outputSize,
      durationSeconds: metadata.durationSeconds,
      message: "已生成动作结构参考视频",
    });
  } catch (error) {
    console.error("recreate video sanitize failed", error);
    return NextResponse.json(
      { code: "SANITIZE_FAILED", message: error instanceof Error ? error.message : "合规参考视频生成失败" },
      { status: 500 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
