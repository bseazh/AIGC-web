"use client";

import { Activity, Boxes, CircleDollarSign, ClipboardCheck, Coins, FileKey2, Gauge, MessageSquareText, ScrollText, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingScreen } from "@/app/components/app-shell";

type Overview = { users: unknown[]; tasks: Array<{ status: string }>; assets: unknown[]; ledger: unknown[] };

const modules = [
  { href: "/admin/wallets", icon: Coins, title: "用户与积分", description: "用户查询、测试积分发放、人工充值与积分流水" },
  { href: "/admin/codes", icon: FileKey2, title: "充值码 / 兑换码", description: "创建、停用和查看临时积分兑换码" },
  { href: "/admin/payments", icon: CircleDollarSign, title: "微信支付", description: "支付订单、退款与账单对账" },
  { href: "/admin/support", icon: MessageSquareText, title: "审核与客服", description: "内容审核、违规处置和用户投诉" },
  { href: "/admin/review-metrics", icon: Gauge, title: "审核指标", description: "审核时效、积压量与质量指标" },
  { href: "/admin/prompts", icon: Sparkles, title: "提示词运营", description: "工作流提示词版本、灰度与回滚" },
  { href: "/admin/operations", icon: Wrench, title: "存储与运维", description: "COS 配额、清理、备份和任务重试" },
] as const;

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
  return <main className="admin-shell admin-dashboard">
    <header><div><span><ShieldCheck size={17} />管理员后台</span><h1>管理控制台</h1><p>运营、积分、支付、内容安全和系统运维的统一入口。</p></div><Link className="admin-back-link" href="/workspace">进入创作工作台</Link></header>
    <section className="admin-summary-grid">
      <article><Users size={20} /><span>用户总览</span><strong>{overview.users.length}</strong><small>最近 50 位用户</small></article>
      <article><Activity size={20} /><span>进行中任务</span><strong>{activeTasks}</strong><small>排队、生成或审核中</small></article>
      <article><Boxes size={20} /><span>内容资产</span><strong>{overview.assets.length}</strong><small>最近 50 条资产</small></article>
      <article><ScrollText size={20} /><span>积分流水</span><strong>{overview.ledger.length}</strong><small>最近 50 条变动</small></article>
    </section>
    <section className="admin-module-grid">{modules.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href}><span><Icon size={21} /></span><div><strong>{item.title}</strong><p>{item.description}</p></div><ClipboardCheck size={17} /></Link>; })}</section>
  </main>;
}
