"use client";

import { Activity, AlertTriangle, ArrowLeft, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/app/components/app-shell";

type Metrics = {
  generatedAt: string;
  summary: Record<string, number>;
  phases: Array<{ phase: string; total: number; pending: number; approved: number; rejected: number }>;
  violations: Array<{ category: string; count: number }>;
  sla: Record<string, number>;
};

function duration(seconds = 0) {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
  return `${(seconds / 3600).toFixed(1)} 小时`;
}

export default function ReviewMetricsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    const response = await fetch("/api/admin/review-metrics/", { cache: "no-store" });
    if (response.status === 403) return router.replace("/workspace");
    if (!response.ok) return setError("审核指标加载失败");
    setMetrics(await response.json());
  };
  useEffect(() => { load(); const timer = setInterval(load, 60_000); return () => clearInterval(timer); }, []);
  if (!metrics) return error ? <main className="workspace-loading"><p>{error}</p></main> : <LoadingScreen />;
  const s = metrics.summary;
  const cards = [
    ["待处理", s.pending, "当前积压"], ["人工复核", s.needs_manual, "需人工判断"],
    ["平均时效", duration(s.avg_seconds_24h), "最近 24 小时"], ["P95 时效", duration(s.p95_seconds_24h), "最近 24 小时"],
    ["自动通过", s.auto_approved_24h, "最近 24 小时"], ["自动拒绝", s.auto_rejected_24h, "最近 24 小时"],
    ["自动升级", s.escalated_24h, "最近 24 小时"], ["供应商异常", s.provider_errors_24h, "最近 24 小时"],
  ];
  return <main className="admin-shell review-metrics"><header><div><span><Activity size={17} />实时运营</span><h1>审核指标与处理时效</h1><p>监控自动审核命中、人工复核压力、供应商异常和审核 SLA。</p></div><div className="admin-header-actions"><button onClick={load}><RefreshCw size={15} />刷新</button><Link className="admin-back-link" href="/admin/support"><ArrowLeft size={15} />审核后台</Link></div></header>
    <section className="metric-grid">{cards.map(([label, value, hint]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</section>
    <section className="metric-panels"><article><h2><Clock3 size={18} />24 小时 SLA 分布</h2><div className="sla-list"><p><span>5 分钟内</span><strong>{metrics.sla.under_5m}</strong></p><p><span>5–30 分钟</span><strong>{metrics.sla.from_5m_to_30m}</strong></p><p><span>30 分钟–2 小时</span><strong>{metrics.sla.from_30m_to_2h}</strong></p><p><span>超过 2 小时</span><strong>{metrics.sla.over_2h}</strong></p></div><p className="metric-note">最老待审核：{duration(s.oldest_pending_seconds)}</p></article>
      <article><h2><ShieldCheck size={18} />来源分布</h2>{metrics.phases.map((phase) => <div className="phase-row" key={phase.phase}><strong>{phase.phase === "UPLOAD" ? "上传素材" : "生成结果"}</strong><span>总量 {phase.total}</span><span>待审 {phase.pending}</span><span>通过 {phase.approved}</span><span>拒绝 {phase.rejected}</span></div>)}</article>
      <article><h2><AlertTriangle size={18} />近 30 天违规类型</h2>{metrics.violations.length ? metrics.violations.map((item) => <div className="violation-row" key={item.category}><span>{item.category}</span><strong>{item.count}</strong></div>) : <p className="metric-note">暂无已确认违规。</p>}</article></section>
    <footer>数据更新时间：{new Date(metrics.generatedAt).toLocaleString("zh-CN")}</footer>
  </main>;
}
