"use client";

import Link from "next/link";
import { ArrowLeft, DatabaseBackup, HardDrive, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { isAdministrator?: boolean } };
type Overview = {
  storage: Array<{ id: string; display_name: string; identifier: string; quota_bytes: string; used_bytes: string }>;
  operations: Array<{ id: string; operation: string; status: string; summary: string; created_at: string }>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024; let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export default function OperationsAdminPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [quotaEdits, setQuotaEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/overview/", { cache: "no-store" });
    if (!response.ok) throw new Error("forbidden");
    setOverview(await response.json());
  };
  useEffect(() => {
    Promise.all([fetch("/api/auth/session/", { cache: "no-store" }), fetch("/api/admin/overview/", { cache: "no-store" })])
      .then(async ([sessionResponse, overviewResponse]) => {
        if (!sessionResponse.ok || !overviewResponse.ok) throw new Error("forbidden");
        const session = await sessionResponse.json(); if (!session.user.isAdministrator) throw new Error("forbidden");
        setAccount(session); setOverview(await overviewResponse.json());
      }).catch(() => router.replace("/workspace"));
  }, [router]);

  const saveQuota = async (item: Overview["storage"][number]) => {
    const gib = Number(quotaEdits[item.id] ?? Math.round(Number(item.quota_bytes) / (1024 ** 3)));
    if (!Number.isInteger(gib) || gib < 0 || gib > 1024) return setMessage("配额必须是 0 到 1024 GiB 之间的整数。");
    setSavingId(item.id); setMessage("");
    const response = await fetch("/api/admin/storage/adjust/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: item.id, quotaBytes: gib * 1024 ** 3 }) });
    const body = await response.json(); setSavingId(null);
    if (!response.ok) return setMessage(body.message || "保存失败，请重试。");
    setOverview((current) => current ? { ...current, storage: current.storage.map((entry) => entry.id === item.id ? { ...entry, quota_bytes: String(body.quotaBytes) } : entry) } : current);
    setMessage(`${item.display_name} 的配额已更新为 ${gib} GiB。`);
  };
  const retryOperation = async (item: Overview["operations"][number]) => {
    setRetryingId(item.id); setMessage("");
    const response = await fetch(`/api/admin/operations/${item.id}/retry/`, { method: "POST" });
    const body = await response.json(); setRetryingId(null);
    if (!response.ok) return setMessage(body.message || "运维任务重试失败");
    setMessage(`${item.operation} 已重试完成。`); await load();
  };

  if (!account || !overview) return <LoadingScreen />;
  return <main className="admin-shell">
    <header><div><span><ShieldCheck size={17} />受限后台</span><h1>存储与运维</h1><p>查看用户配额、自动清理、数据库备份和恢复演练记录。</p></div><Link className="admin-back-link" href="/admin/wallets"><ArrowLeft size={16} />运营管理</Link></header>
    <section className="admin-query"><div className="provider-log-heading"><div><span><HardDrive size={17} />用户存储配额</span><p>按当前已占用空间排序；配额包含上传中、审核中和已就绪资产。</p></div></div>{message && <p className="admin-message support-message">{message}</p>}<div className="admin-table-wrap"><table><thead><tr><th>用户</th><th>账号</th><th>已使用</th><th>配额</th><th>使用率</th><th>调整</th></tr></thead><tbody>{overview.storage.length ? overview.storage.map((item) => { const used = Number(item.used_bytes); const quota = Number(item.quota_bytes); const quotaGiB = Math.round(quota / (1024 ** 3)); return <tr key={item.id}><td>{item.display_name}</td><td>{item.identifier}</td><td>{formatBytes(used)}</td><td>{formatBytes(quota)}</td><td>{quota ? `${(used / quota * 100).toFixed(1)}%` : "-"}</td><td><div className="admin-quota-control"><input type="number" min="0" max="1024" step="1" value={quotaEdits[item.id] ?? quotaGiB} onChange={(event) => setQuotaEdits((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`${item.display_name} 配额（GiB）`} /><span>GiB</span><button type="button" disabled={savingId === item.id} onClick={() => saveQuota(item)}><Save size={14} />保存</button></div></td></tr>; }) : <tr><td colSpan={6} className="prompt-empty">暂无用户存储记录。</td></tr>}</tbody></table></div></section>
    <section className="admin-query provider-log-panel"><div className="provider-log-heading"><div><span><DatabaseBackup size={17} />运维执行记录</span><p>失败的存储清理和生命周期维护任务可以在这里人工重试。</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>时间</th><th>操作</th><th>状态</th><th>摘要</th><th>操作</th></tr></thead><tbody>{overview.operations.length ? overview.operations.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString("zh-CN")}</td><td>{item.operation}</td><td><span className={`admin-status ${item.status.toLowerCase()}`}>{item.status}</span></td><td>{item.summary}</td><td>{item.status === "FAILED" && ["STORAGE_CLEANUP", "LIFECYCLE_MAINTENANCE"].includes(item.operation) ? <button className="table-action" disabled={retryingId === item.id} onClick={() => retryOperation(item)}><RotateCcw size={13} />重试</button> : "-"}</td></tr>) : <tr><td colSpan={5} className="prompt-empty">尚无记录。下一次定时任务完成后会显示。</td></tr>}</tbody></table></div></section>
  </main>;
}
