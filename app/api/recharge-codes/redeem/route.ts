import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { digestRechargeCode, normalizeRechargeCode } from "@/lib/recharge-codes";
import { authenticatedUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const normalized = normalizeRechargeCode(body?.code);
  if (!normalized) return NextResponse.json({ message: "请输入有效的充值码" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const codeResult = await client.query<{ id: string; points: number; max_redemptions: number; redeemed_count: number; status: string; expires_at: string | null }>(
      "SELECT id, points, max_redemptions, redeemed_count, status, expires_at FROM recharge_codes WHERE code_digest = $1 FOR UPDATE",
      [digestRechargeCode(normalized)],
    );
    const code = codeResult.rows[0];
    if (!code || code.status !== "ACTIVE" || (code.expires_at && new Date(code.expires_at) <= new Date())) {
      await client.query("ROLLBACK");
      return NextResponse.json({ message: "充值码无效、已过期或已用完" }, { status: 400 });
    }
    const prior = await client.query("SELECT 1 FROM recharge_code_redemptions WHERE code_id = $1 AND user_id = $2", [code.id, user.id]);
    if (prior.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ message: "当前账号已兑换过该充值码" }, { status: 409 }); }
    if (code.redeemed_count >= code.max_redemptions) { await client.query("ROLLBACK"); return NextResponse.json({ message: "充值码已用完" }, { status: 400 }); }
    const walletResult = await client.query<{ available_points: number }>("SELECT available_points FROM wallets WHERE user_id = $1 FOR UPDATE", [user.id]);
    const wallet = walletResult.rows[0];
    if (!wallet) { await client.query("ROLLBACK"); return NextResponse.json({ message: "钱包不可用" }, { status: 404 }); }
    const balanceAfter = wallet.available_points + code.points;
    await client.query("UPDATE wallets SET available_points = $2, version = version + 1, updated_at = NOW() WHERE user_id = $1", [user.id, balanceAfter]);
    await client.query("UPDATE recharge_codes SET redeemed_count = redeemed_count + 1, updated_at = NOW() WHERE id = $1", [code.id]);
    await client.query("INSERT INTO recharge_code_redemptions (code_id, user_id, points, balance_after) VALUES ($1, $2, $3, $4)", [code.id, user.id, code.points, balanceAfter]);
    await client.query(`INSERT INTO wallet_ledger (user_id, type, amount, balance_after, business_type, business_id, idempotency_key)
      VALUES ($1, 'CREDIT', $2, $3, 'RECHARGE_CODE', $4, $5)`, [user.id, code.points, balanceAfter, code.id, `recharge-code:${code.id}:${user.id}`]);
    await client.query("COMMIT");
    await audit(user.id, "RECHARGE_CODE_REDEEMED", request, { type: "recharge_code", id: code.id }, { points: code.points, balanceAfter });
    return NextResponse.json({ points: code.points, balanceAfter, message: `兑换成功，${code.points} 积分已到账` });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
