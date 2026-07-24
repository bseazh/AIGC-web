import { NextResponse } from "next/server";
import { normalizeIdentifier, SESSION_COOKIE, sessionCookieOptions, validPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { clearIdentifierFailures, loginRateLimit, recordLoginFailure } from "@/lib/login-security";
import { createStoredSession, requestIp } from "@/lib/session";
import { isAdministrator } from "@/lib/admin";
import { requestContext, structuredLog } from "@/lib/logger";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = normalizeIdentifier(body?.identifier);
  const identifierKey = typeof body?.identifier === "string" ? body.identifier.trim().toLowerCase().slice(0, 255) : "invalid";
  const rateIdentifier = identifier?.value || identifierKey;
  const ip = requestIp(request);
  const limit = await loginRateLimit(rateIdentifier, ip);
  if (limit.limited) return NextResponse.json({ code: "LOGIN_RATE_LIMITED", message: "登录失败次数过多，请稍后再试", retryAfter: limit.retryAfter }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  if (!identifier || !validPassword(body?.password)) {
    await recordLoginFailure(rateIdentifier, ip);
    structuredLog("warn", "login_failed", { ...requestContext(request), reason: "invalid_input", ip });
    return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "手机号/邮箱或密码不正确" }, { status: 401 });
  }

  const field = identifier.type === "email" ? "LOWER(email)" : "phone";
  const result = await db.query<{
    id: string;
    email: string | null;
    phone: string | null;
    password_hash: string;
    token_version: number;
    status: string;
  }>(
    `SELECT id, email, phone, password_hash, token_version, status FROM users WHERE ${field} = $1 LIMIT 1`,
    [identifier.value],
  );
  const user = result.rows[0];
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(body.password, user.password_hash))) {
    await recordLoginFailure(identifier.value, ip);
    await audit(user?.id || null, "LOGIN_FAILED", request, user ? { type: "user", id: user.id } : undefined, { identifierType: identifier.type });
    structuredLog("warn", "login_failed", { ...requestContext(request), userId: user?.id, reason: "invalid_credentials", ip });
    return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "手机号/邮箱或密码不正确" }, { status: 401 });
  }

  await clearIdentifierFailures(identifier.value);
  const client = await db.connect();
  let token: string;
  try {
    await client.query("BEGIN");
    token = await createStoredSession(client, user.id, user.token_version, request);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await audit(user.id, "LOGIN_SUCCEEDED", request, { type: "user", id: user.id });
  const administrator = isAdministrator(user.email || user.phone);
  const response = NextResponse.json({ userId: user.id, isAdministrator: administrator, redirectTo: administrator ? "/admin" : "/workspace" });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
