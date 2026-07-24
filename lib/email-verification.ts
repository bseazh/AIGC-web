import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { emailLayout, sendEmail } from "@/lib/email";
import { redis } from "@/lib/redis";

const CODE_TTL_SECONDS = 5 * 60;
const RESEND_SECONDS = 60;

function verificationSecret() {
  const value = process.env.EMAIL_CODE_SECRET || process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("EMAIL_CODE_SECRET must contain at least 32 characters");
  return value;
}

function codeDigest(email: string, code: string) {
  return createHmac("sha256", verificationSecret()).update(`${email}:${code}`).digest("hex");
}

export async function sendVerificationCode(email: string, ip: string) {
  const cooldownKey = `email-code:cooldown:${email}`;
  if (await redis.exists(cooldownKey)) return { ok: false as const, reason: "COOLDOWN" as const };

  const hourKey = `email-code:hour:${email}`;
  const dayEmailKey = `email-code:day:email:${email}`;
  const dayIpKey = `email-code:day:ip:${ip}`;
  const [hourCount, dayEmailCount, dayIpCount] = await Promise.all([
    redis.incr(hourKey), redis.incr(dayEmailKey), redis.incr(dayIpKey),
  ]);
  await Promise.all([
    hourCount === 1 ? redis.expire(hourKey, 3600) : null,
    dayEmailCount === 1 ? redis.expire(dayEmailKey, 86400) : null,
    dayIpCount === 1 ? redis.expire(dayIpKey, 86400) : null,
  ]);
  if (hourCount > 5 || dayEmailCount > 10 || dayIpCount > 30) {
    return { ok: false as const, reason: "RATE_LIMIT" as const };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await sendEmail(email, "芭乐AIGC 邮箱验证码", emailLayout(`<p>你的注册验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>验证码 5 分钟内有效。若非本人操作，请忽略此邮件。</p>`));
  await redis.multi()
    .set(`email-code:value:${email}`, codeDigest(email, code), "EX", CODE_TTL_SECONDS)
    .set(cooldownKey, "1", "EX", RESEND_SECONDS)
    .exec();
  return { ok: true as const, expiresIn: CODE_TTL_SECONDS, retryAfter: RESEND_SECONDS };
}

export async function consumeVerificationCode(email: string, code: unknown) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const key = `email-code:value:${email}`;
  const attemptsKey = `email-code:attempts:${email}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, CODE_TTL_SECONDS);
  if (attempts > 5) return false;
  const stored = await redis.get(key);
  if (!stored) return false;
  const actual = Buffer.from(codeDigest(email, code), "hex");
  const expected = Buffer.from(stored, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  await redis.del(key, attemptsKey);
  return true;
}
