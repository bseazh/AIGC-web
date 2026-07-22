import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptWechatResource, verifyWechatNotification, wechatMerchantId } from "@/lib/wechat-pay";

const success = () => NextResponse.json({ code: "SUCCESS", message: "OK" });
const failure = (message: string, status = 400) => NextResponse.json({ code: "FAIL", message }, { status });

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWechatNotification(request.headers, raw)) return failure("invalid signature", 401);
  try {
    const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: { ciphertext?: string; nonce?: string; associated_data?: string } };
    if (!event.id || !event.event_type || !event.resource?.ciphertext || !event.resource.nonce) return failure("invalid payload");
    if (event.event_type !== "TRANSACTION.SUCCESS") return success();
    const paid = decryptWechatResource({ ciphertext: event.resource.ciphertext, nonce: event.resource.nonce, associated_data: event.resource.associated_data });
    if (!paid.out_trade_no || !paid.transaction_id || paid.mchid !== wechatMerchantId() || paid.amount?.currency !== "CNY" || !Number.isInteger(paid.amount.total)) return failure("invalid transaction");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO payment_notifications (provider, event_id, event_type, order_no, payload_json) VALUES ('WECHAT_NATIVE', $1, $2, $3, $4::jsonb) ON CONFLICT (event_id) DO NOTHING", [event.id, event.event_type, paid.out_trade_no, JSON.stringify(event)]);
      const orderResult = await client.query<{ id: string; user_id: string; status: string; amount_fen: number; points: number }>("SELECT id, user_id, status, amount_fen, points FROM payment_orders WHERE order_no = $1 FOR UPDATE", [paid.out_trade_no]);
      const order = orderResult.rows[0];
      if (!order) { await client.query("ROLLBACK"); return success(); }
      if (order.status === "PAID") { await client.query("COMMIT"); return success(); }
      if (!["CREATED", "PENDING"].includes(order.status) || order.amount_fen !== paid.amount.total) { await client.query("ROLLBACK"); return failure("order mismatch"); }
      const walletResult = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [order.user_id]);
      const balanceAfter = (walletResult.rows[0]?.available_points ?? 0) + order.points;
      await client.query("UPDATE wallets SET available_points = $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [order.user_id, balanceAfter]);
      await client.query("UPDATE payment_orders SET status = 'PAID', provider_transaction_id = $2, paid_at = NOW(), updated_at = NOW() WHERE id = $1", [order.id, paid.transaction_id]);
      await client.query(`INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key) VALUES ($1, 'CREDIT', $2, $3, 'WECHAT_RECHARGE', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`, [order.user_id, order.points, balanceAfter, order.id, `wechat:${order.id}`]);
      await client.query("COMMIT");
      return success();
    } catch (error) { await client.query("ROLLBACK"); console.error("wechat notification settlement failed", error); return failure("internal error", 500); }
    finally { client.release(); }
  } catch (error) { console.error("wechat notification processing failed", error); return failure("invalid payload"); }
}
