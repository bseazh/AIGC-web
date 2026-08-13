#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT_DIR = resolve(process.env.YINGHAI_OUTPUT_DIR || join(ROOT, "data", "yinghai-cases"));
const ASSET_DIR = join(OUTPUT_DIR, "assets");
const BASE_URL = (process.env.YINGHAI_BASE_URL || "https://yinghai.xin").replace(/\/$/, "");
const CONFIG_KEYS = [
  "image_generate_demo",
  "product_scene_image_demo",
  "create_model_demo",
  "model_wear_demo",
  "product_main_detail_demo",
  "detail_page_baihuo_demo",
  "detail_page_demo",
  "main_image_demo",
  "image_transform_demo",
  "image_baidi_tiqu",
  "image_enhance_demo",
  "multi_create_video_img",
];
const shouldDownload = process.argv.includes("--download");
const cookie = process.env.YINGHAI_COOKIE || "";

if (shouldDownload && process.env.YINGHAI_IMPORT_AUTHORIZED !== "true") {
  throw new Error("下载原站素材前请设置 YINGHAI_IMPORT_AUTHORIZED=true；默认只采集元数据和图片 URL。");
}

const headers = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
  Referer: `${BASE_URL}/image-generate`,
  ...(cookie ? { Cookie: cookie } : {}),
};

function isImageUrl(value) {
  return typeof value === "string" && /^(https?:)?\/\//i.test(value) &&
    (/\.(?:png|jpe?g|webp|avif)(?:[?#]|$)/i.test(value) || /(?:oss|image|upload|asset|media)/i.test(value));
}

function collectImages(value, path = [], found = []) {
  if (typeof value === "string") {
    if (isImageUrl(value)) found.push({ url: value, path: path.join(".") });
    return found;
  }
  if (Array.isArray(value)) value.forEach((item, index) => collectImages(item, [...path, String(index)], found));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => collectImages(item, [...path, key], found));
  return found;
}

function classify(path) {
  const key = path.toLowerCase();
  if (/result/.test(key)) return "result";
  if (/reference|cankatu|refence|参考/.test(key)) return "reference";
  if (/product|商品|img/.test(key)) return "product";
  return "other";
}

function uniqueImages(record) {
  const map = new Map();
  for (const item of collectImages(record)) {
    const role = classify(item.path);
    const existing = map.get(item.url);
    if (!existing || existing.role === "other") map.set(item.url, { ...item, role });
  }
  return [...map.values()];
}

function safeExt(url, contentType = "") {
  const fromUrl = extname(new URL(url).pathname).toLowerCase();
  if (/^\.(png|jpe?g|webp|avif)$/.test(fromUrl)) return fromUrl === ".jpeg" ? ".jpg" : fromUrl;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}

async function downloadImage(item, caseId, index) {
  const response = await fetch(item.url, { headers: { "User-Agent": headers["User-Agent"], Referer: `${BASE_URL}/image-generate` } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const file = `${caseId}-${String(index + 1).padStart(2, "0")}-${sha256.slice(0, 12)}${safeExt(item.url, response.headers.get("content-type") || "")}`;
  const path = join(ASSET_DIR, file);
  await writeFile(path, buffer, { flag: "wx" }).catch((error) => { if (error.code !== "EEXIST") throw error; });
  return { ...item, sha256, localPath: path.replace(`${ROOT}/`, "") };
}

await mkdir(OUTPUT_DIR, { recursive: true });
if (shouldDownload) await mkdir(ASSET_DIR, { recursive: true });

const manifest = {
  source: BASE_URL,
  endpoint: `${BASE_URL}/api/feature-cases`,
  collectedAt: new Date().toISOString(),
  authorization: process.env.YINGHAI_IMPORT_AUTHORIZED === "true" ? "provided-by-operator" : "unverified",
  downloadMode: shouldDownload ? "local-staging" : "url-only",
  configs: [],
};

for (const configKey of CONFIG_KEYS) {
  const endpoint = `${BASE_URL}/api/feature-cases?config_key=${encodeURIComponent(configKey)}`;
  try {
    const response = await fetch(endpoint, { headers });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
    const cases = Array.isArray(body?.cases) ? body.cases : [];
    const normalized = [];
    for (const record of cases) {
      const images = uniqueImages(record);
      const downloaded = shouldDownload ? await Promise.all(images.map((item, index) => downloadImage(item, record.id, index))) : images;
      normalized.push({
        id: record.id,
        configKey,
        title: record.title || "未命名案例",
        description: record.description || null,
        parameters: record.params || {},
        images: downloaded,
        sourceUrl: endpoint,
        sourceRecord: record,
      });
    }
    await writeFile(join(OUTPUT_DIR, `${configKey}.json`), JSON.stringify({ configKey, endpoint, cases: normalized }, null, 2));
    manifest.configs.push({ configKey, status: response.status, caseCount: normalized.length, imageCount: normalized.reduce((sum, item) => sum + item.images.length, 0), file: `${configKey}.json` });
    console.log(`${configKey}: ${response.status}, ${normalized.length} cases, ${normalized.reduce((sum, item) => sum + item.images.length, 0)} images`);
  } catch (error) {
    manifest.configs.push({ configKey, status: "error", error: error instanceof Error ? error.message : String(error) });
    console.error(`${configKey}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await writeFile(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${join(OUTPUT_DIR, "manifest.json")}`);
