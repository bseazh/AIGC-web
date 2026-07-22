import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { createWechatNativeOrder, rechargePackages, wechatPayEnabled } from "@/lib/wechat-pay";

export async function GET() {
  return NextResponse.json({ enabled: wechatPayEnabled(), channel: "WECHAT_NATIVE", packages: rechargePackages.map((item) => ({ ...item, amountCny: item.amountFen / 100 })) });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!wechatPayEnabled()) return NextResponse.json({ code: "PAYMENT_NOT_AVAILABLE", message: "微信支付正在审核中，暂未开放" }, { status: 503 });
  const body = await request.json().catch(() => null) as { packageKey?: unknown } | null;
  const selected = rechargePackages.find((item) => item.key === body?.packageKey);
  if (!selected) return NextResponse.json({ code: "INVALID_PACKAGE", message: "充值套餐不存在" }, { status: 400 });
  const orderNo = `WP${Date.now()}${randomBytes(5).toString("hex")}`;
  const description = `芭乐AIGC ${selected.title}`;
  const created = await db.query<{ id: string }>(
    `INSERT INTO payment_orders (order_no, user_id, provider, status, amount_fen, points, package_key, description, expires_at)
     VALUES ($1, $2, 'WECHAT_NATIVE', 'CREATED', $3, $4, $5, $6, NOW() + INTERVAL '30 minutes') RETURNING id`,
    [orderNo, user.id, selected.amountFen, selected.points, selected.key, description],
  );
  try {
    const native = await createWechatNativeOrder({ orderNo, description, amountFen: selected.amountFen });
    await db.query("UPDATE payment_orders SET status = 'PENDING', provider_prepay_id = $2, updated_at = NOW() WHERE id = $1", [created.rows[0].id, native.prepayId]);
    return NextResponse.json({ orderId: created.rows[0].id, orderNo, expiresIn: 1800, codeUrl: native.codeUrl });
  } catch (error) {
    await db.query("UPDATE payment_orders SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [created.rows[0].id]);
    console.error("wechat native order creation failed", error);
    return NextResponse.json({ code: "PAYMENT_CREATE_FAILED", message: "支付订单创建失败，请稍后重试" }, { status: 502 });
  }
}
