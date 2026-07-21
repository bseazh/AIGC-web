"use client";

import { ArrowRight, Boxes, ChevronRight, Clock3, ImageIcon, Layers3, PackageOpen, ScanSearch, Shirt, Video, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

const tools = [
  { name: "商品主图", note: "生成电商首屏视觉", icon: ImageIcon, color: "blue", href: "/create/product-hero", available: true },
  { name: "模特穿搭", note: "服装自然上身展示", icon: Shirt, color: "violet", href: "/create/model-wear", available: true },
  { name: "场景延展", note: "匹配营销使用场景", icon: WandSparkles, color: "cyan", href: "/create/scene-image", available: true },
  { name: "高清优化", note: "修复细节并提升清晰度", icon: ScanSearch, color: "blue", href: "/create/hd-enhance", available: true },
  { name: "详情页套图", note: "生成四张统一卖点视觉", icon: Layers3, color: "orange", href: "/create/product-detail", available: true },
  { name: "视频创作中心", note: "广告大片、复刻与高级创作", icon: Video, color: "violet", href: "/create/product-video", available: true },
];

type Account = { user: { identifier: string; displayName: string }; wallet: { availablePoints: number; frozenPoints: number } };
type Task = { id: string; workflowName: string; status: string; statusLabel: string; points: number; thumbnailUrl: string | null; createdAt: string };
type Inspiration = { id: string; title: string; category: string; description: string; image: string; href: string };

export default function Workspace() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session/", { cache: "no-store" }),
      fetch("/api/tasks/list/?limit=5", { cache: "no-store" }),
      fetch("/api/home/", { cache: "no-store" }),
    ]).then(async ([sessionResponse, tasksResponse, homeResponse]) => {
      if (!sessionResponse.ok) throw new Error("unauthenticated");
      setAccount(await sessionResponse.json());
      if (tasksResponse.ok) { const body = await tasksResponse.json(); setTasks(body.tasks || []); setActiveCount(body.activeCount || 0); }
      if (homeResponse.ok) { const body = await homeResponse.json(); setInspirations(body.items || []); }
    }).catch(() => router.replace("/"));
  }, [router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="workspace" account={account} taskCount={activeCount}>
    <div className="workspace-content">
      <section className="welcome-row"><div><p>{account.user.identifier}</p><h1>今天想做什么？</h1></div><Link className="new-task" href="/create/product-hero"><ImageIcon size={18} />新建任务</Link></section>
      <section className="tool-grid" aria-label="创作工具">{tools.map((tool) => { const Icon = tool.icon; return tool.available ? (
        <Link className="tool-card" key={tool.name} href={tool.href!}><span className={`tool-icon ${tool.color}`}><Icon size={22} /></span><span><strong>{tool.name}</strong><small>{tool.note}</small></span><ChevronRight size={18} /></Link>
      ) : <div className="tool-card coming-soon" key={tool.name}><span className={`tool-icon ${tool.color}`}><Icon size={22} /></span><span><strong>{tool.name}<em>即将上线</em></strong><small>{tool.note}</small></span></div>; })}</section>
      <section className="workspace-band"><div className="section-title"><div><h2>最近任务</h2><p>跟踪生成进度与最新结果</p></div><Link href="/tasks">查看全部<ChevronRight size={16} /></Link></div>
        {tasks.length === 0 ? <div className="empty-tasks"><span><PackageOpen size={24} /></span><strong>暂无任务</strong><p>创建商品主图后，生成进度与结果会出现在这里。</p></div> : <div className="dashboard-task-list">{tasks.map((task) => <Link className="dashboard-task" href={`/tasks/${task.id}`} key={task.id}><div className="record-thumb">{task.thumbnailUrl ? <img src={task.thumbnailUrl} alt="" /> : <Clock3 size={20} />}</div><div><strong>{task.workflowName}</strong><span>{new Date(task.createdAt).toLocaleString("zh-CN")}</span></div><span className={`record-status status-${task.status.toLowerCase()}`}>{task.statusLabel}</span><span>{task.points} 积分</span><ChevronRight size={17} /></Link>)}</div>}
      </section>
      <section className="asset-shortcut"><div><span><Boxes size={20} /></span><div><strong>内容资产</strong><p>上传素材与生成结果都已集中保存。</p></div></div><Link href="/assets">打开资产库<ChevronRight size={16} /></Link></section>
      <section className="inspiration-band"><div className="section-title"><div><h2>灵感案例</h2><p>授权示例素材，用于展示可创作的商品视觉方向。</p></div><Link href="/tools">查看工具<ChevronRight size={16} /></Link></div><div className="inspiration-grid">{inspirations.slice(0, 3).map((item) => <article className="inspiration-card" key={item.id}><img src={item.image} alt="" /><span>{item.category}</span><div><strong>{item.title}</strong><p>{item.description}</p><Link href={item.href}>做同款<ArrowRight size={15} /></Link></div></article>)}</div></section>
    </div>
  </AppShell>;
}
