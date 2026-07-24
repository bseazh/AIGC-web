"use client";

import { CheckCircle2, Clock3, FileWarning, LoaderCircle, Paperclip, Send, ShieldAlert } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string; avatarUrl?: string | null; avatarStyle?: string }; wallet: { availablePoints: number } };
type Complaint = {
  id: string; complaintNo: string; taskId: string; issueType: string; description: string; status: string;
  adminNote: string | null; createdAt: string; events: Array<{ actor_role: string; to_status: string; note: string | null; created_at: string }>;
};

const issueLabels: Record<string, string> = {
  GENERATION_QUALITY: "生成质量", CONTENT_SAFETY: "内容安全", COPYRIGHT: "版权与侵权",
  BILLING: "积分与计费", PRIVACY: "隐私与数据", OTHER: "其他问题",
};
const statusLabels: Record<string, string> = { SUBMITTED: "已提交", IN_PROGRESS: "处理中", WAITING_USER: "待补充", RESOLVED: "已解决", CLOSED: "已关闭" };

export default function ComplaintsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [taskId, setTaskId] = useState("");
  const [issueType, setIssueType] = useState("GENERATION_QUALITY");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    const response = await fetch("/api/complaints/", { cache: "no-store" });
    if (response.status === 401) return router.replace("/");
    if (response.ok) setComplaints((await response.json()).complaints || []);
  };
  useEffect(() => {
    Promise.all([fetch("/api/auth/session/", { cache: "no-store" }), fetch("/api/complaints/", { cache: "no-store" })])
      .then(async ([session, records]) => {
        if (!session.ok || !records.ok) throw new Error();
        setAccount(await session.json()); setComplaints((await records.json()).complaints || []);
      }).catch(() => router.replace("/"));
  }, [router]);

  const upload = async (file: File) => {
    const presignResponse = await fetch("/api/uploads/presign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }) });
    const presign = await presignResponse.json();
    if (!presignResponse.ok) throw new Error(presign.message || `${file.name} 无法上传`);
    const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!put.ok) throw new Error(`${file.name} 上传失败`);
    const confirm = await fetch("/api/uploads/confirm/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) });
    if (!confirm.ok) throw new Error(`${file.name} 校验失败`);
    return presign.assetId as string;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setMessage("");
    try {
      const attachmentIds = await Promise.all(files.map(upload));
      const response = await fetch("/api/complaints/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId, issueType, description, attachmentIds }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "投诉提交失败");
      setMessage(`投诉已提交，编号 ${body.complaintNo}`); setTaskId(""); setDescription(""); setFiles([]); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "投诉提交失败"); }
    finally { setSubmitting(false); }
  };
  if (!account) return <LoadingScreen />;
  return <AppShell active="complaints" account={account}>
    <div className="app-page-content complaint-page">
      <section className="page-intro"><div><span className="page-kicker"><ShieldAlert size={15} />客户支持</span><h1>投诉与客服</h1><p>提交任务相关问题，并在这里查看处理记录和最新进度。</p></div></section>
      <div className="complaint-layout">
        <form className="complaint-form" onSubmit={submit}>
          <div className="section-title"><div><h2>提交投诉</h2><p>客服将根据任务记录、附件和问题描述进行核验。</p></div></div>
          <label>任务编号<input value={taskId} onChange={(event) => setTaskId(event.target.value.trim())} placeholder="输入任务 UUID" required /></label>
          <label>问题类型<select value={issueType} onChange={(event) => setIssueType(event.target.value)}>{Object.entries(issueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>问题描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={5000} placeholder="说明发生了什么、期望如何处理，以及可复现信息" required /></label>
          <label className="complaint-attachment"><span><Paperclip size={16} />附件（最多 3 个）</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/wav" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 3))} /></label>
          {files.length > 0 && <div className="complaint-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
          {message && <p className="complaint-message">{message}</p>}
          <button className="primary-command" disabled={submitting}>{submitting ? <LoaderCircle size={17} /> : <Send size={17} />}{submitting ? "正在提交" : "提交投诉"}</button>
        </form>
        <section className="complaint-records">
          <div className="section-title"><div><h2>处理进度</h2><p>状态更新后会同步发送邮件。</p></div></div>
          {complaints.length === 0 ? <div className="page-empty compact"><span><FileWarning size={24} /></span><strong>暂无投诉记录</strong><p>你提交的投诉会显示在这里。</p></div> : complaints.map((item) => <article className="complaint-item" key={item.id}>
            <header><div><strong>{item.complaintNo}</strong><small>{issueLabels[item.issueType] || item.issueType} · {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div><span className={`complaint-status status-${item.status.toLowerCase()}`}>{["RESOLVED", "CLOSED"].includes(item.status) ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{statusLabels[item.status] || item.status}</span></header>
            <p>{item.description}</p><code>{item.taskId}</code>
            <div className="complaint-timeline">{item.events.map((event, index) => <div key={`${event.created_at}-${index}`}><i /><span><strong>{statusLabels[event.to_status] || event.to_status}</strong>{event.note && <small>{event.note}</small>}<time>{new Date(event.created_at).toLocaleString("zh-CN")}</time></span></div>)}</div>
          </article>)}
        </section>
      </div>
    </div>
  </AppShell>;
}
