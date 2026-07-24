import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { emailLayout, sendEmail } from "@/lib/email";
import { normalizeIdentifier } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { requestIp } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const identifier = normalizeIdentifier(body?.email);
  if (!identifier || identifier.type !== "email") return NextResponse.json({ code: "INVALID_EMAIL", message: "请输入有效邮箱" }, { status: 400 });
  const ip = requestIp(request);
  const rateKey = `password-reset:rate:${createHash("sha256").update(`${identifier.value}:${ip}`).digest("hex")}`;
  const attempts = await redis.incr(rateKey);
  if (attempts === 1) await redis.expire(rateKey, 3600);
  if (attempts > 5) return NextResponse.json({ code: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" }, { status: 429 });

  const found = await db.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE LOWER(email) = $1 AND status = 'ACTIVE' LIMIT 1", [identifier.value]);
  const user = found.rows[0];
  if (user) {
    const token = randomBytes(32).toString("base64url");
    const digest = createHash("sha256").update(token).digest("hex");
    await db.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    await db.query("INSERT INTO password_reset_tokens (user_id, token_digest, expires_at, requested_ip) VALUES ($1, $2, NOW() + INTERVAL '30 minutes', $3)", [user.id, digest, ip]);
    const baseUrl = process.env.PUBLIC_APP_URL || new URL(request.url).origin;
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await sendEmail(user.email, "重置你的芭乐AIGC密码", emailLayout(`<p>我们收到了密码重置请求。请在 30 分钟内点击以下链接：</p><p><a href="${resetUrl}">重置密码</a></p><p>若非本人操作，请忽略此邮件；你的原密码不会改变。</p>`));
      await audit(user.id, "PASSWORD_RESET_REQUESTED", request, { type: "user", id: user.id });
    } catch (error) { console.error("password reset email failed", error); }
  }
  return NextResponse.json({ ok: true, message: "如果该邮箱已注册，重置邮件会在几分钟内送达" }, { status: 202 });
}
