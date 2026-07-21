import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

const labels: Record<string, string> = {
  MANUAL_RECHARGE: "人工充值",
  TEST_CREDIT: "测试积分",
  GENERATION_TASK: "创作任务",
};

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const [wallet, ledger] = await Promise.all([
    db.query<{ available_points: number; frozen_points: number }>("SELECT available_points, frozen_points FROM wallets WHERE user_id = $1", [user.id]),
    db.query<{ id: string; type: string; amount: number; balance_after: number; business_type: string; business_id: string | null; created_at: string }>(
      "SELECT id, type, amount, balance_after, business_type, business_id, created_at FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [user.id]),
  ]);
  return NextResponse.json({
    wallet: { availablePoints: wallet.rows[0]?.available_points || 0, frozenPoints: wallet.rows[0]?.frozen_points || 0 },
    rules: [{ title: "积分抵扣", content: "创作任务按页面标注的积分价格扣除。" }, { title: "失败退回", content: "任务失败、取消或队列异常时，已冻结积分将自动退回。" }, { title: "充值规则", content: "人工充值按 1 元 = 10 积分换算，测试积分单独标记。" }],
    ledger: ledger.rows.map((row) => ({ ...row, label: labels[row.business_type] || row.business_type })),
  });
}
