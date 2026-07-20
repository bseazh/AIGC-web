"use client";

import { ArrowLeft, CheckCircle2, Download, ImageIcon, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type TaskDetail = { taskId: string; status: string; points: number; outputs: Array<{ assetId: string; url: string }>; errorCode?: string; createdAt: string; updatedAt: string };

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const response = await fetch(`/api/tasks/${params.id}/`, { cache: "no-store" });
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
  }, [params.id, router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="tasks" account={account}>
    <div className="app-page-content">
      <section className="page-intro compact"><div><Link className="back-link" href="/tasks"><ArrowLeft size={16} />返回任务中心</Link><h1>商品主图任务</h1><p>任务编号 {params.id}</p></div><button className="secondary-command" onClick={load} disabled={loading}><RefreshCw size={16} />刷新状态</button></section>
      {loading || !task ? <div className="records-loading"><LoaderCircle size={22} />正在载入任务</div> : <>
        <section className="task-summary"><div><span>任务状态</span><strong className={`status-${task.status.toLowerCase()}`}>{task.status === "SUCCEEDED" && <CheckCircle2 size={18} />}{task.status}</strong></div><div><span>消耗积分</span><strong>{task.points}</strong></div><div><span>创建时间</span><strong>{new Date(task.createdAt).toLocaleString("zh-CN")}</strong></div><div><span>结果数量</span><strong>{task.outputs.length}</strong></div></section>
        {task.errorCode && <p className="task-error-banner">任务未完成：{task.errorCode}。失败任务积分已按规则退回。</p>}
        <section className="detail-results"><div className="section-title"><div><h2>生成结果</h2><p>结果已保存到内容资产，签名链接将在一小时后更新。</p></div></div>{task.outputs.length ? <div className="asset-grid">{task.outputs.map((output, index) => <article className="asset-card" key={output.assetId}><div className="asset-media"><img src={output.url} alt={`商品主图 ${index + 1}`} /></div><div className="asset-card-footer"><strong>商品主图 {index + 1}</strong><a href={output.url} target="_blank" rel="noreferrer"><Download size={16} />下载</a></div></article>)}</div> : <div className="page-empty compact"><span><ImageIcon size={25} /></span><strong>结果尚未生成</strong><p>任务完成后结果会自动出现在这里。</p></div>}</section>
      </>}
    </div>
  </AppShell>;
}
