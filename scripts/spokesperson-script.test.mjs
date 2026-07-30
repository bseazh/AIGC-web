import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../app/api/workflows/model-spokesperson-script/route.ts", import.meta.url),
  "utf8",
);
const start = source.indexOf("const tones");
const end = source.indexOf("export async function POST");
assert.ok(start >= 0 && end > start, "spokesperson script generator source is missing");

const compiled = ts.transpileModule(
  `const randomUUID = () => "test-segment";\n${source.slice(start, end)}\nglobalThis.createSegments = createSegments;`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;
const context = {};
vm.createContext(context);
vm.runInContext(compiled, context);

const createSegments = context.createSegments;
assert.equal(typeof createSegments, "function");
const expected = {
  15: { segments: 4, min: 35, max: 85 },
  30: { segments: 5, min: 80, max: 160 },
  60: { segments: 6, min: 160, max: 320 },
};

for (const duration of [15, 30, 60]) {
  const segments = createSegments({
    productName: "轻氧便携榨汁杯",
    points: [
      "轻巧便携",
      "充电一次可使用多次",
      "杯体容易清洗",
      "适合办公室和旅行",
    ],
    audience: "通勤上班族和健身人群",
    usageScene: "办公室、健身后和户外旅行",
    callToAction: "点击了解更多",
    tone: "natural",
    duration,
    variant: 0,
  });
  const characterCount = segments
    .map((segment) => segment.narration)
    .join("")
    .replace(/\s/g, "").length;
  assert.equal(segments.length, expected[duration].segments);
  assert.ok(
    characterCount >= expected[duration].min &&
      characterCount <= expected[duration].max,
    `${duration}s script has ${characterCount} characters`,
  );
  assert.ok(
    segments.every(
      (segment) => segment.timeRange && segment.narration && segment.visual,
    ),
  );
}

console.log("PASS: model spokesperson scripts fit selected durations");
