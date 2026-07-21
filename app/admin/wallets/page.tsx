"use client";

import { Boxes, ClipboardList, Coins, LoaderCircle, Search, Send, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string; isAdministrator?: boolean } };
type WalletUser = { id: string; identifier: string; displayName: string; availablePoints: number; frozenPoints: number };
type Overview = { users: Array<{ id: string; display_name: string; identifier: string; available_points: number; created_at: string }>; tasks: Array<{ id: string; display_name: string; workflowName: string; status: string; statusLabel: string; points: number; error_code: string | null; created_at: string }>; assets: Array<{ id: string; display_name: string; kind: string; original_name: string | null; mime_type: string; byte_size: string; created_at: string }>; ledger: Array<{ id: string; display_name: string; amount: number; balance_after: number; business_type: string; created_at: string }> };

export default function WalletAdminPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WalletUser | null>(null);
  const [kind, setKind] = useState<"MANUAL_RECHARGE" | "TEST_CREDIT">("MANUAL_RECHARGE");
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewTab, setOverviewTab] = useState<"users" | "tasks" | "assets" | "ledger">("users");

  const loadUsers = async (nextQuery = query) => {
    setLoading(true);
    const response = await fetch(`/api/admin/wallets/?query=${encodeURIComponent(nextQuery)}`, { cache: "no-store" });
    if (!response.ok) { router.replace("/workspace"); return; }
    const body = await response.json();
    setUsers(body.users || []);
    setLoading(false);
  };
  const loadOverview = async (nextQuery = query) => {
    const response = await fetch(`/api/admin/overview/?query=${encodeURIComponent(nextQuery)}`, { cache: "no-store" });
    if (response.ok) setOverview(await response.json());
  };

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const session = await response.json();
      if (!session.user.isAdministrator) throw new Error();
      setAccount(session);
      await loadUsers(""); return loadOverview("");
    }).catch(() => router.replace("/workspace"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return setMessage("请先选择要操作的用户");
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/admin/wallets/adjust/", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: selected.id, kind, ...(kind === "MANUAL_RECHARGE" ? { amountCny: Number(amount) } : { testPoints: Number(amount) }), note }),
    });
    const body = await response.json();
    setSubmitting(false);
    if (!response.ok) return setMessage(body.message || "操作失败，请重试");
    setMessage(`${body.message}，当前可用余额 ${body.balanceAfter} 积分。`);
    setSelected({ ...selected, availablePoints: body.balanceAfter });
    setUsers((items) => items.map((item) => item.id === selected.id ? { ...item, availablePoints: body.balanceAfter } : item));
  };

  if (!account) return <LoadingScreen />;
  const preview = kind === "MANUAL_RECHARGE" ? Number(amount || 0) * 10 : Number(amount || 0);
  const tabs = [{ key: "users", label: "用户", icon: Users }, { key: "tasks", label: "任务", icon: ClipboardList }, { key: "assets", label: "资产", icon: Boxes }, { key: "ledger", label: "积分流水", icon: Coins }] as const;
  const queryAll = () => { loadUsers(); loadOverview(); };
  return <main className="admin-shell"><header><div><span><ShieldCheck size={17} />受限后台</span><h1>运营管理</h1><p>查询用户、任务、资产和积分流水，并进行人工充值或测试积分发放。</p></div><button onClick={() => router.push("/workspace")}>返回工作台</button></header><section className="admin-grid"><div className="admin-users"><form onSubmit={(event) => { event.preventDefault(); queryAll(); }}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索邮箱、手机号、昵称或业务类型" /><button>搜索</button></form>{loading ? <div className="admin-empty"><LoaderCircle size={22} />正在加载用户</div> : users.length ? <div className="admin-user-list">{users.map((user) => <button type="button" className={selected?.id === user.id ? "selected" : ""} onClick={() => { setSelected(user); setMessage(""); }} key={user.id}><span>{user.displayName.slice(0, 1)}</span><div><strong>{user.displayName}</strong><small>{user.identifier}</small></div><em>{user.availablePoints.toLocaleString()} 积分</em></button>)}</div> : <div className="admin-empty">未找到匹配用户</div>}</div><form className="admin-adjustment" onSubmit={submit}><div className="admin-selected"><Coins size={20} /><div><span>操作对象</span><strong>{selected ? `${selected.displayName} · ${selected.identifier}` : "尚未选择用户"}</strong></div></div><label>积分类型<select value={kind} onChange={(event) => { const next = event.target.value as typeof kind; setKind(next); setAmount(next === "MANUAL_RECHARGE" ? "10" : "100"); }}><option value="MANUAL_RECHARGE">人工充值</option><option value="TEST_CREDIT">发放测试积分</option></select></label><label>{kind === "MANUAL_RECHARGE" ? "充值金额（元）" : "测试积分数量"}<input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><p className="admin-preview">本次将增加 <strong>{Number.isFinite(preview) ? preview.toLocaleString() : 0} 积分</strong>{kind === "MANUAL_RECHARGE" && "（10 积分 / 元）"}</p><label>备注（可选）<textarea value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="例如：线下收款单号、测试用途" /></label>{message && <p className="admin-message">{message}</p>}<button className="admin-submit" disabled={!selected || submitting}>{submitting ? <LoaderCircle size={18} /> : <Send size={18} />}{submitting ? "处理中" : kind === "MANUAL_RECHARGE" ? "确认人工充值" : "发放测试积分"}</button></form></section><section className="admin-query"><div className="admin-query-tabs">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.key} className={overviewTab === tab.key ? "active" : ""} onClick={() => setOverviewTab(tab.key)}><Icon size={16} />{tab.label}</button>; })}</div>{!overview ? <div className="admin-empty"><LoaderCircle size={22} />正在加载查询数据</div> : <div className="admin-table-wrap"><table><thead><tr>{overviewTab === "users" && <><th>用户</th><th>账号</th><th>可用积分</th><th>注册时间</th></>}{overviewTab === "tasks" && <><th>用户</th><th>任务</th><th>状态</th><th>积分</th><th>创建时间</th></>}{overviewTab === "assets" && <><th>用户</th><th>资产名称</th><th>分类</th><th>类型</th><th>创建时间</th></>}{overviewTab === "ledger" && <><th>用户</th><th>业务类型</th><th>变动</th><th>余额</th><th>创建时间</th></>}</tr></thead><tbody>{overviewTab === "users" && overview.users.map((x) => <tr key={x.id}><td>{x.display_name}</td><td>{x.identifier}</td><td>{x.available_points}</td><td>{new Date(x.created_at).toLocaleString("zh-CN")}</td></tr>)}{overviewTab === "tasks" && overview.tasks.map((x) => <tr key={x.id}><td>{x.display_name}</td><td>{x.workflowName}</td><td><span className={`admin-status ${x.status.toLowerCase()}`}>{x.statusLabel}</span></td><td>{x.points}</td><td>{new Date(x.created_at).toLocaleString("zh-CN")}</td></tr>)}{overviewTab === "assets" && overview.assets.map((x) => <tr key={x.id}><td>{x.display_name}</td><td>{x.original_name || "未命名素材"}</td><td>{x.kind === "INPUT" ? "上传素材" : "生成结果"}</td><td>{x.mime_type}</td><td>{new Date(x.created_at).toLocaleString("zh-CN")}</td></tr>)}{overviewTab === "ledger" && overview.ledger.map((x) => <tr key={x.id}><td>{x.display_name}</td><td>{x.business_type}</td><td className={x.amount >= 0 ? "admin-income" : "admin-expense"}>{x.amount >= 0 ? "+" : ""}{x.amount}</td><td>{x.balance_after}</td><td>{new Date(x.created_at).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div>}</section></main>;
}
