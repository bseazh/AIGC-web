"use client";

import { Boxes, ChevronRight, Clock3, ImageIcon, Layers3, PackageOpen, Shirt, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

const tools = [
  { name: "商品主图", note: "生成电商首屏视觉", icon: ImageIcon, color: "blue", href: "/create/product-hero", available: true },
  { name: "模特穿搭", note: "服装自然上身展示", icon: Shirt, color: "violet", available: false },
  { name: "场景延展", note: "匹配营销使用场景", icon: WandSparkles, color: "cyan", available: false },
  { name: "详情页套图", note: "组织统一卖点表达", icon: Layers3, color: "orange", available: false },
];

type Account = { user: { identifier: string; displayName: string }; wallet: { availablePoints: number; frozenPoints: number } };
type Task = { id: string; workflowName: string; status: string; statusLabel: string; points: number; thumbnailUrl: string | null; createdAt: string };

export default function Workspace() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session/", { cache: "no-store" }),
      fetch("/api/tasks/list/?limit=5", { cache: "no-store" }),
    ]).then(async ([sessionResponse, tasksResponse]) => {
      if (!sessionResponse.ok) throw new Error("unauthenticated");
      setAccount(await sessionResponse.json());
      if (tasksResponse.ok) { const body = await tasksResponse.json(); setTasks(body.tasks || []); setActiveCount(body.activeCount || 0); }
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
    </div>
  </AppShell>;
}
