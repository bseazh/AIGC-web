import { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";

export async function authenticatedUser(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const result = await db.query<{ id: string; token_version: number; email: string | null; phone: string | null }>(
    "SELECT id, token_version, email, phone FROM users WHERE id = $1 AND status = 'ACTIVE'",
    [session.userId],
  );
  const user = result.rows[0];
  if (!user || user.token_version !== session.tokenVersion) return null;
  return user;
}
