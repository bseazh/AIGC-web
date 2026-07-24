"use client";

import { Ban, Check, ClipboardCheck, FileKey, History, RefreshCw, RotateCcw, ShieldCheck, TicketCheck, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LoadingScreen } from "@/app/components/app-shell";

type Review = { id: string; taskId: string | null; phase: string; status: string; riskLevel: string; createdAt: string; asset: { mimeType: string; originalName: string; previewUrl: string }; owner: { displayName: string; identifier: string } };
type Complaint = { id: string; complaintNo: string; taskId: string; issueType: string; description: string; status: string; adminNote: string | null; userName: string; identifier: string; createdAt: string; attachments: Array<{ id: string; mimeType: string; originalName: string; previewUrl: string }> };
type User = { id: string; display_name: string; identifier: string; status: string; available_points: number; created_at: string };
type Task = { id: string; display_name: string; workflowName: string; status: string; statusLabel: string; points: number; error_code: string | null; created_at: string };
type Authorization = { id: string; taskId: string | null; consentVersion: string; consent: Record<string, unknown>; ipAddress: string | null; createdAt: string; userName: string; identifier: string };
type AuditEvent = { id: string; eventType: string; resourceType: string | null; resourceId: string | null; actor: string; ipAddress: string | null; details: Record<string, unknown>; createdAt: string };
type Tab = "reviews" | "complaints" | "users" | "tasks" | "authorizations" | "audit";

const tabs: Array<{ key: Tab; label: string; icon: typeof ShieldCheck }> = [
  { key: "reviews", label: "内容审核", icon: ClipboardCheck }, { key: "complaints", label: "投诉处理", icon: TicketCheck },
  { key: "users", label: "用户状态", icon: Users }, { key: "tasks", label: "失败任务", icon: RotateCcw },
  { key: "authorizations", label: "授权记录", icon: FileKey }, { key: "audit", label: "操作审计", icon: History },
];

export default function AdminSupportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("reviews");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [note, setNote] = useState("");
  const [reasonCode, setReasonCode] = useState("POLICY_VIOLATION");
  const [complaintStatus, setComplaintStatus] = useState("IN_PROGRESS");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const responses = await Promise.all([
      fetch("/api/auth/session/", { cache: "no-store" }), fetch("/api/admin/reviews/", { cache: "no-store" }),
      fetch("/api/admin/complaints/", { cache: "no-store" }), fetch("/api/admin/overview/", { cache: "no-store" }),
      fetch("/api/admin/authorizations/", { cache: "no-store" }), fetch("/api/admin/audit/", { cache: "no-store" }),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error("forbidden");
    const [session, reviewData, complaintData, overview, authorizationData, auditData] = await Promise.all(responses.map((response) => response.json()));
    if (!session.user.isAdministrator) throw new Error("forbidden");
    setReviews(reviewData.reviews || []); setComplaints(complaintData.complaints || []); setUsers(overview.users || []);
    setTasks((overview.tasks || []).filter((task: Task) => ["FAILED", "REJECTED", "CANCELED"].includes(task.status)));
    setAuthorizations(authorizationData.authorizations || []); setEvents(auditData.events || []); setReady(true);
  };
  useEffect(() => { load().catch(() => router.replace("/workspace")); }, [router]);

  const decideReview = async (action: "APPROVE" | "REJECT" | "ESCALATE") => {
    if (!selectedReview) return; setBusy(selectedReview.id); setMessage("");
    const response = await fetch(`/api/admin/reviews/${selectedReview.id}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note, reasonCode, severity: "HIGH" }) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setMessage(body.message || "审核操作失败");
    setMessage(`审核状态已更新为 ${body.status}`); setSelectedReview(null); setNote(""); await load();
  };
  const updateComplaint = async () => {
    if (!selectedComplaint) return; setBusy(selectedComplaint.id); setMessage("");
    const response = await fetch(`/api/admin/complaints/${selectedComplaint.id}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: complaintStatus, note }) });
    const body = await response.json(); setBusy("");
    if (!response.ok) return setMessage(body.message || "投诉更新失败");
    setMessage(`投诉 ${body.complaintNo} 已更新`); setSelectedComplaint(null); setNote(""); await load();
  };
  const changeUserStatus = async (user: User) => {
    const next = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const reason = next === "SUSPENDED" ? window.prompt("填写冻结原因")?.trim() : "管理员解除冻结";
    if (!reason) return;
    setBusy(user.id); const response = await fetch(`/api/admin/users/${user.id}/status/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next, reason }) });
    const body = await response.json(); setBusy(""); if (!response.ok) return setMessage(body.message || "用户状态更新失败"); setMessage(`用户状态已更新为 ${body.status}`); await load();
  };
  const retryTask = async (task: Task) => {
    const reason = window.prompt("填写人工重试原因")?.trim(); if (!reason) return;
    setBusy(task.id); const response = await fetch(`/api/admin/tasks/${task.id}/retry/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const body = await response.json(); setBusy(""); if (!response.ok) return setMessage(body.message || "任务重试失败"); setMessage(`已创建重试任务 ${body.taskId}`); await load();
  };
  if (!ready) return <LoadingScreen />;

  return <main className="admin-shell"><header><div><span><ShieldCheck size={17} />受限后台</span><h1>审核与客服</h1><p>处理内容审核、投诉、用户状态、任务重试、授权记录和管理员审计。</p></div><div className="admin-header-actions"><button onClick={() => load()}><RefreshCw size={15} />刷新</button><Link className="admin-back-link" href="/workspace">返回工作台</Link></div></header>
    <section className="admin-query"><div className="admin-query-tabs">{tabs.map((item) => { const Icon = item.icon; return <button key={item.key} className={tab === item.key ? "active" : ""} onClick={() => { setTab(item.key); setMessage(""); }}><Icon size={16} />{item.label}</button>; })}</div>{message && <p className="admin-message support-message">{message}</p>}
      {tab === "reviews" && <div className="support-split"><div className="support-list">{reviews.length ? reviews.map((review) => <button key={review.id} className={selectedReview?.id === review.id ? "selected" : ""} onClick={() => { setSelectedReview(review); setNote(""); }}><span>{review.asset.mimeType.startsWith("video/") ? <video src={review.asset.previewUrl} muted /> : <img src={review.asset.previewUrl} alt="" />}</span><div><strong>{review.asset.originalName}</strong><small>{review.owner.displayName} · {review.phase === "UPLOAD" ? "上传素材" : "生成结果"}</small><time>{new Date(review.createdAt).toLocaleString("zh-CN")}</time></div></button>) : <div className="admin-empty">暂无待审核内容</div>}</div><div className="support-action"><h2>审核决定</h2>{selectedReview ? <><p>{selectedReview.asset.originalName}<small>{selectedReview.owner.identifier}</small></p><label>违规原因<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="POLICY_VIOLATION">平台规则违规</option><option value="COPYRIGHT">版权或侵权</option><option value="SEXUAL_CONTENT">色情低俗</option><option value="VIOLENCE">暴力危险</option><option value="PERSONAL_DATA">个人信息</option></select></label><label>审核备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></label><div><button onClick={() => decideReview("APPROVE")} disabled={busy === selectedReview.id}><Check size={15} />通过</button><button className="danger" onClick={() => decideReview("REJECT")} disabled={busy === selectedReview.id}><X size={15} />拒绝</button><button onClick={() => decideReview("ESCALATE")} disabled={busy === selectedReview.id}>升级复核</button></div></> : <p className="prompt-empty">从左侧选择一条审核记录。</p>}</div></div>}
      {tab === "complaints" && <div className="support-split"><div className="support-list text-only">{complaints.length ? complaints.map((item) => <button key={item.id} className={selectedComplaint?.id === item.id ? "selected" : ""} onClick={() => { setSelectedComplaint(item); setNote(item.adminNote || ""); }}><div><strong>{item.complaintNo}</strong><small>{item.userName} · {item.issueType}</small><p>{item.description}</p><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></div></button>) : <div className="admin-empty">暂无待处理投诉</div>}</div><div className="support-action"><h2>处理投诉</h2>{selectedComplaint ? <><p>{selectedComplaint.complaintNo}<small>任务 {selectedComplaint.taskId}</small></p>{selectedComplaint.attachments.length > 0 && <div className="support-attachments">{selectedComplaint.attachments.map((attachment) => <a href={attachment.previewUrl} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.originalName}</a>)}</div>}<label>处理状态<select value={complaintStatus} onChange={(event) => setComplaintStatus(event.target.value)}><option value="IN_PROGRESS">处理中</option><option value="WAITING_USER">待用户补充</option><option value="RESOLVED">已解决</option><option value="CLOSED">关闭</option></select></label><label>处理备注<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></label><div><button onClick={updateComplaint} disabled={busy === selectedComplaint.id}><TicketCheck size={15} />保存进度</button></div></> : <p className="prompt-empty">从左侧选择一条投诉。</p>}</div></div>}
      {tab === "users" && <AdminTable headings={["用户", "账号", "状态", "积分", "注册时间", "操作"]}>{users.map((user) => <tr key={user.id}><td>{user.display_name}</td><td>{user.identifier}</td><td><span className={`admin-status ${user.status.toLowerCase()}`}>{user.status}</span></td><td>{user.available_points}</td><td>{new Date(user.created_at).toLocaleString("zh-CN")}</td><td><button className="table-action" disabled={busy === user.id} onClick={() => changeUserStatus(user)}>{user.status === "ACTIVE" ? <><Ban size={13} />冻结</> : <><Check size={13} />解封</>}</button></td></tr>)}</AdminTable>}
      {tab === "tasks" && <AdminTable headings={["用户", "任务", "状态", "错误", "积分", "创建时间", "操作"]}>{tasks.map((task) => <tr key={task.id}><td>{task.display_name}</td><td>{task.workflowName}<small>{task.id}</small></td><td>{task.statusLabel}</td><td>{task.error_code || "-"}</td><td>{task.points}</td><td>{new Date(task.created_at).toLocaleString("zh-CN")}</td><td><button className="table-action" disabled={busy === task.id} onClick={() => retryTask(task)}><RotateCcw size={13} />重试</button></td></tr>)}</AdminTable>}
      {tab === "authorizations" && <AdminTable headings={["用户", "任务", "版本", "确认内容", "IP", "时间"]}>{authorizations.map((item) => <tr key={item.id}><td>{item.userName}<small>{item.identifier}</small></td><td>{item.taskId || "-"}</td><td>{item.consentVersion}</td><td><code>{JSON.stringify(item.consent)}</code></td><td>{item.ipAddress || "-"}</td><td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td></tr>)}</AdminTable>}
      {tab === "audit" && <AdminTable headings={["时间", "管理员", "事件", "资源", "IP", "详情"]}>{events.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString("zh-CN")}</td><td>{event.actor}</td><td>{event.eventType}</td><td>{event.resourceType || "-"} {event.resourceId || ""}</td><td>{event.ipAddress || "-"}</td><td><code>{JSON.stringify(event.details)}</code></td></tr>)}</AdminTable>}
    </section>
  </main>;
}

function AdminTable({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="admin-table-wrap"><table><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
