import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export const DOUYIN_MIN_DURATION_SECONDS = 3;
export const DOUYIN_MAX_DURATION_SECONDS = 15;
export const DOUYIN_MAX_SOURCE_DURATION_SECONDS = 30 * 60;
export const DOUYIN_MAX_BYTES = 100 * 1024 * 1024;
export const DOUYIN_CLIP_DURATIONS = [5, 10, 15] as const;
const DOUYIN_INSPECT_TIMEOUT_MS = 60_000;

const execute = promisify(execFile);
const ytDlpPath =
  process.env.YT_DLP_PATH ||
  (process.platform === "darwin" ? "yt-dlp" : "/usr/local/bin/yt-dlp");
const ffprobePath =
  process.env.FFPROBE_PATH ||
  (process.platform === "darwin" ? "ffprobe" : "/usr/bin/ffprobe");
const ffmpegPath =
  process.env.FFMPEG_PATH ||
  (process.platform === "darwin" ? "ffmpeg" : "/usr/bin/ffmpeg");

export class DouyinImportError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeDouyinUrl(input: unknown) {
  if (typeof input !== "string" || input.length > 5000) {
    throw new DouyinImportError(
      "INVALID_DOUYIN_URL",
      "请粘贴有效的抖音分享链接",
    );
  }
  const match = input.match(/https?:\/\/[^\s]+/i);
  if (!match)
    throw new DouyinImportError("INVALID_DOUYIN_URL", "未识别到抖音分享链接");
  let url: URL;
  try {
    url = new URL(match[0].replace(/[，。；、!！?？)）\]}>'”’]+$/, ""));
  } catch {
    throw new DouyinImportError("INVALID_DOUYIN_URL", "抖音分享链接格式不正确");
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = ["douyin.com", "iesdouyin.com"].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (
    !allowed ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new DouyinImportError(
      "UNSUPPORTED_VIDEO_URL",
      "目前仅支持抖音分享链接",
    );
  }
  const modalId = url.searchParams.get("modal_id");
  if (modalId && /^\d{8,30}$/.test(modalId)) {
    url = new URL(`https://www.douyin.com/video/${modalId}`);
  }
  const pathname = url.pathname.toLowerCase();
  const supportedPath =
    hostname === "v.douyin.com" ||
    /\/video\/\d+/.test(pathname) ||
    /\/note\/\d+/.test(pathname) ||
    /\/share\/video\/\d+/.test(pathname) ||
    /\/modal\/profile\/\d+/.test(pathname);
  if (!supportedPath) {
    throw new DouyinImportError(
      "UNSUPPORTED_DOUYIN_PAGE",
      "请打开具体抖音作品后复制分享链接；搜索页、音乐页和合集页暂不支持直接解析",
      422,
    );
  }
  url.hash = "";
  return url.toString();
}

export function validateDouyinDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new DouyinImportError(
      "DOUYIN_DURATION_UNKNOWN",
      "无法读取该视频时长，请确认作品可以公开播放后重试",
      422,
    );
  }
  if (
    duration < DOUYIN_MIN_DURATION_SECONDS ||
    duration > DOUYIN_MAX_DURATION_SECONDS
  ) {
    throw new DouyinImportError(
      "DOUYIN_VIDEO_DURATION_UNSUPPORTED",
      `截取结果为 ${duration.toFixed(1)} 秒，必须在 ${DOUYIN_MIN_DURATION_SECONDS}–${DOUYIN_MAX_DURATION_SECONDS} 秒之间`,
      422,
      {
        durationSeconds: duration,
        maxDurationSeconds: DOUYIN_MAX_DURATION_SECONDS,
      },
    );
  }
  return duration;
}

function cleanTitle(value: unknown) {
  return String(value || "抖音对标视频")
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .trim()
    .slice(0, 200);
}

function validateSourceDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new DouyinImportError(
      "DOUYIN_DURATION_UNKNOWN",
      "无法读取该视频时长，请确认作品可以公开播放后重试",
      422,
    );
  }
  if (duration < DOUYIN_MIN_DURATION_SECONDS) {
    throw new DouyinImportError(
      "DOUYIN_VIDEO_TOO_SHORT",
      `该视频只有 ${duration.toFixed(1)} 秒，对标视频至少需要 ${DOUYIN_MIN_DURATION_SECONDS} 秒`,
      422,
      { durationSeconds: duration },
    );
  }
  if (duration > DOUYIN_MAX_SOURCE_DURATION_SECONDS) {
    throw new DouyinImportError(
      "DOUYIN_SOURCE_TOO_LONG",
      "原视频超过 30 分钟，请先在抖音剪辑后再导入",
      422,
      { durationSeconds: duration },
    );
  }
  return duration;
}

export type DouyinVideoInfo = {
  title: string;
  sourceId: string | null;
  durationSeconds: number;
};

export type DouyinClip = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  isFullVideo: boolean;
};

export function resolveDouyinClip(
  sourceDurationValue: unknown,
  startValue?: unknown,
  durationValue?: unknown,
): DouyinClip {
  const sourceDuration = validateSourceDuration(sourceDurationValue);
  if (sourceDuration <= DOUYIN_MAX_DURATION_SECONDS && durationValue == null) {
    return {
      startSeconds: 0,
      endSeconds: sourceDuration,
      durationSeconds: sourceDuration,
      isFullVideo: true,
    };
  }
  const startSeconds = Math.round(Number(startValue) * 10) / 10;
  const durationSeconds = Number(durationValue);
  if (!Number.isFinite(startSeconds) || startSeconds < 0) {
    throw new DouyinImportError(
      "DOUYIN_CLIP_RANGE_INVALID",
      "请选择有效的片段开始时间",
      400,
    );
  }
  if (!DOUYIN_CLIP_DURATIONS.includes(durationSeconds as 5 | 10 | 15)) {
    throw new DouyinImportError(
      "DOUYIN_CLIP_DURATION_INVALID",
      "片段长度只能选择 5、10 或 15 秒",
      400,
    );
  }
  const endSeconds = Math.round((startSeconds + durationSeconds) * 10) / 10;
  if (endSeconds > sourceDuration + 0.05) {
    throw new DouyinImportError(
      "DOUYIN_CLIP_RANGE_INVALID",
      `所选片段超出原视频范围，最晚可从 ${(sourceDuration - durationSeconds).toFixed(1)} 秒开始`,
      400,
      { durationSeconds: sourceDuration },
    );
  }
  return { startSeconds, endSeconds, durationSeconds, isFullVideo: false };
}

function commonArgs() {
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "20",
    "--retries",
    "1",
    "--fragment-retries",
    "1",
  ];
  const cookiesFile =
    process.env.DOUYIN_COOKIES_FILE ||
    (process.platform === "linux"
      ? "/home/ubuntu/secrets/douyin-cookies.txt"
      : "");
  if (cookiesFile && existsSync(cookiesFile))
    args.push("--cookies", cookiesFile);
  else {
    const browserProfile =
      process.env.DOUYIN_BROWSER_PROFILE ||
      (process.platform === "linux"
        ? "/home/ubuntu/.cache/aigc-douyin-profile"
        : "");
    if (
      browserProfile &&
      existsSync(join(browserProfile, "Default", "Cookies"))
    ) {
      args.push("--cookies-from-browser", `chromium:${browserProfile}`);
    }
  }
  const impersonate =
    process.env.YT_DLP_IMPERSONATE ||
    (process.platform === "linux" ? "chrome" : "");
  if (impersonate) args.push("--impersonate", impersonate);
  return args;
}

function executionError(error: unknown) {
  if (error instanceof DouyinImportError) return error;
  const message = error instanceof Error ? error.message : "unknown error";
  if (/ENOENT/.test(message)) {
    return new DouyinImportError(
      "DOUYIN_IMPORT_UNAVAILABLE",
      "抖音导入服务暂不可用，请改用本地上传",
      503,
    );
  }
  if (/Fresh cookies|Sign in to confirm|cookies.*needed/i.test(message)) {
    return new DouyinImportError(
      "DOUYIN_COOKIES_EXPIRED",
      "抖音解析服务正在更新，请稍后重试或改用本地上传",
      503,
    );
  }
  if (/timed out|TIMEOUT/i.test(message)) {
    return new DouyinImportError(
      "DOUYIN_IMPORT_TIMEOUT",
      "抖音响应超时，请稍后重试或改用本地上传",
      504,
    );
  }
  return new DouyinImportError(
    "DOUYIN_IMPORT_FAILED",
    "链接解析失败，请确认作品可公开播放，并粘贴最新的分享链接",
    422,
  );
}

export async function inspectDouyinVideo(
  sourceUrl: string,
): Promise<DouyinVideoInfo> {
  try {
    const result = await execute(
      ytDlpPath,
      [...commonArgs(), "--dump-single-json", sourceUrl],
      { timeout: DOUYIN_INSPECT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
    );
    const metadata = JSON.parse(result.stdout.trim()) as {
      duration?: number;
      title?: string;
      id?: string;
    };
    return {
      title: cleanTitle(metadata.title),
      sourceId: typeof metadata.id === "string" ? metadata.id : null,
      durationSeconds:
        Math.round(validateSourceDuration(metadata.duration) * 1000) / 1000,
    };
  } catch (error) {
    throw executionError(error);
  }
}

export type ImportedDouyinVideo = {
  filePath: string;
  title: string;
  sourceId: string | null;
  sourceDurationSeconds: number;
  clipStartSeconds: number;
  clipEndSeconds: number;
  durationSeconds: number;
  byteSize: number;
  cleanup: () => Promise<void>;
};

export async function downloadDouyinVideo(
  sourceUrl: string,
  metadata: DouyinVideoInfo,
  clip: DouyinClip,
): Promise<ImportedDouyinVideo> {
  const directory = await mkdtemp(join(tmpdir(), "aigc-douyin-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    await execute(
      ytDlpPath,
      [
        ...commonArgs(),
        ...(clip.isFullVideo
          ? ["--max-filesize", "100M"]
          : [
              "--download-sections",
              `*${clip.startSeconds}-${clip.endSeconds}`,
              "--force-keyframes-at-cuts",
            ]),
        "--format",
        "b[ext=mp4]/b",
        "--remux-video",
        "mp4",
        "--output",
        join(directory, "source.%(ext)s"),
        sourceUrl,
      ],
      { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const fileName = (await readdir(directory)).find((name) =>
      name.endsWith(".mp4"),
    );
    if (!fileName)
      throw new DouyinImportError(
        "DOUYIN_DOWNLOAD_FORMAT",
        "该作品无法转换为 MP4，请换一个链接重试",
        422,
      );
    const downloadedPath = join(directory, fileName);
    const filePath = clip.isFullVideo
      ? downloadedPath
      : join(directory, "reference-clipped.mp4");
    if (!clip.isFullVideo) {
      await execute(
        ffmpegPath,
        [
          "-y",
          "-i",
          downloadedPath,
          "-t",
          String(clip.durationSeconds),
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          filePath,
        ],
        { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
      );
    }
    const file = await stat(filePath);
    if (file.size <= 0 || file.size > DOUYIN_MAX_BYTES) {
      throw new DouyinImportError(
        "DOUYIN_VIDEO_TOO_LARGE",
        "视频文件超过 100MB，无法导入",
        422,
      );
    }
    const probeResult = await execute(
      ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    const probe = JSON.parse(probeResult.stdout) as {
      format?: { duration?: string; format_name?: string };
    };
    const durationSeconds = validateDouyinDuration(probe.format?.duration);
    if (
      !String(probe.format?.format_name || "")
        .split(",")
        .includes("mp4")
    ) {
      throw new DouyinImportError(
        "DOUYIN_DOWNLOAD_FORMAT",
        "下载结果不是有效 MP4，请换一个链接重试",
        422,
      );
    }
    const clipLabel = clip.isFullVideo
      ? ""
      : ` ${clip.startSeconds.toFixed(1)}-${clip.endSeconds.toFixed(1)}s`;
    return {
      filePath,
      title: `${metadata.title}${clipLabel}.mp4`.slice(0, 255),
      sourceId: metadata.sourceId,
      sourceDurationSeconds: metadata.durationSeconds,
      clipStartSeconds: clip.startSeconds,
      clipEndSeconds: clip.endSeconds,
      durationSeconds: Math.round(durationSeconds * 1000) / 1000,
      byteSize: file.size,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw executionError(error);
  }
}
