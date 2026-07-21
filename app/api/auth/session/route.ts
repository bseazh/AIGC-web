import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const result = await db.query<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    token_version: number;
    available_points: number;
    frozen_points: number;
  }>(
    `SELECT u.id, u.email, u.phone, u.display_name, u.token_version,
            w.available_points, w.frozen_points
     FROM users u JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1 AND u.status = 'ACTIVE'`,
    [session.userId],
  );
  const user = result.rows[0];
  if (!user || user.token_version !== session.tokenVersion) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      identifier: user.email || user.phone,
      displayName: user.display_name,
      isAdministrator: isAdministrator(user.email || user.phone),
    },
    wallet: {
      availablePoints: user.available_points,
      frozenPoints: user.frozen_points,
    },
  });
}
