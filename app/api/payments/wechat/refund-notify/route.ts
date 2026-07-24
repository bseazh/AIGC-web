import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settleWechatRefundWithClient, type RefundProviderStatus } from "@/lib/payment-refunds";
import { decryptWechatResource, verifyWechatNotification } from "@/lib/wechat-pay";

const success = () => NextResponse.json({ code: "SUCCESS", message: "OK" });
const failure = (message: string, status = 400) => NextResponse.json({ code: "FAIL", message }, { status });

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWechatNotification(request.headers, raw)) return failure("invalid signature", 401);
  try {
    const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: { ciphertext?: string; nonce?: string; associated_data?: string } };
    if (!event.id || !event.event_type || !event.resource?.ciphertext || !event.resource.nonce) return failure("invalid payload");
    const data = decryptWechatResource({ ciphertext: event.resource.ciphertext, nonce: event.resource.nonce, associated_data: event.resource.associated_data });
    if (!data.out_refund_no || !data.refund_status || !["SUCCESS", "CLOSED", "ABNORMAL", "PROCESSING"].includes(data.refund_status)) return failure("invalid refund");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO payment_notifications (provider, event_id, event_type, order_no, payload_json) VALUES ('WECHAT_NATIVE', $1, $2, $3, $4::jsonb) ON CONFLICT (event_id) DO NOTHING", [event.id, event.event_type, data.out_refund_no, JSON.stringify(event)]);
      await settleWechatRefundWithClient(client, data.out_refund_no, { status: data.refund_status as RefundProviderStatus, refundId: data.refund_id || null, successTime: data.success_time || null });
      await client.query("COMMIT");
      return success();
    } catch (error) { await client.query("ROLLBACK"); console.error("wechat refund notification settlement failed", error); return failure("internal error", 500); }
    finally { client.release(); }
  } catch (error) { console.error("wechat refund notification processing failed", error); return failure("invalid payload"); }
}
