import { NextResponse } from "next/server";
import { createSessionToken, hashPassword, normalizeIdentifier, SESSION_COOKIE, sessionCookieOptions, validPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeVerificationCode } from "@/lib/email-verification";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = normalizeIdentifier(body?.identifier);
  if (!identifier || identifier.type !== "email") {
    return NextResponse.json({ code: "INVALID_IDENTIFIER", message: "注册请使用有效的邮箱地址" }, { status: 400 });
  }
  if (!validPassword(body?.password)) {
    return NextResponse.json({ code: "INVALID_PASSWORD", message: "密码长度需为 8-72 位" }, { status: 400 });
  }
  if (!(await consumeVerificationCode(identifier.value, body?.code))) {
    return NextResponse.json({ code: "INVALID_CODE", message: "验证码不正确或已过期" }, { status: 400 });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await hashPassword(body.password);
    const welcomePoints = Number(process.env.WELCOME_POINTS || 100);
    const email = identifier.value;
    const phone = null;
    const result = await client.query<{ id: string; token_version: number }>(
      `INSERT INTO users (email, phone, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, token_version`,
      [email, phone, passwordHash],
    );
    const user = result.rows[0];
    await client.query(
      "INSERT INTO wallets (user_id, available_points) VALUES ($1, $2)",
      [user.id, welcomePoints],
    );
    await client.query(
      `INSERT INTO wallet_ledger
       (user_id, type, amount, balance_after, business_type, idempotency_key)
       VALUES ($1, 'CREDIT', $2, $2, 'WELCOME_BONUS', $3)`,
      [user.id, welcomePoints, `welcome:${user.id}`],
    );
    await client.query("COMMIT");

    const response = NextResponse.json({ userId: user.id, welcomePoints }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, user.token_version), sessionCookieOptions());
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ code: "ACCOUNT_EXISTS", message: "该手机号或邮箱已注册" }, { status: 409 });
    }
    console.error("registration failed", error);
    return NextResponse.json({ code: "REGISTER_FAILED", message: "注册暂时失败，请稍后再试" }, { status: 500 });
  } finally {
    client.release();
  }
}
