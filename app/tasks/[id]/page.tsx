"use client";

import { ArrowLeft, CheckCircle2, Download, ImageIcon, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type TaskDetail = { taskId: string; workflowName: string; status: string; statusLabel: string; points: number; outputs: Array<{ assetId: string; url: string; mimeType: string; name: string }>; errorCode?: string; createdAt: string; updatedAt: string };
const failureReasons: Record<string, string> = { QUEUE_UNAVAILABLE: "任务队列暂不可用", PROVIDER_TIMEOUT: "生成服务响应超时", PROVIDER_ERROR: "生成服务返回异常", CONTENT_REJECTED: "内容未通过审核" };

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params?.id;
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const load = async () => {
    if (!taskId) return router.replace("/tasks");
    setLoading(true);
    const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" });
    if (response.status === 401) return router.replace("/");
    if (!response.ok) return router.replace("/tasks");
    setTask(await response.json());
    setLoading(false);
  };
  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(); setAccount(await response.json());
    }).catch(() => router.replace("/"));
    load();
  }, [taskId, router]);
  const retry = async () => {
    if (!task || !["FAILED", "REJECTED", "CANCELED"].includes(task.status)) return;
    setRetrying(true);
    try {
      const response = await fetch(`/api/tasks/${task.taskId}/retry/`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "重新发起失败");
      router.push(`/tasks/${body.taskId}`);
    } catch (error) { window.alert(error instanceof Error ? error.message : "重新发起失败"); }
    finally { setRetrying(false); }
  };
  if (!account) return <LoadingScreen />;
  return <AppShell active="tasks" account={account}>
    <div className="app-page-content">
      <section className="page-intro compact"><div><Link className="back-link" href="/tasks"><ArrowLeft size={16} />返回任务中心</Link><h1>{task?.workflowName || "创作"}任务</h1><p>任务编号 {taskId || "-"}</p></div><div className="task-detail-actions">{task && ["FAILED", "REJECTED", "CANCELED"].includes(task.status) && <button className="secondary-command" onClick={retry} disabled={retrying}><RefreshCw size={16} />{retrying ? "重新发起中" : "重新发起"}</button>}<button className="secondary-command" onClick={load} disabled={loading}><RefreshCw size={16} />刷新状态</button></div></section>
      {loading || !task ? <div className="records-loading"><LoaderCircle size={22} />正在载入任务</div> : <>
        <section className="task-summary"><div><span>任务状态</span><strong className={`status-${task.status.toLowerCase()}`}>{task.status === "SUCCEEDED" && <CheckCircle2 size={18} />}{task.statusLabel}</strong></div><div><span>消耗积分</span><strong>{task.points}</strong></div><div><span>创建时间</span><strong>{new Date(task.createdAt).toLocaleString("zh-CN")}</strong></div><div><span>结果数量</span><strong>{task.outputs.length}</strong></div></section>
        {task.errorCode && <p className="task-error-banner">失败原因：{failureReasons[task.errorCode] || task.errorCode}。失败任务积分已按规则退回。</p>}
        <section className="detail-results"><div className="section-title"><div><h2>生成结果</h2><p>结果已安全保存到内容资产，可直接下载原始视频或图片。</p></div></div>{task.outputs.length ? <div className="asset-grid">{task.outputs.map((output, index) => <article className="asset-card" key={output.assetId}><div className="asset-media">{output.mimeType.startsWith("video/") ? <video src={output.url} controls playsInline /> : <img src={output.url} alt={`${output.name} ${index + 1}`} />}</div><div className="asset-card-footer"><strong>{output.name || `生成结果 ${index + 1}`}</strong><a href={`/api/assets/${output.assetId}/download/`}><Download size={16} />下载</a></div></article>)}</div> : <div className="page-empty compact"><span><ImageIcon size={25} /></span><strong>结果尚未生成</strong><p>任务完成后结果会自动出现在这里。</p></div>}</section>
      </>}
    </div>
  </AppShell>;
}
