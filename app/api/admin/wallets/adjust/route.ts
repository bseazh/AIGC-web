import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

type AdjustmentBody = { userId?: unknown; kind?: unknown; amountCny?: unknown; testPoints?: unknown; note?: unknown };

export async function POST(request: NextRequest) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });

  let body: AdjustmentBody;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "请求格式错误" }, { status: 400 }); }
  if (typeof body.userId !== "string" || !body.userId) return NextResponse.json({ message: "请选择用户" }, { status: 400 });

  const kind = body.kind === "MANUAL_RECHARGE" ? "MANUAL_RECHARGE" : body.kind === "TEST_CREDIT" ? "TEST_CREDIT" : null;
  if (!kind) return NextResponse.json({ message: "不支持的积分类型" }, { status: 400 });
  const rawAmount = kind === "MANUAL_RECHARGE" ? body.amountCny : body.testPoints;
  const amount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
  const valid = kind === "MANUAL_RECHARGE" ? Number.isInteger(amount) && amount > 0 && amount <= 100000 : Number.isInteger(amount) && amount > 0 && amount <= 1000000;
  if (!valid) return NextResponse.json({ message: kind === "MANUAL_RECHARGE" ? "充值金额须为 1–100,000 元的整数" : "测试积分须为 1–1,000,000 的整数" }, { status: 400 });

  const points = kind === "MANUAL_RECHARGE" ? amount * 10 : amount;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const walletResult = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [body.userId]);
    const wallet = walletResult.rows[0];
    if (!wallet) { await client.query("ROLLBACK"); return NextResponse.json({ message: "用户不存在或钱包不可用" }, { status: 404 }); }
    const balanceAfter = wallet.available_points + points;
    await client.query("UPDATE wallets SET available_points = $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [body.userId, balanceAfter]);
    await client.query(
      `INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
       VALUES ($1, 'CREDIT', $2, $3, $4, $5, $6)`,
      [body.userId, points, balanceAfter, kind, note || null, `admin:${kind}:${randomUUID()}`],
    );
    await client.query("COMMIT");
    await audit(administrator.id, "ADMIN_WALLET_ADJUSTED", request, { type: "user", id: body.userId }, { kind, points, amount, note });
    return NextResponse.json({ points, balanceAfter, message: kind === "MANUAL_RECHARGE" ? `已按 ${amount} 元充值 ${points} 积分` : `已发放 ${points} 测试积分` });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
