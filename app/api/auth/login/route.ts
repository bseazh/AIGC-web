import { NextResponse } from "next/server";
import { createSessionToken, normalizeIdentifier, SESSION_COOKIE, sessionCookieOptions, validPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = normalizeIdentifier(body?.identifier);
  if (!identifier || !validPassword(body?.password)) {
    return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "手机号/邮箱或密码不正确" }, { status: 401 });
  }

  const field = identifier.type === "email" ? "LOWER(email)" : "phone";
  const result = await db.query<{
    id: string;
    password_hash: string;
    token_version: number;
    status: string;
  }>(
    `SELECT id, password_hash, token_version, status FROM users WHERE ${field} = $1 LIMIT 1`,
    [identifier.value],
  );
  const user = result.rows[0];
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(body.password, user.password_hash))) {
    return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "手机号/邮箱或密码不正确" }, { status: 401 });
  }

  const response = NextResponse.json({ userId: user.id });
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, user.token_version), sessionCookieOptions());
  return response;
}
