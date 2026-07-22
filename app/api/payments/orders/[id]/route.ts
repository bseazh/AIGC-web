import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  await db.query("UPDATE payment_orders SET status = 'CLOSED', updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status IN ('CREATED', 'PENDING') AND expires_at < NOW()", [id, user.id]);
  const result = await db.query<{ id: string; order_no: string; status: string; amount_fen: number; points: number; expires_at: string; paid_at: string | null }>("SELECT id, order_no, status, amount_fen, points, expires_at, paid_at FROM payment_orders WHERE id = $1 AND user_id = $2", [id, user.id]);
  const order = result.rows[0];
  if (!order) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ orderId: order.id, orderNo: order.order_no, status: order.status, amountCny: order.amount_fen / 100, points: order.points, expiresAt: order.expires_at, paidAt: order.paid_at });
}
