import { NextRequest, NextResponse } from "next/server";
import { normalizeIdentifier } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendVerificationCode } from "@/lib/email-verification";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const identifier = normalizeIdentifier(body?.email);
  if (!identifier || identifier.type !== "email") {
    return NextResponse.json({ code: "INVALID_EMAIL", message: "请输入有效的邮箱地址" }, { status: 400 });
  }

  const existing = await db.query("SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1", [identifier.value]);
  if (existing.rowCount) {
    return NextResponse.json({ code: "ACCOUNT_EXISTS", message: "该邮箱已注册，请直接登录" }, { status: 409 });
  }

  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const result = await sendVerificationCode(identifier.value, ip);
    if (!result.ok) {
      const message = result.reason === "COOLDOWN" ? "验证码发送过于频繁，请稍后再试" : "今日发送次数已达上限，请稍后再试";
      return NextResponse.json({ code: result.reason, message }, { status: 429 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("email verification send failed", error);
    const unconfigured = error instanceof Error && error.message === "SMTP is not configured";
    return NextResponse.json({
      code: unconfigured ? "EMAIL_NOT_CONFIGURED" : "EMAIL_SEND_FAILED",
      message: unconfigured ? "邮件服务尚未配置，请联系管理员" : "验证码发送失败，请稍后再试",
    }, { status: 503 });
  }
}
