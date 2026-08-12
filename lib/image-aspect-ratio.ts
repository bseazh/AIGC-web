export type ImageAspectRatioSelection = {
  mode: "auto" | "preset" | "custom";
  requested: string;
  normalized: string;
  width: number | null;
  height: number | null;
};

const MAX_RATIO_PART = 10_000;

function greatestCommonDivisor(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function parseImageAspectRatio(value: unknown, presets: readonly string[], fallback: string): ImageAspectRatioSelection | null {
  const requested = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (requested === "auto" || requested === "保持原比例") {
    return { mode: "auto", requested: requested || "auto", normalized: "auto", width: null, height: null };
  }
  if (presets.includes(requested)) {
    return { mode: "preset", requested, normalized: requested, width: null, height: null };
  }
  const match = requested.match(/^(\d{1,5})\s*:\s*(\d{1,5})$/);
  if (!match) {
    if (!requested) return parseImageAspectRatio(fallback, presets, "1:1");
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_RATIO_PART || height > MAX_RATIO_PART) return null;
  const divisor = greatestCommonDivisor(width, height);
  return { mode: "custom", requested: `${width}:${height}`, normalized: `${width / divisor}:${height / divisor}`, width, height };
}
