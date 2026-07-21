"use client";

import { AlertCircle, CheckCircle2, ChevronRight, Clock3, ImageIcon, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type Task = {
  id: string; workflowName: string; status: string; statusLabel: string; points: number;
  params: { aspectRatio: string | null; scene: string | null; style: string | null };
  outputCount: number; thumbnailUrl: string | null; errorCode: string | null; createdAt: string;
};

const filters = [
  { key: "ALL", label: "全部" },
  { key: "ACTIVE", label: "进行中" },
  { key: "SUCCEEDED", label: "已完成" },
  { key: "FAILED", label: "失败" },
];

function statusIcon(status: string) {
  if (status === "SUCCEEDED") return <CheckCircle2 size={17} />;
  if (["FAILED", "REJECTED", "CANCELED"].includes(status)) return <AlertCircle size={17} />;
  return <LoaderCircle size={17} />;
}

export default function TasksPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const loadTasks = async (nextFilter = filter) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/list/?status=${nextFilter}`, { cache: "no-store" });
      if (response.status === 401) return router.replace("/");
      const body = await response.json();
      setTasks(body.tasks || []);
      setActiveCount(body.activeCount || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      setAccount(await response.json());
    }).catch(() => router.replace("/"));
  }, [router]);
  useEffect(() => { if (account) loadTasks(filter); }, [account, filter]);
  useEffect(() => {
    if (!account || activeCount === 0) return;
    const timer = window.setInterval(() => loadTasks(filter), 8000);
    return () => window.clearInterval(timer);
  }, [account, activeCount, filter]);

  if (!account) return <LoadingScreen />;
  return (
    <AppShell active="tasks" account={account} taskCount={activeCount}>
      <div className="app-page-content">
        <section className="page-intro"><div><span className="page-kicker"><Clock3 size={15} />创作记录</span><h1>任务中心</h1><p>查看生成进度、积分状态与历史结果；进行中的任务会自动刷新。</p></div><button className="secondary-command" onClick={() => loadTasks()} disabled={loading}><RefreshCw size={16} />刷新</button></section>
        <section className="filter-bar">
          <div className="filter-tabs">{filters.map((item) => <button key={item.key} className={filter === item.key ? "active" : ""} onClick={() => setFilter(item.key)}>{item.label}</button>)}</div>
          <span>共 {tasks.length} 条记录</span>
        </section>
        <section className="records-panel">
          {loading ? <div className="records-loading"><LoaderCircle size={22} />正在刷新任务</div> : tasks.length === 0 ? (
            <div className="page-empty"><span><Clock3 size={26} /></span><strong>暂无任务记录</strong><p>完成一次商品主图创作后，任务进度和结果会保存在这里。</p><Link href="/create/product-hero">开始创作</Link></div>
          ) : <div className="task-records">{tasks.map((task) => (
            <Link href={`/tasks/${task.id}`} className="task-record" key={task.id}>
              <div className="record-thumb">{task.thumbnailUrl ? <img src={task.thumbnailUrl} alt="" /> : <ImageIcon size={22} />}</div>
              <div className="record-main"><strong>{task.workflowName}</strong><span>{[task.params.scene, task.params.style, task.params.aspectRatio].filter(Boolean).join(" · ") || "默认生成设置"}</span><time>{new Date(task.createdAt).toLocaleString("zh-CN")}</time></div>
              <span className={`record-status status-${task.status.toLowerCase()}`}>{statusIcon(task.status)}{task.statusLabel}</span>
              <span className="record-points">{task.points} 积分</span>
              <span className="record-output">{["FAILED", "REJECTED", "CANCELED"].includes(task.status) ? `失败已退回 ${task.points} 积分` : task.outputCount ? `${task.outputCount} 个结果` : task.errorCode || "等待结果"}</span>
              <ChevronRight size={18} />
            </Link>
          ))}</div>}
        </section>
      </div>
    </AppShell>
  );
}
