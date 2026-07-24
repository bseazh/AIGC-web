import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const [runs, items] = await Promise.all([
    db.query(
      `SELECT id, bill_date AS "billDate", status, local_count AS "localCount", provider_count AS "providerCount",
              matched_count AS "matchedCount", mismatch_count AS "mismatchCount", report_path AS "reportPath",
              error_message AS "errorMessage", completed_at AS "completedAt", created_at AS "createdAt"
       FROM payment_reconciliation_runs ORDER BY bill_date DESC LIMIT 60`,
    ),
    db.query(
      `SELECT i.id, i.run_id AS "runId", i.order_no AS "orderNo", i.provider_transaction_id AS "transactionId",
              i.issue_type AS "issueType", i.local_json AS local, i.provider_json AS provider,
              i.resolved_at AS "resolvedAt", i.resolution_note AS "resolutionNote", i.created_at AS "createdAt"
       FROM payment_reconciliation_items i WHERE i.resolved_at IS NULL ORDER BY i.created_at DESC LIMIT 200`,
    ),
  ]);
  return NextResponse.json({ runs: runs.rows, unresolvedItems: items.rows });
}
