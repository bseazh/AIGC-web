import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../app/api/workflows/model-spokesperson-script/route.ts", import.meta.url),
  "utf8",
);

assert.ok(source.includes("/chat/completions"), "spokesperson script generation must call an LLM chat endpoint");
assert.ok(source.includes("DEEPSEEK_API_KEY"), "spokesperson script generation should support DeepSeek credentials");
assert.ok(source.includes("SOPHNET_CHAT_API_KEY"), "spokesperson script generation should support SophNet Chat credentials");
assert.ok(source.includes("LLM_NOT_CONFIGURED"), "spokesperson script generation must fail clearly without an LLM");
assert.ok(source.includes("model_spokesperson_script_plans"), "spokesperson plan generation should log provider calls");
assert.ok(source.includes("45-65"), "15 second script prompt should enforce compact copy length");
assert.ok(source.includes("normalizePlans"), "LLM plan output should be normalized before returning");
assert.ok(!source.includes("function createPlans"), "A/B/C plans must not use template fallback generation");
assert.ok(!source.includes("function createSegments"), "spokesperson scripts must not use template fallback segments");
assert.ok(!source.includes("template"), "spokesperson route should not describe template-based generation");

console.log("PASS: model spokesperson scripts require LLM generation");
