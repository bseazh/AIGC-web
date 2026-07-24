import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const [summary, phases, violations, sla] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('PENDING', 'NEEDS_MANUAL'))::int AS pending,
         COUNT(*) FILTER (WHERE status = 'NEEDS_MANUAL')::int AS needs_manual,
         COALESCE(EXTRACT(EPOCH FROM NOW() - MIN(created_at) FILTER (WHERE status IN ('PENDING', 'NEEDS_MANUAL'))), 0)::int AS oldest_pending_seconds,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS total_24h,
         COUNT(*) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '24 hours' AND review_source = 'SYSTEM' AND status = 'APPROVED')::int AS auto_approved_24h,
         COUNT(*) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '24 hours' AND review_source = 'SYSTEM' AND status = 'REJECTED')::int AS auto_rejected_24h,
         COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours' AND review_source = 'SYSTEM' AND status = 'NEEDS_MANUAL')::int AS escalated_24h,
         COUNT(*) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '24 hours' AND review_source = 'MANUAL' AND status = 'APPROVED')::int AS manual_approved_24h,
         COUNT(*) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '24 hours' AND review_source = 'MANUAL' AND status = 'REJECTED')::int AS manual_rejected_24h,
         COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours' AND metadata_json ? 'providerError')::int AS provider_errors_24h,
         COALESCE(AVG(EXTRACT(EPOCH FROM reviewed_at - created_at)) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '24 hours'), 0)::int AS avg_seconds_24h,
         COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM reviewed_at - created_at)) FILTER (WHERE reviewed_at >= NOW() - INTERVAL '24 hours'), 0)::int AS p95_seconds_24h
       FROM content_review_records`,
    ),
    db.query(
      `SELECT phase, COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('PENDING', 'NEEDS_MANUAL'))::int AS pending,
              COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
              COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected
       FROM content_review_records WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY phase ORDER BY phase`,
    ),
    db.query(
      `SELECT category, COUNT(*)::int AS count FROM content_violations
       WHERE created_at >= NOW() - INTERVAL '30 days' AND status = 'CONFIRMED'
       GROUP BY category ORDER BY count DESC LIMIT 12`,
    ),
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE reviewed_at - created_at < INTERVAL '5 minutes')::int AS under_5m,
         COUNT(*) FILTER (WHERE reviewed_at - created_at >= INTERVAL '5 minutes' AND reviewed_at - created_at < INTERVAL '30 minutes')::int AS from_5m_to_30m,
         COUNT(*) FILTER (WHERE reviewed_at - created_at >= INTERVAL '30 minutes' AND reviewed_at - created_at < INTERVAL '2 hours')::int AS from_30m_to_2h,
         COUNT(*) FILTER (WHERE reviewed_at - created_at >= INTERVAL '2 hours')::int AS over_2h
       FROM content_review_records WHERE reviewed_at >= NOW() - INTERVAL '24 hours'`,
    ),
  ]);
  return NextResponse.json({ generatedAt: new Date().toISOString(), summary: summary.rows[0], phases: phases.rows, violations: violations.rows, sla: sla.rows[0] });
}
