import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const taskId = request.nextUrl.searchParams.get("taskId")?.trim() || "";
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 100, 1), 200);
  const result = await db.query(
    `SELECT l.id, l.task_id AS "taskId", l.provider, l.operation, l.request_json AS request, l.response_status AS "responseStatus", l.response_json AS response, l.error_code AS "errorCode", l.created_at AS "createdAt", t.workflow_key AS "workflowKey", u.display_name AS "userName"
     FROM provider_call_logs l
     LEFT JOIN generation_tasks t ON t.id = l.task_id
     LEFT JOIN users u ON u.id = t.user_id
     WHERE $1 = '' OR l.task_id::text = $1
     ORDER BY l.created_at DESC LIMIT $2`,
    [taskId, limit],
  );
  return NextResponse.json({ logs: result.rows });
}
