import type { KeyframeSelection } from "./types";

export async function sha256Hex(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function formatBytes(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  const kb = byteSize / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function defaultKeyframes(durationSeconds?: number, offsetSeconds = 0): KeyframeSelection[] {
  const duration = Math.max(3, Number(durationSeconds) || 15);
  const usableEnd = Math.max(0.3, duration - 0.2);
  const frameCount = duration >= 12 ? 12 : duration >= 8 ? 9 : 8;
  const ratios = Array.from({ length: frameCount }, (_, index) => (index + 0.5) / frameCount);
  return ratios.map((ratio, index) => ({
    time: Math.round((offsetSeconds + Math.min(usableEnd, Math.max(0, duration * ratio))) * 10) / 10,
    label: `关键画面 ${index + 1}`,
  }));
}
