import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export const DOUYIN_MIN_DURATION_SECONDS = 3;
export const DOUYIN_MAX_DURATION_SECONDS = 15;
export const DOUYIN_MAX_BYTES = 100 * 1024 * 1024;

const execute = promisify(execFile);
const ytDlpPath =
  process.env.YT_DLP_PATH ||
  (process.platform === "darwin" ? "yt-dlp" : "/usr/local/bin/yt-dlp");
const ffprobePath =
  process.env.FFPROBE_PATH ||
  (process.platform === "darwin" ? "ffprobe" : "/usr/bin/ffprobe");

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
  url.hash = "";
  return url.toString();
}

function durationMessage(duration: number) {
  return `该视频 ${duration.toFixed(1)} 秒，当前仅支持 ${DOUYIN_MIN_DURATION_SECONDS}–${DOUYIN_MAX_DURATION_SECONDS} 秒。为避免截错内容，系统不会自动裁剪，请先剪辑后上传，或粘贴剪辑后作品的链接。`;
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
      durationMessage(duration),
      422,
      {
        durationSeconds: duration,
        maxDurationSeconds: DOUYIN_MAX_DURATION_SECONDS,
      },
    );
  }
  return duration;
}

function commonArgs() {
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "10",
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

export type ImportedDouyinVideo = {
  filePath: string;
  title: string;
  sourceId: string | null;
  durationSeconds: number;
  byteSize: number;
  cleanup: () => Promise<void>;
};

export async function downloadDouyinVideo(
  sourceUrl: string,
): Promise<ImportedDouyinVideo> {
  const directory = await mkdtemp(join(tmpdir(), "aigc-douyin-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    const metadataResult = await execute(
      ytDlpPath,
      [...commonArgs(), "--dump-single-json", sourceUrl],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const metadata = JSON.parse(metadataResult.stdout.trim()) as {
      duration?: number;
      title?: string;
      id?: string;
    };
    validateDouyinDuration(metadata.duration);

    await execute(
      ytDlpPath,
      [
        ...commonArgs(),
        "--match-filters",
        `duration >= ${DOUYIN_MIN_DURATION_SECONDS} & duration <= ${DOUYIN_MAX_DURATION_SECONDS}`,
        "--max-filesize",
        "100M",
        "--format",
        "b[ext=mp4]/b",
        "--remux-video",
        "mp4",
        "--output",
        join(directory, "reference.%(ext)s"),
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
    const filePath = join(directory, fileName);
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
    const title = String(metadata.title || "抖音对标视频")
      .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
      .trim()
      .slice(0, 220);
    return {
      filePath,
      title: `${title || "抖音对标视频"}.mp4`,
      sourceId: typeof metadata.id === "string" ? metadata.id : null,
      durationSeconds: Math.round(durationSeconds * 1000) / 1000,
      byteSize: file.size,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    if (error instanceof DouyinImportError) throw error;
    const message = error instanceof Error ? error.message : "unknown error";
    if (/ENOENT/.test(message)) {
      throw new DouyinImportError(
        "DOUYIN_IMPORT_UNAVAILABLE",
        "抖音导入服务暂不可用，请改用本地上传",
        503,
      );
    }
    if (/Fresh cookies|Sign in to confirm|cookies.*needed/i.test(message)) {
      throw new DouyinImportError(
        "DOUYIN_COOKIES_EXPIRED",
        "抖音解析服务正在更新，请稍后重试或改用本地上传",
        503,
      );
    }
    if (/timed out|TIMEOUT/i.test(message)) {
      throw new DouyinImportError(
        "DOUYIN_IMPORT_TIMEOUT",
        "抖音响应超时，请稍后重试或改用本地上传",
        504,
      );
    }
    throw new DouyinImportError(
      "DOUYIN_IMPORT_FAILED",
      "链接解析失败，请确认作品可公开播放，并粘贴最新的分享链接",
      422,
    );
  }
}
