import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const category = request.nextUrl.searchParams.get("category") || "all";
  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 100) || "";
  const like = `%${query}%`;
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 100, 1), 300);
  const [audit, provider, ledger, tasks] = await Promise.all([
    ["all", "audit"].includes(category) ? db.query(`SELECT e.id, 'audit' AS category, e.event_type AS event, e.resource_id AS "resourceId", e.user_id AS "userId", NULL::text AS "taskId", NULL::text AS "providerRequestId", e.details_json AS details, e.created_at AS "createdAt" FROM audit_events e WHERE $1 = '' OR e.event_type ILIKE $2 OR e.resource_id ILIKE $2 ORDER BY e.created_at DESC LIMIT $3`, [query, like, limit]) : { rows: [] },
    ["all", "provider"].includes(category) ? db.query(`SELECT l.id, 'provider' AS category, CONCAT(l.provider, ':', l.operation) AS event, NULL::text AS "resourceId", t.user_id::text AS "userId", l.task_id::text AS "taskId", l.provider_request_id AS "providerRequestId", jsonb_build_object('status',l.response_status,'errorCode',l.error_code) AS details, l.created_at AS "createdAt" FROM provider_call_logs l LEFT JOIN generation_tasks t ON t.id=l.task_id WHERE $1 = '' OR l.task_id::text ILIKE $2 OR l.provider_request_id ILIKE $2 OR l.error_code ILIKE $2 ORDER BY l.created_at DESC LIMIT $3`, [query, like, limit]) : { rows: [] },
    ["all", "wallet"].includes(category) ? db.query(`SELECT l.id, 'wallet' AS category, CONCAT(l.type, ':',l.business_type) AS event, l.business_id AS "resourceId", l.user_id::text AS "userId", CASE WHEN l.business_type='GENERATION_TASK' THEN l.business_id END AS "taskId", NULL::text AS "providerRequestId", jsonb_build_object('amount',l.amount,'balanceAfter',l.balance_after) AS details, l.created_at AS "createdAt" FROM wallet_ledger l WHERE $1 = '' OR l.business_id ILIKE $2 OR l.user_id::text ILIKE $2 OR l.business_type ILIKE $2 ORDER BY l.created_at DESC LIMIT $3`, [query, like, limit]) : { rows: [] },
    ["all", "task"].includes(category) ? db.query(`SELECT t.id, 'task' AS category, CONCAT('TASK_',t.status) AS event, t.id::text AS "resourceId", t.user_id::text AS "userId", t.id::text AS "taskId", NULL::text AS "providerRequestId", jsonb_build_object('workflowKey',t.workflow_key,'points',t.points,'errorCode',t.error_code,'requestId',t.request_id) AS details, t.updated_at AS "createdAt" FROM generation_tasks t WHERE $1 = '' OR t.id::text ILIKE $2 OR t.user_id::text ILIKE $2 OR t.request_id ILIKE $2 OR t.error_code ILIKE $2 ORDER BY t.updated_at DESC LIMIT $3`, [query, like, limit]) : { rows: [] },
  ]);
  const logs = [...audit.rows, ...provider.rows, ...ledger.rows, ...tasks.rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  return NextResponse.json({ logs });
}
