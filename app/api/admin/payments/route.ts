import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "";
  const result = await db.query(
    `SELECT o.id, o.order_no AS "orderNo", o.status, o.amount_fen AS "amountFen", o.points, o.provider_transaction_id AS "transactionId", o.created_at AS "createdAt", o.paid_at AS "paidAt", u.display_name AS "userName", COALESCE(u.email, u.phone, '-') AS identifier
     FROM payment_orders o JOIN users u ON u.id = o.user_id
     WHERE $1 = '' OR o.status = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [status],
  );
  return NextResponse.json({ orders: result.rows });
}
