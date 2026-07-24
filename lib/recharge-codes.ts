import { createHash, randomBytes } from "node:crypto";

export function normalizeRechargeCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 12 && normalized.length <= 48 ? normalized : null;
}

export function digestRechargeCode(value: string) {
  const secret = process.env.RECHARGE_CODE_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("RECHARGE_CODE_SECRET or SESSION_SECRET must contain at least 32 characters");
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

export function createRechargeCode() {
  const raw = `BALA${randomBytes(12).toString("hex").toUpperCase()}`;
  return raw.match(/.{1,4}/g)?.join("-") || raw;
}
