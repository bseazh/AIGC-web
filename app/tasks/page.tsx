"use client";

export const dynamic = "force-dynamic";

import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Download, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { WorkflowIcon } from "@/app/components/workflow-icon";
import { projectGateHref } from "@/lib/project-workflows";

type Account = { user: { displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
type Task = {
  id: string; workflowKey: string; workflowName: string; status: string; statusLabel: string; points: number; adminExempt?: boolean;
  params: { aspectRatio: string | null; scene: string | null; style: string | null };
  outputCount: number; savedOutputCount: number; thumbnailUrl: string | null; errorCode: string | null; createdAt: string;
};

const taskCategories = ["全部", "AI生图", "AI电商视频", "AI工具", "AI办公"];
const statusFilters = [
  { key: "ALL", label: "全部状态" },
  { key: "DRAFT", label: "未完成" },
  { key: "SUBMITTED", label: "提交中" },
  { key: "ACTIVE", label: "执行中" },
  { key: "SUCCEEDED", label: "执行成功" },
  { key: "FAILED", label: "执行失败" },
];
const requestStatus = (status: string) => status === "SUBMITTED" || status === "DRAFT" ? "ACTIVE" : status;

function statusIcon(status: string) {
  if (status === "SUCCEEDED") return <CheckCircle2 size={17} />;
  if (["FAILED", "REJECTED", "CANCELED"].includes(status)) return <AlertCircle size={17} />;
  return <LoaderCircle size={17} />;
}

function pointsLabel(task: Task) {
  if (task.adminExempt) return "管理员免积分";
  if (task.status === "SUCCEEDED") return `已扣 ${task.points} 积分`;
  if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) return `已退回 ${task.points} 积分`;
  return `冻结 ${task.points} 积分`;
}

export default function TasksPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [category, setCategory] = useState("全部");
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const loadTasks = async (nextFilter = filter) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/list/?status=${requestStatus(nextFilter)}`, { cache: "no-store" });
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
  const saveOutputs = async (task: Task) => {
    setSavingTaskId(task.id);
    try {
      const response = await fetch(`/api/tasks/${task.id}/save-assets/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "添加到素材库失败");
      window.alert(`已添加 ${body.savedCount || 0} 个结果到素材库`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "添加到素材库失败");
    } finally {
      setSavingTaskId(null);
    }
  };

  if (!account) return <LoadingScreen />;
  return (
    <AppShell active="tasks" account={account} taskCount={activeCount}>
      <div className="app-page-content task-center-page">
        <section className="task-center-banner">
          <div>
            <h1>任务中心</h1>
            <p>查看你的任务状态</p>
          </div>
          <strong><AlertCircle size={16} />任务结果素材请尽快下载，本站仅保留 48 小时</strong>
          <button className="primary-command" onClick={() => loadTasks()} disabled={loading}><RefreshCw size={16} />刷新</button>
        </section>
        <section className="task-filter-row">
          <div className="filter-tabs">{taskCategories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <span>共 {tasks.length} 条记录</span>
        </section>
        <section className="task-status-row">
          <label>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              {statusFilters.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
            </select>
          </label>
        </section>
        <section className="records-panel">
          {loading ? <div className="records-loading"><LoaderCircle size={22} />正在刷新任务</div> : tasks.length === 0 ? (
            <div className="page-empty"><span><Clock3 size={26} /></span><strong>暂无任务记录</strong><p>提交任务后，进度、结果和素材保存操作会出现在这里。</p><Link href={projectGateHref("product-hero-image")}>开始创作</Link></div>
          ) : <div className="task-records">{tasks.map((task) => (
            <article className="task-record task-record-card" key={task.id}>
              <div className="record-thumb"><WorkflowIcon workflowKey={task.workflowKey} /></div>
              <div className="record-main"><strong>{task.workflowName}</strong><span>{[task.params.scene, task.params.style, task.params.aspectRatio].filter(Boolean).join(" · ") || "默认生成设置"}</span><time>{new Date(task.createdAt).toLocaleString("zh-CN")}</time></div>
              <span className={`record-status status-${task.status.toLowerCase()}`}>{statusIcon(task.status)}{task.statusLabel}</span>
              <span className="record-points">{pointsLabel(task)}</span>
              <span className="record-output">{["FAILED", "REJECTED", "CANCELED"].includes(task.status) ? (task.adminExempt ? `未产生积分变动 · 报价 ${task.points} 积分` : `失败已退回 ${task.points} 积分`) : task.outputCount ? `${task.outputCount} 个结果` : task.errorCode || "等待结果"}</span>
              <div className="task-record-actions">
                {task.status === "SUCCEEDED" && task.outputCount > task.savedOutputCount && <button type="button" disabled={savingTaskId === task.id} onClick={() => saveOutputs(task)}><Plus size={14} />{savingTaskId === task.id ? "添加中" : "添加到素材库"}</button>}
                {task.status === "SUCCEEDED" && task.outputCount > 0 && task.outputCount <= task.savedOutputCount && <span>已在素材库</span>}
                {task.status === "SUCCEEDED" && <button type="button"><Download size={14} />下载</button>}
                <Link href={`/tasks/${task.id}`}>查看详情<ChevronRight size={15} /></Link>
              </div>
            </article>
          ))}</div>}
        </section>
      </div>
    </AppShell>
  );
}
