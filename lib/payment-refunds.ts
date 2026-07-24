import type { PoolClient } from "pg";
import { db } from "@/lib/db";

export type RefundProviderStatus = "PROCESSING" | "SUCCESS" | "CLOSED" | "ABNORMAL";

export async function settleWechatRefundWithClient(client: PoolClient, refundNo: string, provider: { status: RefundProviderStatus; refundId?: string | null; successTime?: string | null; failureReason?: string | null }) {
  const found = await client.query<{
    id: string; order_id: string; user_id: string; status: string; points: number; amount_fen: number;
  }>(
    `SELECT r.id, r.order_id, o.user_id, r.status, r.points, r.amount_fen
     FROM payment_refunds r JOIN payment_orders o ON o.id = r.order_id
     WHERE r.refund_no = $1 FOR UPDATE OF r, o`,
    [refundNo],
  );
  const refund = found.rows[0];
  if (!refund) return { found: false, changed: false };
  if (["SUCCESS", "CLOSED", "ABNORMAL", "FAILED"].includes(refund.status)) return { found: true, changed: false };
  if (provider.status === "PROCESSING") {
    await client.query("UPDATE payment_refunds SET status = 'PROCESSING', provider_refund_id = COALESCE($2, provider_refund_id), updated_at = NOW() WHERE id = $1", [refund.id, provider.refundId || null]);
    return { found: true, changed: true };
  }
  const wallet = await client.query<{ available_points: number; frozen_points: number }>("SELECT available_points, frozen_points FROM wallets WHERE user_id = $1 FOR UPDATE", [refund.user_id]);
  if (!wallet.rows[0] || wallet.rows[0].frozen_points < refund.points) throw new Error("Refund point reservation is missing");
  if (provider.status === "SUCCESS") {
    await client.query("UPDATE wallets SET frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [refund.user_id, refund.points]);
    await client.query("UPDATE payment_orders SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1", [refund.order_id]);
    await client.query("UPDATE payment_refunds SET status = 'SUCCESS', provider_refund_id = COALESCE($2, provider_refund_id), success_at = COALESCE($3::timestamptz, NOW()), failure_reason = NULL, updated_at = NOW() WHERE id = $1", [refund.id, provider.refundId || null, provider.successTime || null]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'PAYMENT_REFUND', $2, $3, 'WECHAT_REFUND', $4, $5) ON CONFLICT (idempotency_key) DO NOTHING`,
      [refund.user_id, -refund.points, wallet.rows[0].available_points, refund.id, `wechat-refund:${refund.id}`],
    );
  } else {
    await client.query("UPDATE wallets SET available_points = available_points + $2, frozen_points = frozen_points - $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [refund.user_id, refund.points]);
    await client.query("UPDATE payment_refunds SET status = $2, provider_refund_id = COALESCE($3, provider_refund_id), failure_reason = $4, updated_at = NOW() WHERE id = $1", [refund.id, provider.status, provider.refundId || null, provider.failureReason || provider.status]);
  }
  return { found: true, changed: true };
}

export async function settleWechatRefund(refundNo: string, provider: { status: RefundProviderStatus; refundId?: string | null; successTime?: string | null; failureReason?: string | null }) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await settleWechatRefundWithClient(client, refundNo, provider);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
