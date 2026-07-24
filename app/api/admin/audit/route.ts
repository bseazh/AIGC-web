import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const eventType = request.nextUrl.searchParams.get("eventType")?.trim().slice(0, 100) || "";
  const result = await db.query(
    `SELECT e.id, e.event_type AS "eventType", e.resource_type AS "resourceType", e.resource_id AS "resourceId",
            e.ip_address AS "ipAddress", e.details_json AS details, e.created_at AS "createdAt",
            COALESCE(u.email, u.phone, 'system') AS actor
     FROM audit_events e LEFT JOIN users u ON u.id = e.user_id
     WHERE ($1 = '' AND e.event_type LIKE 'ADMIN_%') OR e.event_type = $1
     ORDER BY e.created_at DESC LIMIT 200`,
    [eventType],
  );
  return NextResponse.json({ events: result.rows });
}
