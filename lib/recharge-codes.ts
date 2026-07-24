import { createHash, randomBytes } from "node:crypto";

export function normalizeRechargeCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 12 && normalized.length <= 48 ? normalized : null;
}

export function digestRechargeCode(value: string) {
  // Codes contain 96 bits of cryptographic entropy, so a stable one-way digest
  // is sufficient and remains valid across independently configured app nodes.
  return createHash("sha256").update(value).digest("hex");
}

export function createRechargeCode() {
  const raw = `BALA${randomBytes(12).toString("hex").toUpperCase()}`;
  return raw.match(/.{1,4}/g)?.join("-") || raw;
}
