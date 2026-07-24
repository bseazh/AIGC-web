import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { settleWechatRefund } from "@/lib/payment-refunds";
import { createWechatRefund } from "@/lib/wechat-pay";

function providerStatus(value: string | undefined) {
  return value === "SUCCESS" ? "SUCCESS" : value === "CLOSED" ? "CLOSED" : value === "ABNORMAL" ? "ABNORMAL" : "PROCESSING";
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 80) : "";
  if (reason.length < 2) return NextResponse.json({ code: "REFUND_REASON_REQUIRED", message: "请填写退款原因" }, { status: 400 });
  const client = await db.connect();
  let refundNo = "";
  let orderNo = "";
  let amountFen = 0;
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string; order_no: string; user_id: string; status: string; amount_fen: number; points: number; available_points: number }>(
      `SELECT o.id, o.order_no, o.user_id, o.status, o.amount_fen, o.points, w.available_points
       FROM payment_orders o JOIN wallets w ON w.user_id = o.user_id WHERE o.id = $1 FOR UPDATE OF o, w`,
      [id],
    );
    const order = found.rows[0];
    if (!order) { await client.query("ROLLBACK"); return NextResponse.json({ code: "ORDER_NOT_FOUND" }, { status: 404 }); }
    if (order.status !== "PAID") { await client.query("ROLLBACK"); return NextResponse.json({ code: "ORDER_NOT_REFUNDABLE", message: "仅已支付且未退款订单可退款" }, { status: 409 }); }
    const existing = await client.query("SELECT id FROM payment_refunds WHERE order_id = $1 AND status IN ('REQUESTING', 'PROCESSING', 'SUCCESS')", [order.id]);
    if (existing.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ code: "REFUND_ALREADY_EXISTS", message: "订单已有退款申请" }, { status: 409 }); }
    if (order.available_points < order.points) { await client.query("ROLLBACK"); return NextResponse.json({ code: "REFUND_POINTS_SPENT", message: "本次充值积分已被消费，无法原路退款" }, { status: 409 }); }
    refundNo = `BR${Date.now()}${randomBytes(4).toString("hex").toUpperCase()}`;
    orderNo = order.order_no; amountFen = order.amount_fen;
    await client.query("UPDATE wallets SET available_points = available_points - $2, frozen_points = frozen_points + $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [order.user_id, order.points]);
    await client.query(
      `INSERT INTO payment_refunds (refund_no, order_id, status, amount_fen, points, reason, requested_by)
       VALUES ($1, $2, 'REQUESTING', $3, $4, $5, $6)`,
      [refundNo, order.id, order.amount_fen, order.points, reason, administrator.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK"); client.release();
    console.error("refund reservation failed", error);
    return NextResponse.json({ code: "REFUND_RESERVATION_FAILED", message: "退款积分冻结失败" }, { status: 500 });
  }
  client.release();
  try {
    const refund = await createWechatRefund({ refundNo, orderNo, amountFen, reason });
    const status = providerStatus(refund.status);
    await settleWechatRefund(refundNo, { status, refundId: refund.refund_id || null, successTime: refund.success_time || null });
    await audit(administrator.id, "ADMIN_WECHAT_REFUND_REQUESTED", request, { type: "payment_order", id }, { refundNo, reason, status });
    return NextResponse.json({ refundNo, status, providerRefundId: refund.refund_id || null });
  } catch (error) {
    const restore = await db.connect();
    try {
      await restore.query("BEGIN");
      const refund = await restore.query<{ id: string; user_id: string; points: number; status: string }>(
        "SELECT r.id, o.user_id, r.points, r.status FROM payment_refunds r JOIN payment_orders o ON o.id = r.order_id WHERE r.refund_no = $1 FOR UPDATE OF r",
        [refundNo],
      );
      if (refund.rows[0]?.status === "REQUESTING") {
        await restore.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [refund.rows[0].user_id, refund.rows[0].points]);
        await restore.query("UPDATE payment_refunds SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1", [refund.rows[0].id, error instanceof Error ? error.message.slice(0, 500) : "WECHAT_REFUND_FAILED"]);
      }
      await restore.query("COMMIT");
    } catch (restoreError) { await restore.query("ROLLBACK"); console.error("refund reservation restoration failed", restoreError); }
    finally { restore.release(); }
    console.error("wechat refund request failed", error);
    return NextResponse.json({ code: "WECHAT_REFUND_FAILED", message: "微信退款申请失败，已恢复冻结积分" }, { status: 502 });
  }
}
