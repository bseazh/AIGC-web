import assert from "node:assert/strict";

import {
  DOUYIN_MAX_DURATION_SECONDS,
  DouyinImportError,
  normalizeDouyinUrl,
  validateDouyinDuration,
} from "../lib/douyin-import.ts";

assert.equal(
  new URL(
    normalizeDouyinUrl("3.45 复制打开抖音 https://v.douyin.com/abc123/ 看作品"),
  ).hostname,
  "v.douyin.com",
);
assert.equal(
  normalizeDouyinUrl("https://www.douyin.com/video/1234567890）"),
  "https://www.douyin.com/video/1234567890",
);
assert.throws(
  () => normalizeDouyinUrl("https://douyin.com.evil.example/video/123"),
  (error) =>
    error instanceof DouyinImportError &&
    error.code === "UNSUPPORTED_VIDEO_URL",
);
assert.equal(validateDouyinDuration(DOUYIN_MAX_DURATION_SECONDS), 15);
assert.throws(
  () => validateDouyinDuration(15.1),
  (error) =>
    error instanceof DouyinImportError &&
    error.code === "DOUYIN_VIDEO_DURATION_UNSUPPORTED" &&
    error.message.includes("不会自动裁剪"),
);

console.log("PASS: Douyin URL and duration validation");
