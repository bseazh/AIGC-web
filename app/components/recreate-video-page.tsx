"use client";

import { ArrowLeft, ChevronDown, Film, FolderOpen, ImagePlus, LoaderCircle, ShieldCheck, Sparkles, Upload, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

type Item = { preview: string; name: string; byteSize: number; file?: File; assetId?: string };
type Asset = { id: string; mimeType: string; byteSize: number; originalName: string; url: string };
type Account = { wallet: { availablePoints: number } };
type Result = { outputs: Array<{ url: string }> };
type SourceKind = "video" | "product" | "scene";
const imageAccept = "image/jpeg,image/png,image/webp";

export function RecreateVideoPage() {
  const router = useRouter();
  const refs = { video: useRef<HTMLInputElement>(null), product: useRef<HTMLInputElement>(null), scene: useRef<HTMLInputElement>(null) };
  const [account, setAccount] = useState<Account | null>(null);
  const [reference, setReference] = useState<Item | null>(null);
  const [products, setProducts] = useState<Item[]>([]);
  const [scene, setScene] = useState<Item | null>(null);
  const [tab, setTab] = useState<SourceKind | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [info, setInfo] = useState("");
  const [special, setSpecial] = useState("");
  const [modelOn, setModelOn] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("15");
  const [resolution, setResolution] = useState("720p");
  const [phase, setPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);

  const resetTask = () => { setError(""); setResult(null); setPhase("idle"); };
  const choose = (kind: SourceKind, files?: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    if (kind === "video") {
      const file = list[0];
      if (file.type !== "video/mp4") return setError("对标视频仅支持 MP4 格式");
      if (file.size > 100 * 1024 * 1024) return setError("对标视频不能超过 100MB");
      setReference({ file, preview: URL.createObjectURL(file), name: file.name, byteSize: file.size });
    } else {
      const valid = list.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024).map((file) => ({ file, preview: URL.createObjectURL(file), name: file.name, byteSize: file.size }));
      if (!valid.length) return setError("请上传 10MB 以内的 JPG、PNG 或 WebP 图片");
      if (kind === "scene") setScene(valid[0]);
      else setProducts((current) => [...current, ...valid].slice(0, 5));
    }
    resetTask();
  };
  const openLibrary = async (kind: SourceKind) => {
    setTab(kind); setError("");
    try { const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(); setAssets((body.assets || []).filter((asset: Asset) => kind === "video" ? asset.mimeType === "video/mp4" : asset.mimeType.startsWith("image/"))); } catch { setError("素材库加载失败，请稍后再试"); }
  };
  const select = (asset: Asset) => {
    const selected = { assetId: asset.id, preview: asset.url, name: asset.originalName, byteSize: asset.byteSize };
    if (tab === "video") setReference(selected);
    if (tab === "scene") setScene(selected);
    if (tab === "product") setProducts((current) => current.some((item) => item.assetId === asset.id) ? current.filter((item) => item.assetId !== asset.id) : current.length < 5 ? [...current, selected] : current);
    setTab(null); resetTask();
  };
  const removeProduct = (index: number) => setProducts((current) => { const item = current[index]; if (item?.file) URL.revokeObjectURL(item.preview); return current.filter((_, itemIndex) => itemIndex !== index); });
  const upload = async (item: Item) => {
    if (item.assetId) return item.assetId;
    if (!item.file) throw new Error("素材未找到");
    const response = await fetch("/api/uploads/presign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.file.name, mimeType: item.file.type, byteSize: item.file.size }) });
    const presign = await response.json(); if (!response.ok) throw new Error(presign.message || "上传失败");
    if (!(await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": item.file.type }, body: item.file })).ok) throw new Error("上传失败");
    if (!(await fetch("/api/uploads/confirm/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) })).ok) throw new Error("素材校验失败");
    return presign.assetId as string;
  };
  const poll = async (taskId: string) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" }); const task = await response.json();
      if (!response.ok) throw new Error(task.message || "任务查询失败");
      if (task.status === "SUCCEEDED") { setResult(task); setPhase("succeeded"); return; }
      if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) throw new Error(task.errorCode || "视频生成失败，积分已退回");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("视频仍在生成中，请稍后在任务中心查看");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!reference || !products.length || phase !== "idle") return;
    setError(""); setResult(null); setPhase("uploading");
    try {
      const assetIds = [...await Promise.all(products.map(upload)), await upload(reference), ...(scene ? [await upload(scene)] : [])];
      const prompt = [`产品信息：${info.trim()}`, `视频特殊要求：${special.trim()}`, modelOn && modelInfo.trim() ? `自定义模特信息：${modelInfo.trim()}` : ""].filter((line) => !line.endsWith("：")).join("\n");
      const response = await fetch("/api/tasks/recreate-video/", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ assetIds, prompt, aspectRatio: ratio, duration: Number(duration), resolution, scene: "镜头节奏复刻", style: "自然带货" }) });
      const created = await response.json(); if (!response.ok) throw new Error(created.message || created.code || "创建任务失败");
      setPhase("generating"); await poll(created.taskId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "创建失败"); setPhase("failed"); }
  };
  const box = (kind: SourceKind, title: string, required: boolean, description: string, Icon: typeof Video) => {
    const item = kind === "video" ? reference : kind === "scene" ? scene : null;
    return <section className="recreate-source"><div className="ad-field-title">{title} {required && <em>*</em>}</div><div className="ad-source-tabs"><button type="button" className={tab !== kind ? "active" : ""} onClick={() => refs[kind].current?.click()}><Upload size={16} />本地上传</button><button type="button" className={tab === kind ? "active" : ""} onClick={() => openLibrary(kind)}><FolderOpen size={17} />资产库</button></div>{tab === kind ? <div className="recreate-library">{assets.length ? assets.map((asset) => <button type="button" key={asset.id} onClick={() => select(asset)}>{asset.mimeType === "video/mp4" ? <span className="recreate-library-media"><Video size={23} /></span> : <img src={asset.url} alt="" />}<small>{asset.originalName}</small></button>) : <p>暂无可用素材</p>}</div> : <button type="button" className="ad-dropzone recreate-drop" onClick={() => refs[kind].current?.click()}><span><Icon size={27} /></span><strong>{title}</strong><small>{description}</small><small>{kind === "product" ? `已上传 ${products.length}/5 个` : item ? "已选择 1 个" : "已上传 0/1 个"}</small><input ref={refs[kind]} type="file" accept={kind === "video" ? "video/mp4" : imageAccept} multiple={kind === "product"} onChange={(event) => choose(kind, event.target.files)} /></button>}</section>;
  };
  const busy = phase === "uploading" || phase === "generating";
  if (!account) return <main className="workspace-loading"><Sparkles /></main>;
  return <main className="recreate-studio"><header className="ad-studio-header"><button type="button" onClick={() => router.push("/create/product-video")}><ArrowLeft size={19} />返回视频创作</button></header><form className="recreate-card" onSubmit={submit}><div className="ad-studio-title"><Film size={22} /><strong>复刻爆款带货视频-新版</strong></div><div className="ad-studio-body">{box("video", "对标视频", true, "视频时长需在 3–20 秒之间", Video)}{box("product", "商品图", true, "上传商品图片，支持多张", ImagePlus)}{products.length > 0 && <div className="ad-selected-images">{products.map((product, index) => <article key={`${product.assetId || product.name}-${index}`}><img src={product.preview} alt="商品图片预览" /><button type="button" onClick={() => { removeProduct(index); resetTask(); }} aria-label="移除商品图"><X size={14} /></button><span>{index + 1}</span></article>)}</div>}<label className="recreate-toggle">自定义模特信息 <input type="checkbox" checked={modelOn} onChange={(event) => { setModelOn(event.target.checked); resetTask(); }} /><i /></label><p className="recreate-review"><ShieldCheck size={15} />真人模特内容将按平台规则进行审核</p>{modelOn && <label className="ad-form-field">模特信息（可选）<textarea value={modelInfo} onChange={(event) => setModelInfo(event.target.value)} maxLength={300} placeholder="例如：女性，25 岁，自然亲和，居家穿搭" /></label>}{box("scene", "场景图（选填）", false, "上传希望出现的商品场景", ImagePlus)}<label className="ad-form-field">产品信息（可选）<textarea value={info} onChange={(event) => setInfo(event.target.value)} maxLength={600} placeholder="例如：产品名称、核心卖点、材质、目标人群" /></label><label className="ad-form-field">视频特殊要求（可选）<textarea value={special} onChange={(event) => setSpecial(event.target.value)} maxLength={600} placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影" /></label><div className="ad-select-grid"><label>视频比例 <em>*</em><span className="ad-select"><select value={ratio} onChange={(event) => setRatio(event.target.value)}><option value="9:16">竖屏（9:16）</option><option value="16:9">横屏（16:9）</option></select><ChevronDown size={16} /></span></label><label>视频时长 <em>*</em><span className="ad-select"><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option></select><ChevronDown size={16} /></span></label><label>视频分辨率 <em>*</em><span className="ad-select"><select value={resolution} onChange={(event) => setResolution(event.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select><ChevronDown size={16} /></span></label></div><p className="ad-credit"><Sparkles size={16} />预计积分：{reference && products.length ? "40 积分" : "待填写：对标视频和商品图"}</p>{error && <p className="creator-error" role="alert">{error}</p>}{phase === "succeeded" && result?.outputs[0] && <div className="ad-result"><video src={result.outputs[0].url} controls playsInline /></div>}<div className="ad-actions"><button className="ad-generate" type="submit" disabled={!reference || !products.length || busy}>{busy ? <LoaderCircle size={18} /> : <Film size={18} />}{busy ? "任务处理中" : "生成复刻带货视频"}</button><button className="ad-reset" type="button" onClick={() => { setReference(null); setProducts([]); setScene(null); setInfo(""); setSpecial(""); setModelInfo(""); setModelOn(false); resetTask(); }}>重置</button></div></div></form></main>;
}
