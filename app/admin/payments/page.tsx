"use client";

import { CircleDollarSign, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/app/components/app-shell";

type Order = { id: string; orderNo: string; status: string; amountFen: number; points: number; transactionId: string | null; createdAt: string; paidAt: string | null; userName: string; identifier: string; refundNo: string | null; refundStatus: string | null };
type Run = { id: string; billDate: string; status: string; localCount: number; providerCount: number; matchedCount: number; mismatchCount: number; completedAt: string | null };
type Item = { id: string; orderNo: string | null; transactionId: string | null; issueType: string; createdAt: string };

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const load = async () => {
    const responses = await Promise.all([fetch("/api/admin/payments/", { cache: "no-store" }), fetch("/api/admin/payments/reconciliation/", { cache: "no-store" })]);
    if (responses.some((response) => response.status === 403)) return router.replace("/workspace");
    if (responses.some((response) => !response.ok)) return setMessage("支付数据加载失败");
    const [payment, reconciliation] = await Promise.all(responses.map((response) => response.json()));
    setOrders(payment.orders || []); setRuns(reconciliation.runs || []); setItems(reconciliation.unresolvedItems || []); setReady(true);
  };
  useEffect(() => { load(); }, []);
  const refund = async (order: Order) => {
    const reason = window.prompt(`确认退款 ${(order.amountFen / 100).toFixed(2)} 元并收回 ${order.points} 积分，请填写原因`)?.trim();
    if (!reason) return;
    setBusy(order.id); setMessage("");
    const response = await fetch(`/api/admin/payments/${order.id}/refund/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setMessage(body.message || "退款失败");
    setMessage(`退款 ${body.refundNo} 已提交，状态 ${body.status}`); await load();
  };
  if (!ready) return <LoadingScreen />;
  return <main className="admin-shell"><header><div><span><CircleDollarSign size={17} />资金安全</span><h1>微信支付与对账</h1><p>查询支付订单、执行可控退款，并跟踪每日账单差异。</p></div><div className="admin-header-actions"><button onClick={load}><RefreshCw size={15} />刷新</button><Link className="admin-back-link" href="/workspace">返回工作台</Link></div></header>
    {message && <p className="admin-message">{message}</p>}
    <section className="admin-query"><h2>支付订单</h2><div className="admin-table-wrap"><table><thead><tr><th>订单</th><th>用户</th><th>金额 / 积分</th><th>状态</th><th>退款</th><th>时间</th><th>操作</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td>{order.orderNo}<small>{order.transactionId || "-"}</small></td><td>{order.userName}<small>{order.identifier}</small></td><td>¥{(order.amountFen / 100).toFixed(2)} / {order.points}</td><td>{order.status}</td><td>{order.refundNo ? `${order.refundNo} · ${order.refundStatus}` : "-"}</td><td>{new Date(order.createdAt).toLocaleString("zh-CN")}</td><td>{order.status === "PAID" && !order.refundNo ? <button className="table-action" disabled={busy === order.id} onClick={() => refund(order)}><RotateCcw size={13} />退款</button> : "-"}</td></tr>)}</tbody></table></div></section>
    <section className="admin-query"><h2>对账批次</h2><div className="admin-table-wrap"><table><thead><tr><th>账单日期</th><th>状态</th><th>本地</th><th>微信</th><th>匹配</th><th>差异</th><th>完成时间</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{run.billDate}</td><td>{run.status}</td><td>{run.localCount}</td><td>{run.providerCount}</td><td>{run.matchedCount}</td><td>{run.mismatchCount}</td><td>{run.completedAt ? new Date(run.completedAt).toLocaleString("zh-CN") : "-"}</td></tr>)}</tbody></table></div>
      <h2>未解决差异</h2><div className="admin-table-wrap"><table><thead><tr><th>订单</th><th>微信交易号</th><th>问题</th><th>发现时间</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.orderNo || "-"}</td><td>{item.transactionId || "-"}</td><td>{item.issueType}</td><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div></section>
  </main>;
}
