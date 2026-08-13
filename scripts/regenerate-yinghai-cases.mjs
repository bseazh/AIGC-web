#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import sharp from "sharp";
import { fetch as undiciFetch, ProxyAgent } from "undici";

function loadEnv() {
  for (const file of [".env.production", ".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadEnv();

const root = resolve(new URL("..", import.meta.url).pathname);
const manifestPath = resolve(process.env.CASE_REMAKE_MANIFEST || `${root}/data/image-case-remakes/manifest.json`);
const sourceDir = resolve(process.env.YINGHAI_OUTPUT_DIR || `${root}/data/yinghai-cases`);
const sourceBase = (process.env.YINGHAI_BASE_URL || "https://yinghai.xin").replace(/\/$/, "");
const model = process.env.GOOGLE_IMAGE_MODEL || "gemini-2.5-flash-image";
const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY;
const limitFlag = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitFlag ? Math.max(1, Number(limitFlag.split("=")[1]) || 1) : Number.POSITIVE_INFINITY;
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");
const requestedRoles = new Set((process.argv.find((value) => value.startsWith("--roles="))?.split("=")[1] || "result,reference,product,other").split(","));

for (const name of ["COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY"]) if (!process.env[name]) throw new Error(`${name} is required`);
if (!apiKey) throw new Error("GOOGLE_AI_API_KEY or equivalent is required");

const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY });
const proxyUrl = process.env.GOOGLE_AI_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
const googleFetch = (url, init) => proxyUrl ? undiciFetch(url, { ...init, dispatcher: new ProxyAgent(proxyUrl) }) : fetch(url, init);
const sourceHeaders = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36", Referer: `${sourceBase}/image-generate` };

const supportedRatios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
function nearestRatio(width, height) {
  const target = width / height;
  return supportedRatios.reduce((best, value) => {
    const [w, h] = value.split(":").map(Number);
    const [bw, bh] = best.split(":").map(Number);
    return Math.abs(Math.log((w / h) / target)) < Math.abs(Math.log((bw / bh) / target)) ? value : best;
  }, "1:1");
}

const ratioEnum = {
  "1:1": "ASPECT_RATIO_ONE_BY_ONE", "2:3": "ASPECT_RATIO_TWO_BY_THREE", "3:2": "ASPECT_RATIO_THREE_BY_TWO",
  "3:4": "ASPECT_RATIO_THREE_BY_FOUR", "4:3": "ASPECT_RATIO_FOUR_BY_THREE", "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
  "5:4": "ASPECT_RATIO_FIVE_BY_FOUR", "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN", "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
  "21:9": "ASPECT_RATIO_TWENTY_ONE_BY_NINE",
};

function rolePrompt(role, title, configKey) {
  const roleDirection = role === "result"
    ? "重建其商业用途、版式节奏、主体占比、镜头景别、光线方向、色彩关系和留白功能。"
    : role === "product"
      ? "创建同品类但设计语言、几何结构、颜色材质、包装和品牌均不同的新商品素材。"
      : role === "reference"
        ? "只重建其构图组织、视觉层级、场景功能和摄影语言，所有具体内容必须替换。"
        : "只提取画幅、构图和视觉功能，用全新内容重新实现。";
  return [
    "你正在为一个全新的电商案例库创作原创替代素材。输入图片只用于理解视觉功能，不能作为要复制的内容。",
    `案例标题：${title}；模块：${configKey}；素材角色：${role}。`,
    roleDirection,
    "必须产生显著不同的新内容：更换商品款式与品牌、更换人物身份与服装、更换文字内容与排版细节、更换具体场景道具；不得保留原商标、Logo、包装、可识别真人身份、原文案、价格、二维码或水印。",
    "可以保留抽象的商业功能，例如首屏主图、材质特写、使用场景、功能卖点、模特展示或详情页节奏，但不要逐像素临摹，不要复刻独特角色造型或独特品牌视觉。",
    "如果原图含文字，最终图片不要生成任何可读文字，只保留适合后期排版的空白区域。",
    "成片必须是完整高清商业图片，不是对比图、拼贴、分析板、截图或带边框样机。只返回最终图片。",
  ].join("\n");
}

function parseImage(payload) {
  const parts = (payload?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []);
  return parts.find((part) => part?.inlineData?.data || part?.inline_data?.data)?.inlineData || parts.find((part) => part?.inline_data?.data)?.inline_data || null;
}

async function generate(sourceBuffer, mimeType, aspectRatio, prompt) {
  const prepared = await sharp(sourceBuffer).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const body = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: prepared.toString("base64") } }] }],
    generationConfig: { responseModalities: ["IMAGE"], responseFormat: { image: { aspectRatio: ratioEnum[aspectRatio] || ratioEnum["1:1"] } } },
  };
  const endpoint = `${(process.env.GOOGLE_AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "")}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await googleFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  const image = parseImage(payload);
  if (!response.ok || !image?.data) throw new Error(`Gemini ${response.status}: ${payload?.error?.message || "image generation failed"}`);
  return { buffer: Buffer.from(image.data, "base64"), contentType: image.mimeType || image.mime_type || mimeType || "image/png" };
}

function putObject(Key, Body, ContentType) {
  return new Promise((resolvePromise, reject) => cos.putObject({ Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION, Key, Body, ContentType }, (error) => error ? reject(error) : resolvePromise()));
}

async function loadSources() {
  const files = (await import("node:fs/promises")).readdir(sourceDir);
  const result = [];
  for (const file of (await files).filter((name) => name.endsWith(".json") && name !== "manifest.json")) {
    const data = JSON.parse(await readFile(`${sourceDir}/${file}`, "utf8"));
    for (const item of data.cases || []) {
      for (const [index, image] of (item.images || []).entries()) {
        if (!requestedRoles.has(image.role)) continue;
        result.push({ id: createHash("sha256").update(image.url).digest("hex").slice(0, 24), configKey: data.configKey, caseId: item.id, title: item.title, sourceUrl: image.url, sourcePath: image.path, role: image.role, order: index });
      }
    }
  }
  return result;
}

await mkdir(dirname(manifestPath), { recursive: true });
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, "utf8")) : { version: 1, generatedAt: null, source: sourceBase, model, items: [] };
const completed = new Map((manifest.items || []).map((item) => [item.id, item]));
const sources = await loadSources();
let attempted = 0;

for (const source of sources) {
  if (!force && completed.get(source.id)?.status === "succeeded") continue;
  if (attempted >= limit) break;
  attempted += 1;
  console.log(`[${attempted}/${Math.min(limit, sources.length)}] ${source.configKey} ${source.role} ${source.title}`);
  if (dryRun) continue;
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(source.sourceUrl, { headers: sourceHeaders });
    if (!response.ok) throw new Error(`source ${response.status}`);
    const sourceBuffer = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height) throw new Error("source dimensions missing");
    const aspectRatio = nearestRatio(metadata.width, metadata.height);
    const generated = await generate(sourceBuffer, response.headers.get("content-type") || "image/png", aspectRatio, rolePrompt(source.role, source.title, source.configKey));
    const extension = generated.contentType.includes("jpeg") ? "jpg" : generated.contentType.includes("webp") ? "webp" : "png";
    const key = `case-library/yinghai-remakes/${source.configKey}/${source.caseId}/${source.order + 1}-${source.id}.${extension}`;
    await putObject(key, generated.buffer, generated.contentType);
    completed.set(source.id, { ...source, status: "succeeded", storageKey: key, aspectRatio, sourceDimensions: { width: metadata.width, height: metadata.height }, generatedAt: new Date().toISOString(), startedAt });
  } catch (error) {
    completed.set(source.id, { ...source, status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : String(error), startedAt, failedAt: new Date().toISOString() });
    console.error(`FAILED ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
  manifest.items = [...completed.values()];
  manifest.generatedAt = new Date().toISOString();
  manifest.model = model;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

const summary = { totalSources: sources.length, attempted, succeeded: [...completed.values()].filter((item) => item.status === "succeeded").length, failed: [...completed.values()].filter((item) => item.status === "failed").length, manifestPath };
console.log(JSON.stringify(summary, null, 2));
