import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";
import { taskStatusLabel, workflowName } from "@/lib/presenters";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 80) || "";
  const like = `%${query}%`;
  const [users, tasks, assets, ledger, storage, operations, taskStats] = await Promise.all([
    db.query<{ id: string; display_name: string; email: string | null; phone: string | null; status: string; available_points: number; created_at: string }>(`SELECT u.id, u.display_name, u.email, u.phone, u.status, w.available_points, u.created_at FROM users u JOIN wallets w ON w.user_id = u.id WHERE $1 = '' OR u.display_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2 ORDER BY u.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; workflow_key: string; status: string; points: number; error_code: string | null; created_at: string }>(`SELECT t.id, u.display_name, t.workflow_key, t.status, t.points, t.error_code, t.created_at FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE $1 = '' OR u.display_name ILIKE $2 OR t.workflow_key ILIKE $2 OR t.status ILIKE $2 ORDER BY t.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; kind: string; original_name: string | null; mime_type: string; byte_size: string; created_at: string }>(`SELECT a.id, u.display_name, a.kind, a.original_name, a.mime_type, a.byte_size, a.created_at FROM assets a JOIN users u ON u.id = a.owner_id WHERE $1 = '' OR u.display_name ILIKE $2 OR a.original_name ILIKE $2 OR a.kind ILIKE $2 ORDER BY a.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; type: string; amount: number; balance_after: number; business_type: string; created_at: string }>(`SELECT l.id, u.display_name, l.type, l.amount, l.balance_after, l.business_type, l.created_at FROM wallet_ledger l JOIN users u ON u.id = l.user_id WHERE $1 = '' OR u.display_name ILIKE $2 OR l.business_type ILIKE $2 ORDER BY l.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; identifier: string; quota_bytes: string; used_bytes: string }>(`SELECT u.id, u.display_name, COALESCE(u.email, u.phone, '-') AS identifier, COALESCE(q.quota_bytes, 1073741824)::text AS quota_bytes, COALESCE(SUM(a.byte_size) FILTER (WHERE a.audit_status IN ('UPLOADING', 'PENDING_REVIEW', 'READY')), 0)::text AS used_bytes FROM users u LEFT JOIN user_storage_quotas q ON q.user_id = u.id LEFT JOIN assets a ON a.owner_id = u.id WHERE $1 = '' OR u.display_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2 GROUP BY u.id, q.quota_bytes ORDER BY used_bytes::bigint DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; operation: string; status: string; summary: string; created_at: string }>("SELECT id, operation, status, summary, created_at FROM operations_runs ORDER BY created_at DESC LIMIT 100"),
    db.query<{
      workflow_key: string;
      total_count: string;
      success_count: string;
      failed_count: string;
      avg_seconds: string | null;
      p50_seconds: string | null;
      p90_seconds: string | null;
      max_seconds: string | null;
      active_count: string;
      oldest_active_seconds: string | null;
    }>(`
      WITH recent AS (
        SELECT workflow_key, status, created_at, updated_at,
               EXTRACT(EPOCH FROM updated_at - created_at) AS duration_seconds
          FROM generation_tasks
         WHERE workflow_key IN ('product-ad-video', 'recreate-video', 'video', 'video-mix')
           AND created_at >= NOW() - INTERVAL '30 days'
      ),
      completed AS (
        SELECT * FROM recent WHERE status IN ('SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELED')
      ),
      active AS (
        SELECT workflow_key,
               COUNT(*)::text AS active_count,
               COALESCE(MAX(EXTRACT(EPOCH FROM NOW() - created_at)), 0)::text AS oldest_active_seconds
          FROM recent
         WHERE status IN ('QUEUED', 'RUNNING', 'PENDING_INPUT_REVIEW', 'PENDING_REVIEW')
         GROUP BY workflow_key
      )
      SELECT c.workflow_key,
             COUNT(*)::text AS total_count,
             COUNT(*) FILTER (WHERE c.status = 'SUCCEEDED')::text AS success_count,
             COUNT(*) FILTER (WHERE c.status IN ('FAILED', 'REJECTED', 'CANCELED'))::text AS failed_count,
             AVG(c.duration_seconds)::text AS avg_seconds,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.duration_seconds)::text AS p50_seconds,
             PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY c.duration_seconds)::text AS p90_seconds,
             MAX(c.duration_seconds)::text AS max_seconds,
             COALESCE(a.active_count, '0') AS active_count,
             COALESCE(a.oldest_active_seconds, '0') AS oldest_active_seconds
        FROM completed c
        LEFT JOIN active a ON a.workflow_key = c.workflow_key
       GROUP BY c.workflow_key, a.active_count, a.oldest_active_seconds
       ORDER BY c.workflow_key
    `),
  ]);
  return NextResponse.json({
    users: users.rows.map((x) => ({ ...x, identifier: x.email || x.phone || "-" })),
    tasks: tasks.rows.map((x) => ({ ...x, workflowName: workflowName(x.workflow_key), statusLabel: taskStatusLabel(x.status) })),
    assets: assets.rows,
    ledger: ledger.rows,
    storage: storage.rows,
    operations: operations.rows,
    taskStats: taskStats.rows.map((row) => ({
      workflowKey: row.workflow_key,
      workflowName: workflowName(row.workflow_key),
      totalCount: Number(row.total_count || 0),
      successCount: Number(row.success_count || 0),
      failedCount: Number(row.failed_count || 0),
      avgSeconds: Math.round(Number(row.avg_seconds || 0)),
      p50Seconds: Math.round(Number(row.p50_seconds || 0)),
      p90Seconds: Math.round(Number(row.p90_seconds || 0)),
      maxSeconds: Math.round(Number(row.max_seconds || 0)),
      activeCount: Number(row.active_count || 0),
      oldestActiveSeconds: Math.round(Number(row.oldest_active_seconds || 0)),
    })),
  });
}
