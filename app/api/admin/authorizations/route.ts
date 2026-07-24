import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 100) || "";
  const result = await db.query(
    `SELECT a.id, a.task_id AS "taskId", a.consent_version AS "consentVersion", a.consent_json AS consent,
            a.source_url AS "sourceUrl", a.ip_address AS "ipAddress", a.created_at AS "createdAt",
            u.display_name AS "userName", COALESCE(u.email, u.phone, '-') AS identifier
     FROM content_authorizations a JOIN users u ON u.id = a.user_id
     WHERE $1 = '' OR a.task_id::text = $1 OR u.email ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%'
     ORDER BY a.created_at DESC LIMIT 100`,
    [query],
  );
  return NextResponse.json({ authorizations: result.rows });
}
