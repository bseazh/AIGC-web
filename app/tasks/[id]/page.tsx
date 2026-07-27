"use client";

import { ArrowLeft, CheckCircle2, Download, ImageIcon, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
type TaskDetail = { taskId: string; workflowName: string; status: string; statusLabel: string; points: number; adminExempt?: boolean; outputs: Array<{ assetId: string; url: string; mimeType: string; name: string }>; errorCode?: string; createdAt: string; updatedAt: string };
const failureReasons: Record<string, string> = { QUEUE_UNAVAILABLE: "任务队列暂不可用", PROVIDER_TIMEOUT: "生成服务响应超时", PROVIDER_ERROR: "生成服务返回异常", CONTENT_REJECTED: "生成结果未通过审核", INPUT_CONTENT_REJECTED: "输入素材未通过审核", INPUT_REVIEW_TIMEOUT: "输入素材审核等待超时", OUTPUT_REVIEW_TIMEOUT: "生成结果审核等待超时", USER_CANCELED: "用户主动取消任务", TASK_TIMEOUT: "任务超时，积分已自动退回" };

function billingState(task: TaskDetail) {
  if (task.adminExempt) return { label: "任务计费", value: "管理员免积分" };
  if (task.status === "SUCCEEDED") return { label: "实际扣款", value: `${task.points} 积分` };
  if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) return { label: "积分状态", value: `已退回 ${task.points} 积分` };
  return { label: "冻结积分", value: `${task.points} 积分` };
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params?.id;
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [canceling, setCanceling] = useState(false);
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
  const cancel = async () => {
    if (!task || !["PENDING_INPUT_REVIEW", "QUEUED"].includes(task.status) || !window.confirm(task.adminExempt ? "确认取消这个管理员免积分任务？" : "确认取消任务并退回冻结积分？")) return;
    setCanceling(true);
    try {
      const response = await fetch(`/api/tasks/${task.taskId}/cancel/`, { method: "POST" });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "任务取消失败");
      await load();
    } catch (error) { window.alert(error instanceof Error ? error.message : "任务取消失败"); }
    finally { setCanceling(false); }
  };
  if (!account) return <LoadingScreen />;
  return <AppShell active="tasks" account={account}>
    <div className="app-page-content">
      <section className="page-intro compact"><div><Link className="back-link" href="/tasks"><ArrowLeft size={16} />返回任务中心</Link><h1>{task?.workflowName || "创作"}任务</h1><p>任务编号 {taskId || "-"}</p></div><div className="task-detail-actions">{task && ["PENDING_INPUT_REVIEW", "QUEUED"].includes(task.status) && <button className="secondary-command danger" onClick={cancel} disabled={canceling}><XCircle size={16} />{canceling ? "取消中" : "取消任务"}</button>}{task && ["FAILED", "REJECTED", "CANCELED"].includes(task.status) && <button className="secondary-command" onClick={retry} disabled={retrying}><RefreshCw size={16} />{retrying ? "重新发起中" : "重新发起"}</button>}<button className="secondary-command" onClick={load} disabled={loading}><RefreshCw size={16} />刷新状态</button></div></section>
      {loading || !task ? <div className="records-loading"><LoaderCircle size={22} />正在载入任务</div> : <>
        <section className="task-summary"><div><span>任务状态</span><strong className={`status-${task.status.toLowerCase()}`}>{task.status === "SUCCEEDED" && <CheckCircle2 size={18} />}{task.statusLabel}</strong></div><div><span>{billingState(task).label}</span><strong>{billingState(task).value}</strong></div><div><span>创建时间</span><strong>{new Date(task.createdAt).toLocaleString("zh-CN")}</strong></div><div><span>结果数量</span><strong>{task.outputs.length}</strong></div></section>
        {task.adminExempt && <p className="task-error-banner">本任务报价 {task.points} 积分，仅用于成本审计；管理员账号未冻结或扣除积分。</p>}
        {task.errorCode && <p className="task-error-banner">失败原因：{failureReasons[task.errorCode] || task.errorCode}。{task.adminExempt ? "本任务未产生积分变动。" : "失败任务积分已按规则退回。"}</p>}
        <section className="detail-results"><div className="section-title"><div><h2>生成结果</h2><p>{task.status === "PENDING_REVIEW" ? "这是一条历史待处理任务，系统将在维护时自动释放结果。" : "生成结果已保存到内容资产。"}</p></div></div>{task.outputs.length ? <div className="asset-grid">{task.outputs.map((output, index) => <article className="asset-card" key={output.assetId}><div className="asset-media">{output.mimeType.startsWith("video/") ? <video src={output.url} controls playsInline /> : <img src={output.url} alt={`${output.name} ${index + 1}`} />}</div><div className="asset-card-footer"><strong>{output.name || `生成结果 ${index + 1}`}</strong><a href={`/api/assets/${output.assetId}/download/`}><Download size={16} />下载</a></div></article>)}</div> : <div className="page-empty compact"><span><ImageIcon size={25} /></span><strong>{task.status === "PENDING_REVIEW" ? "历史任务处理中" : "结果尚未生成"}</strong><p>{task.status === "PENDING_REVIEW" ? "系统维护完成后会自动开放结果。" : "任务完成后结果会自动出现在这里。"}</p></div>}</section>
      </>}
    </div>
  </AppShell>;
}
