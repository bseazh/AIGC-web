"use client";

import { ArrowLeft, Ban, CheckCircle2, Copy, FileKey2, LoaderCircle, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/app/components/app-shell";

type CodeItem = { id: string; code_hint: string; points: number; max_redemptions: number; redeemed_count: number; status: "ACTIVE" | "DISABLED"; note: string | null; expires_at: string | null; created_at: string; created_by_name: string };

export default function RechargeCodesAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [points, setPoints] = useState("100");
  const [maxRedemptions, setMaxRedemptions] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/recharge-codes/", { cache: "no-store" });
    if (!response.ok) throw new Error();
    setCodes((await response.json()).codes || []);
  }, []);
  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const session = await response.json(); if (!session.user.isAdministrator) throw new Error();
      await load(); setReady(true);
    }).catch(() => router.replace("/workspace"));
  }, [load, router]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setMessage(""); setCreatedCode("");
    const response = await fetch("/api/admin/recharge-codes/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ points: Number(points), maxRedemptions: Number(maxRedemptions), expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, note }) });
    const body = await response.json(); setSubmitting(false);
    if (!response.ok) return setMessage(body.message || "创建失败");
    setCreatedCode(body.code); setMessage("兑换码已创建。完整码仅在此处显示一次，请立即复制保存。"); await load();
  };
  const toggle = async (item: CodeItem) => {
    const response = await fetch("/api/admin/recharge-codes/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, status: item.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }) });
    if (!response.ok) return setMessage("状态更新失败"); await load();
  };
  if (!ready) return <LoadingScreen />;
  return <main className="admin-shell"><header><div><span><ShieldCheck size={17} />管理员后台</span><h1>充值码 / 兑换码</h1><p>支付开通前的临时积分发放渠道；每个账号对同一兑换码仅可兑换一次。</p></div><Link className="admin-back-link" href="/admin"><ArrowLeft size={16} />管理控制台</Link></header>
    <section className="admin-code-layout"><form className="admin-code-form" onSubmit={create}><div className="prompt-section-heading"><Plus size={18} /><div><strong>创建兑换码</strong><small>兑换码只以哈希形式保存，创建后无法再次查看完整码。</small></div></div><label>到账积分<input type="number" min="1" max="1000000" value={points} onChange={(event) => setPoints(event.target.value)} /></label><label>可兑换次数<input type="number" min="1" max="10000" value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} /></label><label>有效期（可选）<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><label>备注（可选）<textarea maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：生产验收账号积分" /></label>{createdCode && <div className="created-code"><code>{createdCode}</code><button type="button" onClick={() => navigator.clipboard.writeText(createdCode)}><Copy size={14} />复制</button></div>}{message && <p className="admin-message">{message}</p>}<button className="admin-submit" disabled={submitting}>{submitting ? <LoaderCircle size={17} /> : <FileKey2 size={17} />}{submitting ? "创建中" : "生成兑换码"}</button></form>
    <section className="admin-query admin-code-list"><div className="provider-log-heading"><div><span><FileKey2 size={17} />兑换码记录</span><p>仅显示掩码、额度、核销进度和状态。</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>兑换码</th><th>积分</th><th>核销</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead><tbody>{codes.length ? codes.map((item) => <tr key={item.id}><td><strong>{item.code_hint}</strong><small>{item.note || item.created_by_name}</small></td><td>{item.points.toLocaleString()}</td><td>{item.redeemed_count} / {item.max_redemptions}</td><td>{item.expires_at ? new Date(item.expires_at).toLocaleString("zh-CN") : "长期有效"}</td><td>{item.status === "ACTIVE" ? <span className="admin-status succeeded"><CheckCircle2 size={12} />启用</span> : <span className="admin-status failed">已停用</span>}</td><td><button className="table-action" onClick={() => toggle(item)}>{item.status === "ACTIVE" ? <><Ban size={13} />停用</> : "重新启用"}</button></td></tr>) : <tr><td colSpan={6} className="prompt-empty">尚未创建兑换码。</td></tr>}</tbody></table></div></section></section>
  </main>;
}
