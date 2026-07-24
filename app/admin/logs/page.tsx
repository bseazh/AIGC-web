"use client";

import { ArrowLeft, FileSearch, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/app/components/app-shell";

type LogRow = { id: string; category: string; event: string; resourceId: string | null; userId: string | null; taskId: string | null; providerRequestId: string | null; details: Record<string, unknown>; createdAt: string };

export default function AdminLogsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]); const [category, setCategory] = useState("all"); const [query, setQuery] = useState("");
  const load = useCallback(async (nextCategory = "all", nextQuery = "") => { setLoading(true); const response = await fetch(`/api/admin/logs/?category=${encodeURIComponent(nextCategory)}&query=${encodeURIComponent(nextQuery)}`, { cache: "no-store" }); if (!response.ok) throw new Error(); setLogs((await response.json()).logs || []); setLoading(false); }, []);
  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); const session = await response.json(); if (!session.user.isAdministrator) throw new Error(); setReady(true); await load("all", ""); }).catch(() => router.replace("/workspace")); }, [load, router]);
  const search = (event: FormEvent) => { event.preventDefault(); load(); };
  if (!ready) return <LoadingScreen />;
  return <main className="admin-shell"><header><div><span><ShieldCheck size={17} />管理员后台</span><h1>统一日志查询</h1><p>关联查询审计、供应商、积分和任务事件；基础设施日志由 Grafana Loki 保存 30 天。</p></div><Link className="admin-back-link" href="/admin"><ArrowLeft size={16} />管理控制台</Link></header><section className="admin-query"><form className="log-query" onSubmit={search}><div className="log-segments">{[["all","全部"],["audit","审计"],["provider","供应商"],["wallet","积分"],["task","任务"]].map(([key,label]) => <button type="button" key={key} className={category === key ? "active" : ""} onClick={() => { setCategory(key); load(key, query); }}>{label}</button>)}</div><label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="requestId、taskId、userId、错误码" /></label><button type="submit"><FileSearch size={15} />查询</button></form>{loading ? <div className="admin-empty"><LoaderCircle size={20} />正在查询</div> : <div className="admin-table-wrap"><table><thead><tr><th>时间</th><th>类别</th><th>事件</th><th>任务 / 资源</th><th>用户</th><th>详情</th></tr></thead><tbody>{logs.length ? logs.map((item) => <tr key={`${item.category}-${item.id}`}><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td><td>{item.category}</td><td><strong>{item.event}</strong>{item.providerRequestId && <small>provider: {item.providerRequestId}</small>}</td><td><code>{item.taskId || item.resourceId || "-"}</code></td><td><code>{item.userId || "-"}</code></td><td><code title={JSON.stringify(item.details)}>{JSON.stringify(item.details)}</code></td></tr>) : <tr><td colSpan={6} className="prompt-empty">没有匹配日志。</td></tr>}</tbody></table></div>}</section></main>;
}
