"use client";

export const dynamic = "force-dynamic";

import { Activity, Boxes, CircleDollarSign, ClipboardCheck, Coins, FileKey2, FileSearch, MessageSquareText, ScrollText, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/app/components/app-shell";

type TaskStat = {
  workflowKey: string;
  workflowName: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  avgSeconds: number;
  p50Seconds: number;
  p90Seconds: number;
  maxSeconds: number;
  activeCount: number;
  oldestActiveSeconds: number;
};
type Overview = { users: unknown[]; tasks: Array<{ status: string }>; assets: unknown[]; ledger: unknown[]; taskStats?: TaskStat[] };

const modules = [
  { href: "/admin/wallets", icon: Coins, title: "用户与积分", description: "用户查询、测试积分发放、人工充值与积分流水" },
  { href: "/admin/codes", icon: FileKey2, title: "充值码 / 兑换码", description: "创建、停用和查看临时积分兑换码" },
  { href: "/admin/payments", icon: CircleDollarSign, title: "微信支付", description: "支付订单、退款与账单对账" },
  { href: "/admin/support", icon: MessageSquareText, title: "客服与用户处置", description: "用户投诉、账号状态、失败任务和操作审计" },
  { href: "/admin/prompts", icon: Sparkles, title: "提示词运营", description: "工作流提示词版本、灰度与回滚" },
  { href: "/admin/operations", icon: Wrench, title: "存储与运维", description: "COS 配额、清理、备份和任务重试" },
  { href: "/admin/logs", icon: FileSearch, title: "统一日志", description: "审计、供应商、积分与任务关联查询" },
] as const;

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    Promise.all([fetch("/api/auth/session/", { cache: "no-store" }), fetch("/api/admin/overview/", { cache: "no-store" })])
      .then(async ([sessionResponse, overviewResponse]) => {
        if (!sessionResponse.ok || !overviewResponse.ok) throw new Error();
        const session = await sessionResponse.json();
        if (!session.user.isAdministrator) throw new Error();
        setOverview(await overviewResponse.json());
      }).catch(() => router.replace("/workspace"));
  }, [router]);
  if (!overview) return <LoadingScreen />;
  const activeTasks = overview.tasks.filter((task) => ["QUEUED", "RUNNING", "PENDING_INPUT_REVIEW", "PENDING_REVIEW"].includes(task.status)).length;
  const recreateStats = overview.taskStats?.find((item) => item.workflowKey === "recreate-video");
  return <main className="admin-shell admin-dashboard">
    <header><div><span><ShieldCheck size={17} />管理员后台</span><h1>管理控制台</h1><p>运营、积分、支付、用户服务和系统运维的统一入口。</p></div><Link className="admin-back-link" href="/workspace">进入创作工作台</Link></header>
    <section className="admin-summary-grid">
      <article><Users size={20} /><span>用户总览</span><strong>{overview.users.length}</strong><small>最近 50 位用户</small></article>
      <article><Activity size={20} /><span>进行中任务</span><strong>{activeTasks}</strong><small>等待处理、排队或生成中</small></article>
      <Link href="/assets"><Boxes size={20} /><span>内容资产</span><strong>{overview.assets.length}</strong><small>进入资产库查看与预览</small></Link>
      <article><ScrollText size={20} /><span>积分流水</span><strong>{overview.ledger.length}</strong><small>最近 50 条变动</small></article>
    </section>
    {overview.taskStats?.length ? <section className="admin-stats-panel">
      <header><div><span><Activity size={15} />最近 30 天</span><h2>视频任务耗时统计</h2></div><small>总耗时 = 创建任务到成功/失败；P90 表示 90% 任务不超过该时间。</small></header>
      <div className="admin-stats-grid">
        {overview.taskStats.map((item) => {
          const successRate = item.totalCount ? Math.round((item.successCount / item.totalCount) * 100) : 0;
          return <article key={item.workflowKey}>
            <strong>{item.workflowName}</strong>
            <span>{item.totalCount} 个样本 · 成功率 {successRate}%</span>
            <div><small>平均</small><b>{formatDuration(item.avgSeconds)}</b></div>
            <div><small>P50</small><b>{formatDuration(item.p50Seconds)}</b></div>
            <div><small>P90</small><b>{formatDuration(item.p90Seconds)}</b></div>
            <div><small>最长</small><b>{formatDuration(item.maxSeconds)}</b></div>
            {item.activeCount ? <em>进行中 {item.activeCount} 个，最长已等待 {formatDuration(item.oldestActiveSeconds)}</em> : null}
          </article>;
        })}
      </div>
    </section> : null}
    {recreateStats ? <p className="admin-stats-note">复刻带货视频通常参考 P50/P90：一半任务约 {formatDuration(recreateStats.p50Seconds)} 内返回，九成任务约 {formatDuration(recreateStats.p90Seconds)} 内返回。</p> : null}
    <section className="admin-module-grid">{modules.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href}><span><Icon size={21} /></span><div><strong>{item.title}</strong><p>{item.description}</p></div><ClipboardCheck size={17} /></Link>; })}</section>
  </main>;
}
