"use client";

import { ArrowLeft, Check, Download, ImagePlus, LoaderCircle, Plus, Sparkles, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Account = { wallet: { availablePoints: number } };
type Uploaded = { file: File; preview: string };
type TaskResult = { taskId: string; status: string; outputs: Array<{ assetId: string; url: string }>; errorCode?: string };
const ratios = ["1:1", "3:4", "4:3", "9:16"];
const scenes = ["简约棚拍", "通勤街拍", "自然居家", "精品店试穿"];
const styles = ["自然真实", "轻奢时尚", "清新日常", "电商展示"];

export default function ModelWearPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [model, setModel] = useState<Uploaded | null>(null);
  const [products, setProducts] = useState<Uploaded[]>([]);
  const [ratio, setRatio] = useState("1:1");
  const [scene, setScene] = useState(scenes[0]);
  const [style, setStyle] = useState(styles[0]);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [error, setError] = useState("");
  const [task, setTask] = useState<TaskResult | null>(null);

  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);
  useEffect(() => () => {
    if (model) URL.revokeObjectURL(model.preview);
    products.forEach((item) => URL.revokeObjectURL(item.preview));
  // Object URLs must remain valid while their current previews are rendered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const valid = (file: File) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024;
  const setModelFile = (file?: File) => { if (!file) return; if (!valid(file)) return setError("仅支持不超过 10MB 的 JPG、PNG、WebP 图片"); if (model) URL.revokeObjectURL(model.preview); setModel({ file, preview: URL.createObjectURL(file) }); setError(""); };
  const addProducts = (files?: FileList | null) => { if (!files) return; const next = [...files].filter(valid).slice(0, Math.max(0, 4 - products.length)).map((file) => ({ file, preview: URL.createObjectURL(file) })); if (!next.length) return setError("请选择不超过 10MB 的 JPG、PNG、WebP 图片"); setProducts((current) => [...current, ...next]); setError(""); };
  const request = async (url: string, init: RequestInit) => { const response = await fetch(url, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || body.code || "请求失败"); return body; };
  const uploadAsset = async (item: Uploaded) => { const presign = await request("/api/uploads/presign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.file.name, mimeType: item.file.type, byteSize: item.file.size }) }); const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": item.file.type }, body: item.file }); if (!upload.ok) throw new Error(`素材上传失败 (${upload.status})`); await request("/api/uploads/confirm/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) }); return presign.assetId as string; };
  const pollTask = async (taskId: string) => { const deadline = Date.now() + 6 * 60 * 1000; while (Date.now() < deadline) { const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" }); const current = await response.json(); if (!response.ok) throw new Error(current.message || "任务查询失败"); setTask(current); if (current.status === "SUCCEEDED") { setPhase("succeeded"); const session = await fetch("/api/auth/session/", { cache: "no-store" }).then((item) => item.json()); setAccount(session); return; } if (["FAILED", "REJECTED", "CANCELED"].includes(current.status)) throw new Error(current.errorCode || "生成失败，积分已退回"); await new Promise((resolve) => setTimeout(resolve, 3000)); } throw new Error("任务等待超时，请稍后在任务中心查看"); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!model || !products.length || phase === "uploading" || phase === "generating") return; setError(""); setPhase("uploading"); try { const [modelAssetId, ...productAssetIds] = await Promise.all([uploadAsset(model), ...products.map(uploadAsset)]); const created = await request("/api/tasks/model-wear/", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ modelAssetId, productAssetIds, aspectRatio: ratio, scene, style, prompt }) }); setPhase("generating"); await pollTask(created.taskId); } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败"); setPhase("failed"); } };
  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  const busy = phase === "uploading" || phase === "generating";
  return <main className="creator-shell"><header className="creator-header"><button className="icon-button" aria-label="返回工作台" onClick={() => router.push("/workspace")}><ArrowLeft size={19} /></button><div><strong>模特穿搭</strong><span>芭乐AIGC</span></div><div className="creator-points"><Sparkles size={15} />{account.wallet.availablePoints} 积分</div></header>
    <form className="creator-layout wear-layout" onSubmit={submit}><section className="wear-stage"><div className="wear-inputs"><section className="wear-source"><div className="wear-source-title"><span>1</span><div><strong>模特图</strong><small>建议上传清晰的正面或全身照片</small></div></div>{model ? <div className="wear-preview single"><img src={model.preview} alt="模特素材" /><button type="button" aria-label="移除模特图" onClick={() => { URL.revokeObjectURL(model.preview); setModel(null); }}><X size={16} /></button></div> : <label className="wear-drop"><ImagePlus size={24} /><span>上传模特图</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setModelFile(event.target.files?.[0])} /></label>}</section>
      <section className="wear-source"><div className="wear-source-title"><span>2</span><div><strong>商品图</strong><small>可添加 1–4 张不同颜色或款式</small></div></div><div className="wear-product-grid">{products.map((item, index) => <div className="wear-preview" key={item.preview}><img src={item.preview} alt={`商品素材 ${index + 1}`} /><button type="button" aria-label="移除商品图" onClick={() => setProducts((current) => { URL.revokeObjectURL(item.preview); return current.filter((entry) => entry.preview !== item.preview); })}><X size={15} /></button></div>)}{products.length < 4 && <label className="wear-drop compact"><Plus size={20} /><span>添加商品图</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => addProducts(event.target.files)} /></label>}</div></section></div>
      {busy && <div className="generation-overlay"><LoaderCircle size={30} /><strong>{phase === "uploading" ? "正在上传并校验素材" : "正在生成 4 张模特穿搭图"}</strong><span>任务由服务器异步处理</span></div>}{phase === "succeeded" && task && <div className="result-grid">{task.outputs.map((output, index) => <article key={output.assetId}><img src={output.url} alt={`模特穿搭结果 ${index + 1}`} /><a href={output.url} download target="_blank" rel="noreferrer"><Download size={16} />下载</a></article>)}</div>}</section>
      <aside className="creator-panel"><div className="panel-title"><span><Sparkles size={18} /></span><div><h1>生成设置</h1><p>一次生成 4 张，消耗 10 积分</p></div></div><label className="field-label">画幅比例</label><div className="ratio-control">{ratios.map((item) => <button type="button" key={item} className={ratio === item ? "active" : ""} onClick={() => setRatio(item)}>{item}</button>)}</div><label className="field-label">使用场景<select value={scene} onChange={(event) => setScene(event.target.value)}>{scenes.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">视觉风格<select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">补充要求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder="例如：保持模特发型，展示全身穿搭效果" /><small>{prompt.length}/1200</small></label>{error && <p className="creator-error" role="alert">{error}</p>}{phase === "succeeded" && <p className="creator-success"><Check size={16} />4 张结果已保存到内容资产</p>}<button className="generate-button" type="submit" disabled={!model || !products.length || busy || account.wallet.availablePoints < 10}><Upload size={18} />{busy ? "任务处理中" : account.wallet.availablePoints < 10 ? "积分不足" : "生成模特穿搭图"}</button></aside>
    </form></main>;
}
