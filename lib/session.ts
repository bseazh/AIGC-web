import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";

export function requestIp(request: Request) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function createStoredSession(client: PoolClient, userId: string, tokenVersion: number, request: Request) {
  const sessionId = randomUUID();
  await client.query(
    "INSERT INTO login_sessions (id, user_id, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))",
    [sessionId, userId, requestIp(request), request.headers.get("user-agent"), SESSION_MAX_AGE],
  );
  return createSessionToken(userId, tokenVersion, sessionId);
}

export async function authenticatedUser(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const result = await db.query<{ id: string; token_version: number; email: string | null; phone: string | null; session_id: string }>(
    `SELECT u.id, u.token_version, u.email, u.phone, s.id AS session_id
     FROM users u JOIN login_sessions s ON s.user_id = u.id
     WHERE u.id = $1 AND u.status = 'ACTIVE' AND s.id = $2 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [session.userId, session.sessionId],
  );
  const user = result.rows[0];
  if (!user || user.token_version !== session.tokenVersion) return null;
  if (Math.random() < 0.05) db.query("UPDATE login_sessions SET last_seen_at = NOW() WHERE id = $1", [session.sessionId]).catch(() => undefined);
  return user;
}
