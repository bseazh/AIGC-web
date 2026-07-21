import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });

  const query = request.nextUrl.searchParams.get("query")?.trim() || "";
  const result = await db.query<{
    id: string; email: string | null; phone: string | null; display_name: string;
    available_points: number; frozen_points: number;
  }>(
    `SELECT u.id, u.email, u.phone, u.display_name, w.available_points, w.frozen_points
     FROM users u JOIN wallets w ON w.user_id = u.id
     WHERE u.status = 'ACTIVE'
       AND ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%')
     ORDER BY u.created_at DESC LIMIT 50`,
    [query],
  );
  return NextResponse.json({ users: result.rows.map((user) => ({
    id: user.id,
    identifier: user.email || user.phone || "-",
    displayName: user.display_name,
    availablePoints: user.available_points,
    frozenPoints: user.frozen_points,
  })) });
}
