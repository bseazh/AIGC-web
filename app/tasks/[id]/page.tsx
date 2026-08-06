"use client";

export const dynamic = "force-dynamic";

import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Download, ImageIcon, LoaderCircle, Plus, RefreshCw, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { isProjectWorkflowKey, projectStartHref, type ProjectWorkflowKey } from "@/lib/project-workflows";

type Account = { user: { displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
type TaskOutput = { assetId: string; url: string; mimeType: string; name: string; savedToLibrary: boolean; expiresAt: string | null };
type TaskInputSummary = { prompt: string; scene: string; style: string; aspectRatio: string; duration: string; resolution: string; assetCount: number };
type TaskDetail = { taskId: string; workflowKey: string; workflowName: string; status: string; statusLabel: string; points: number; adminExempt?: boolean; outputs: TaskOutput[]; expiredOutputCount: number; originalOutputCount: number; inputSummary: TaskInputSummary; project: { id: string; title: string } | null; errorCode?: string; createdAt: string; updatedAt: string };
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
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [previewOutput, setPreviewOutput] = useState<TaskOutput | null>(null);
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
  useEffect(() => {
    if (!previewOutput) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOutput(null);
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !task || task.outputs.length < 2) return;
      const currentIndex = task.outputs.findIndex((output) => output.assetId === previewOutput.assetId);
      if (currentIndex < 0) return;
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      setPreviewOutput(task.outputs[(currentIndex + offset + task.outputs.length) % task.outputs.length]);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewOutput, task]);
  const retry = async () => {
    if (!task || (!["FAILED", "REJECTED", "CANCELED"].includes(task.status) && !(task.status === "SUCCEEDED" && task.outputs.length === 0 && task.expiredOutputCount > 0))) return;
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
  const saveOutputs = async (assetIds?: string[]) => {
    if (!task) return;
    setSavingAssetId(assetIds?.[0] || "ALL");
    try {
      const response = await fetch(`/api/tasks/${task.taskId}/save-assets/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetIds }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "添加到素材库失败");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "添加到素材库失败");
    } finally {
      setSavingAssetId(null);
    }
  };
  const previewIndex = previewOutput && task ? task.outputs.findIndex((output) => output.assetId === previewOutput.assetId) : -1;
  const projectHref = task?.project && isProjectWorkflowKey(task.workflowKey) ? projectStartHref(task.workflowKey as ProjectWorkflowKey, task.project.id) : null;
  const movePreview = (offset: number) => {
    if (!task || previewIndex < 0 || task.outputs.length < 2) return;
    setPreviewOutput(task.outputs[(previewIndex + offset + task.outputs.length) % task.outputs.length]);
  };
  if (!account) return <LoadingScreen />;
  return <AppShell active="tasks" account={account}>
    <div className="app-page-content">
      <section className="page-intro compact"><div><Link className="back-link" href="/tasks"><ArrowLeft size={16} />返回任务中心</Link><h1>{task?.workflowName || "创作"}任务</h1><p>任务编号 {taskId || "-"}</p></div><div className="task-detail-actions">{projectHref && <Link className="secondary-command" href={projectHref}>回到项目继续编辑</Link>}{task && ["PENDING_INPUT_REVIEW", "QUEUED"].includes(task.status) && <button className="secondary-command danger" onClick={cancel} disabled={canceling}><XCircle size={16} />{canceling ? "取消中" : "取消任务"}</button>}{task && (["FAILED", "REJECTED", "CANCELED"].includes(task.status) || (task.status === "SUCCEEDED" && task.outputs.length === 0 && task.expiredOutputCount > 0)) && <button className="secondary-command" onClick={retry} disabled={retrying}><RefreshCw size={16} />{retrying ? "重新发起中" : task.expiredOutputCount > 0 ? "按原参数重新生成" : "重新发起"}</button>}<button className="secondary-command" onClick={load} disabled={loading}><RefreshCw size={16} />刷新状态</button></div></section>
      {loading || !task ? <div className="records-loading"><LoaderCircle size={22} />正在载入任务</div> : <>
        <section className="task-summary"><div><span>任务状态</span><strong className={`status-${task.status.toLowerCase()}`}>{task.status === "SUCCEEDED" && <CheckCircle2 size={18} />}{task.statusLabel}</strong></div><div><span>{billingState(task).label}</span><strong>{billingState(task).value}</strong></div><div><span>创建时间</span><strong>{new Date(task.createdAt).toLocaleString("zh-CN")}</strong></div><div><span>结果数量</span><strong>{task.outputs.length}</strong></div></section>
        {task.project && <p className="task-project-banner">所属项目：{task.project.title}。项目、输入参数和任务记录会长期保留，结果文件未保存到素材库时默认只保留 48 小时。</p>}
        {task.expiredOutputCount > 0 && <p className="task-error-banner">有 {task.expiredOutputCount} 个生成结果已超过 48 小时并被清理。你仍可回到项目继续编辑，或按原参数重新生成。</p>}
        {task.adminExempt && <p className="task-error-banner">本任务报价 {task.points} 积分，仅用于成本审计；管理员账号未冻结或扣除积分。</p>}
        {task.errorCode && <p className="task-error-banner">失败原因：{failureReasons[task.errorCode] || task.errorCode}。{task.adminExempt ? "本任务未产生积分变动。" : "失败任务积分已按规则退回。"}</p>}
        <section className="task-input-summary"><div className="section-title"><div><h2>保留的输入参数</h2><p>即使结果文件过期，项目输入和任务参数仍保留，可用于重新生成。</p></div></div><div>{[
          ["场景", task.inputSummary.scene],
          ["风格", task.inputSummary.style],
          ["比例", task.inputSummary.aspectRatio],
          ["时长", task.inputSummary.duration],
          ["清晰度", task.inputSummary.resolution],
          ["素材数", task.inputSummary.assetCount ? `${task.inputSummary.assetCount} 个` : ""],
        ].filter((item) => item[1]).map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>{task.inputSummary.prompt && <p>{task.inputSummary.prompt}</p>}</section>
        <section className="detail-results"><div className="section-title"><div><h2>生成结果</h2><p>{task.status === "PENDING_REVIEW" ? "这是一条历史待处理任务，系统将在维护时自动释放结果。" : "结果默认临时保留 48 小时；添加到素材库后才会长期保存。"}</p></div>{task.outputs.some((output) => !output.savedToLibrary) && <button className="secondary-command" type="button" disabled={savingAssetId === "ALL"} onClick={() => saveOutputs()}><Plus size={16} />{savingAssetId === "ALL" ? "添加中" : "全部添加到素材库"}</button>}</div>{task.outputs.length ? <div className="asset-grid">{task.outputs.map((output, index) => <article className="asset-card" key={output.assetId}><button className="asset-media" type="button" aria-label={`预览${output.name || `生成结果 ${index + 1}`}`} onClick={() => setPreviewOutput(output)}>{output.mimeType.startsWith("video/") ? <video src={output.url} muted preload="metadata" playsInline /> : <img src={output.url} alt={`${output.name} ${index + 1}`} />}</button><div className="asset-card-footer task-output-footer"><div><strong>{output.name || `生成结果 ${index + 1}`}</strong><small>{output.savedToLibrary ? "已加入素材库" : output.expiresAt ? `临时结果 · ${new Date(output.expiresAt).toLocaleString("zh-CN")} 前可保存` : "临时结果"}</small></div><a href={`/api/assets/${output.assetId}/download/`}><Download size={16} />下载</a>{!output.savedToLibrary && <button type="button" disabled={savingAssetId === output.assetId} onClick={() => saveOutputs([output.assetId])}><Plus size={16} />{savingAssetId === output.assetId ? "添加中" : "加入素材库"}</button>}</div></article>)}</div> : <div className="page-empty compact"><span><ImageIcon size={25} /></span><strong>{task.expiredOutputCount > 0 ? "结果文件已过期" : task.status === "PENDING_REVIEW" ? "历史任务处理中" : "结果尚未生成"}</strong><p>{task.expiredOutputCount > 0 ? "任务记录和输入参数仍已保留，可以回到项目继续编辑或重新生成。" : task.status === "PENDING_REVIEW" ? "系统维护完成后会自动开放结果。" : "任务完成后结果会自动出现在这里。"}</p></div>}</section>
      </>}
    </div>
    {previewOutput && <div className="asset-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreviewOutput(null)}><section className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={`预览${previewOutput.name || "生成结果"}`}><button className="asset-preview-close" type="button" aria-label="关闭预览" title="关闭" onClick={() => setPreviewOutput(null)}><X size={21} /></button><div className="asset-preview-stage">{previewOutput.mimeType.startsWith("video/") ? <video key={previewOutput.assetId} src={previewOutput.url} controls autoPlay playsInline /> : <img src={previewOutput.url} alt={previewOutput.name || "生成结果"} />}</div>{task && task.outputs.length > 1 && <><button className="asset-preview-nav previous" type="button" aria-label="上一个" title="上一个" onClick={() => movePreview(-1)}><ChevronLeft size={24} /></button><button className="asset-preview-nav next" type="button" aria-label="下一个" title="下一个" onClick={() => movePreview(1)}><ChevronRight size={24} /></button></>}<footer><div><strong>{previewOutput.name || "生成结果"}</strong><small>{previewOutput.savedToLibrary ? "已加入素材库" : "临时生成结果"}</small></div><a href={`/api/assets/${previewOutput.assetId}/download/`}><Download size={17} />下载</a>{!previewOutput.savedToLibrary && <button type="button" onClick={() => saveOutputs([previewOutput.assetId])}><Plus size={17} />加入素材库</button>}</footer></section></div>}
  </AppShell>;
}
