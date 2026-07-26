import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskStatusLabel, workflowName } from "@/lib/presenters";
import { authenticatedUser } from "@/lib/session";

const creditLabels: Record<string, string> = {
  WELCOME_BONUS: "注册赠送",
  MANUAL_RECHARGE: "人工充值",
  TEST_CREDIT: "测试积分",
  WECHAT_RECHARGE: "微信支付充值",
  RECHARGE_CODE: "充值码兑换",
  WECHAT_REFUND: "微信支付退款",
};

type LedgerRow = {
  id: string; type: string; amount: number; balance_after: number; business_type: string; business_id: string | null; created_at: string;
  workflow_key: string | null; task_status: string | null; task_points: number | null;
};

function presentLedger(row: LedgerRow) {
  const taskName = row.workflow_key ? workflowName(row.workflow_key) : "创作任务";
  const taskPoints = row.task_points || Math.abs(row.amount);
  const common = {
    id: row.id,
    type: row.type,
    amount: row.amount,
    availableBalanceAfter: row.balance_after,
    businessType: row.business_type,
    businessId: row.business_id,
    createdAt: row.created_at,
    taskId: row.workflow_key ? row.business_id : null,
    taskStatus: row.task_status,
  };
  if (row.type === "FREEZE") return {
    ...common,
    label: `${taskName} · 积分冻结`,
    description: `任务创建时冻结 ${taskPoints} 积分；成功后从冻结积分结算，失败或取消会自动退回。`,
    changeText: `冻结 ${taskPoints}`,
    tone: "hold",
  };
  if (row.type === "SETTLE") return {
    ...common,
    label: `${taskName} · 成功扣款`,
    description: `任务已完成，从冻结积分中正式扣除 ${taskPoints} 积分，可用余额不会再次减少。`,
    changeText: `扣款 ${taskPoints}`,
    tone: "expense",
  };
  if (row.type === "REFUND") return {
    ...common,
    label: `${taskName} · 积分退回`,
    description: `任务${row.task_status ? taskStatusLabel(row.task_status) : "未完成"}，此前冻结的 ${Math.abs(row.amount)} 积分已退回可用余额。`,
    changeText: `退回 ${Math.abs(row.amount)}`,
    tone: "income",
  };
  if (row.type === "ADMIN_EXEMPT_TASK") return {
    ...common,
    label: `${taskName} · 管理员免积分`,
    description: `保留 ${taskPoints} 积分原始报价用于成本审计，未冻结或扣除积分。`,
    changeText: "免积分",
    tone: "neutral",
  };
  const label = creditLabels[row.business_type] || row.business_type;
  return {
    ...common,
    label,
    description: row.amount >= 0 ? `${Math.abs(row.amount)} 积分已进入可用余额。` : `${Math.abs(row.amount)} 积分已从可用余额扣除。`,
    changeText: `${row.amount >= 0 ? "+" : "-"}${Math.abs(row.amount)}`,
    tone: row.amount >= 0 ? "income" : "expense",
  };
}

const paymentStatusLabels: Record<string, string> = {
  CREATED: "待创建支付",
  PENDING: "等待支付",
  PAID: "支付成功",
  CLOSED: "已关闭",
  FAILED: "创建失败",
  REFUNDED: "已退款",
};

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const [wallet, ledger, payments] = await Promise.all([
    db.query<{ available_points: number; frozen_points: number }>("SELECT available_points, frozen_points FROM wallets WHERE user_id = $1", [user.id]),
    db.query<LedgerRow>(
      `SELECT l.id, l.type, l.amount, l.balance_after, l.business_type, l.business_id, l.created_at,
              t.workflow_key, t.status AS task_status, t.points AS task_points
         FROM wallet_ledger l
         LEFT JOIN generation_tasks t ON l.business_type IN ('GENERATION_TASK', 'ADMIN_EXEMPT_TASK') AND t.id::text = l.business_id
        WHERE l.user_id = $1 ORDER BY l.created_at DESC LIMIT 100`,
      [user.id],
    ),
    db.query<{ id: string; order_no: string; status: string; amount_fen: number; points: number; description: string; created_at: string; paid_at: string | null }>(
      "SELECT id, order_no, status, amount_fen, points, description, created_at, paid_at FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [user.id],
    ),
  ]);
  return NextResponse.json({
    wallet: { availablePoints: wallet.rows[0]?.available_points || 0, frozenPoints: wallet.rows[0]?.frozen_points || 0 },
    rules: [{ title: "积分抵扣", content: "创作任务按页面标注的积分价格扣除。" }, { title: "失败退回", content: "任务失败、取消或队列异常时，已冻结积分将自动退回。" }, { title: "充值规则", content: "人工充值按 1 元 = 10 积分换算，测试积分单独标记。" }],
    ledger: ledger.rows.map(presentLedger),
    payments: payments.rows.map((row) => ({
      id: row.id,
      orderNo: row.order_no,
      status: row.status,
      statusLabel: paymentStatusLabels[row.status] || row.status,
      amountCny: row.amount_fen / 100,
      points: row.points,
      description: row.description,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    })),
  });
}
