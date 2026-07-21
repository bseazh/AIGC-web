"use client";

import { ArrowLeft, Check, ChevronDown, Film, FolderOpen, ImagePlus, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

type Account = { wallet: { availablePoints: number } };
type SelectedImage = { preview: string; name: string; byteSize: number; file?: File; assetId?: string };
type Asset = { id: string; mimeType: string; byteSize: number; originalName: string; url: string; kind: string };
type Result = { taskId: string; status: string; outputs: Array<{ assetId: string; url: string }> };
const maxImages = 5;
const imageAccepts = "image/jpeg,image/png,image/webp";

export function ProductAdVideoPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [sourceTab, setSourceTab] = useState<"local" | "library">("local");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [productInfo, setProductInfo] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [executionMode, setExecutionMode] = useState("分段式执行");
  const [ratio, setRatio] = useState("9:16");
  const [imageRatio, setImageRatio] = useState("自动适配");
  const [duration, setDuration] = useState("15");
  const [resolution, setResolution] = useState("720p");
  const [phase, setPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);

  const resetTask = () => { setError(""); setResult(null); setPhase("idle"); };
  const addFiles = (files?: FileList | null) => {
    if (!files) return;
    const accepted: SelectedImage[] = [];
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("仅支持 JPG、PNG、WebP 图片"); continue; }
      if (file.size > 10 * 1024 * 1024) { setError("单张产品图片不能超过 10MB"); continue; }
      accepted.push({ file, preview: URL.createObjectURL(file), name: file.name, byteSize: file.size });
    }
    setImages((current) => {
      const available = maxImages - current.length;
      if (accepted.length > available) setError(`最多可添加 ${maxImages} 张产品图片`);
      return [...current, ...accepted.slice(0, Math.max(0, available))];
    });
    resetTask();
  };
  const openLibrary = async () => {
    setSourceTab("library"); setAssetsLoading(true);
    try { const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(); setAssets((body.assets || []).filter((asset: Asset) => asset.mimeType.startsWith("image/"))); } catch { setError("素材库加载失败，请稍后再试"); } finally { setAssetsLoading(false); }
  };
  const toggleAsset = (asset: Asset) => {
    const existing = images.find((item) => item.assetId === asset.id);
    if (existing) { setImages((current) => current.filter((item) => item.assetId !== asset.id)); resetTask(); return; }
    if (images.length >= maxImages) return setError(`最多可添加 ${maxImages} 张产品图片`);
    setImages((current) => [...current, { assetId: asset.id, preview: asset.url, name: asset.originalName, byteSize: asset.byteSize }]); resetTask();
  };
  const removeImage = (index: number) => setImages((current) => { const item = current[index]; if (item?.file) URL.revokeObjectURL(item.preview); resetTask(); return current.filter((_, itemIndex) => itemIndex !== index); });
  const upload = async (image: SelectedImage) => {
    if (image.assetId) return image.assetId;
    if (!image.file) throw new Error("产品图片未找到");
    const response = await fetch("/api/uploads/presign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: image.file.name, mimeType: image.file.type, byteSize: image.file.size }) });
    const presign = await response.json(); if (!response.ok) throw new Error(presign.message || "获取上传地址失败");
    const stored = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": image.file.type }, body: image.file }); if (!stored.ok) throw new Error("产品图片上传失败");
    const confirmed = await fetch("/api/uploads/confirm/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) });
    if (!confirmed.ok) throw new Error("产品图片校验失败"); return presign.assetId as string;
  };
  const poll = async (taskId: string) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" }); const task = await response.json();
      if (!response.ok) throw new Error(task.message || "任务查询失败"); setResult(task);
      if (task.status === "SUCCEEDED") { setPhase("succeeded"); return; }
      if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) throw new Error(task.errorCode || "视频生成失败，积分已退回");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("视频仍在生成中，请稍后在任务中心查看");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!images.length || ["uploading", "generating"].includes(phase)) return;
    setError(""); setPhase("uploading");
    try {
      const assetIds = await Promise.all(images.map(upload));
      const prompt = [`产品信息：${productInfo.trim()}`, `视频特殊要求：${specialRequirements.trim()}`, `执行方式：${executionMode}`, `图片比例：${imageRatio}`].filter((line) => !line.endsWith("：")).join("\n");
      const response = await fetch("/api/tasks/product-ad-video/", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ assetIds, prompt, aspectRatio: ratio, duration: Number(duration), resolution, scene: "产品广告大片", style: "商业广告" }) });
      const created = await response.json(); if (!response.ok) throw new Error(created.message || created.code || "创建任务失败");
      setPhase("generating"); await poll(created.taskId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败"); setPhase("failed"); }
  };
  const reset = () => { images.forEach((item) => { if (item.file) URL.revokeObjectURL(item.preview); }); setImages([]); setProductInfo(""); setSpecialRequirements(""); setExecutionMode("分段式执行"); setRatio("9:16"); setImageRatio("自动适配"); setDuration("15"); setResolution("720p"); resetTask(); };
  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  const busy = phase === "uploading" || phase === "generating";

  return <main className="ad-studio-shell"><header className="ad-studio-header"><button onClick={() => router.push("/create/product-video")}><ArrowLeft size={19} />返回视频创作</button></header><form className="ad-studio-card" onSubmit={submit}><div className="ad-studio-title"><Film size={22} /><strong>产品广告大片</strong></div><section className="ad-studio-body"><div className="ad-field-title">产品图片 <em>*</em></div><div className="ad-source-tabs"><button type="button" className={sourceTab === "local" ? "active" : ""} onClick={() => setSourceTab("local")}><Upload size={17} />本地上传</button><button type="button" className={sourceTab === "library" ? "active" : ""} onClick={openLibrary}><FolderOpen size={18} />资产库</button></div>{sourceTab === "local" ? <button type="button" className="ad-dropzone" onClick={() => inputRef.current?.click()}><span><Upload size={28} /></span><strong>产品图片</strong><small>支持上传多张产品图，帮助模型识别材质、细节与卖点</small><small>已上传 {images.length}/{maxImages} 个</small><input ref={inputRef} type="file" accept={imageAccepts} multiple onChange={(event) => addFiles(event.target.files)} /></button> : <div className="ad-library-panel">{assetsLoading ? <div><LoaderCircle size={22} />正在加载素材</div> : assets.length ? <div className="ad-library-grid">{assets.map((asset) => { const selected = images.some((item) => item.assetId === asset.id); return <button type="button" className={selected ? "selected" : ""} key={asset.id} onClick={() => toggleAsset(asset)}><img src={asset.url} alt="" /><span>{selected ? <Check size={15} /> : null}</span><small>{asset.originalName}</small></button>; })}</div> : <div className="ad-library-empty"><FolderOpen size={24} />暂无图片素材</div>}</div>}{images.length > 0 && <div className="ad-selected-images">{images.map((image, index) => <article key={`${image.assetId || image.name}-${index}`}><img src={image.preview} alt="产品图片预览" /><button type="button" onClick={() => removeImage(index)} aria-label="移除产品图片"><X size={14} /></button><span>{index + 1}</span></article>)}</div>}<label className="ad-form-field">产品信息（可选）<textarea value={productInfo} onChange={(event) => setProductInfo(event.target.value)} maxLength={600} placeholder="例如：产品名称、核心卖点、目标人群" /></label><label className="ad-form-field">视频特殊要求（可选）<textarea value={specialRequirements} onChange={(event) => setSpecialRequirements(event.target.value)} maxLength={600} placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影" /></label><div className="ad-select-grid"><label>执行方式 <em>*</em><span className="ad-select"><select value={executionMode} onChange={(event) => setExecutionMode(event.target.value)}><option>分段式执行</option></select><ChevronDown size={16} /></span></label><label>视频画面比例 <em>*</em><span className="ad-select"><select value={ratio} onChange={(event) => setRatio(event.target.value)}><option value="9:16">竖屏（9:16）</option><option value="16:9">横屏（16:9）</option></select><ChevronDown size={16} /></span></label><label>图片比例 <em>*</em><span className="ad-select"><select value={imageRatio} onChange={(event) => setImageRatio(event.target.value)}><option>自动适配</option><option>1:1</option><option>3:4</option><option>4:3</option><option>9:16</option></select><ChevronDown size={16} /></span></label><label>视频时长 <em>*</em><span className="ad-select"><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option></select><ChevronDown size={16} /></span></label><label>视频模型 <em>*</em><span className="ad-select"><select defaultValue="doubao-seedance-2"><option value="doubao-seedance-2">即梦 Seedance-2</option></select><ChevronDown size={16} /></span></label><label>视频分辨率 <em>*</em><span className="ad-select"><select value={resolution} onChange={(event) => setResolution(event.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select><ChevronDown size={16} /></span></label></div><p className="ad-credit"><Sparkles size={16} />预计积分：{images.length ? "40 积分" : "待填写：产品图片"}</p>{error && <p className="creator-error" role="alert">{error}</p>}{phase === "succeeded" && result?.outputs[0] && <div className="ad-result"><video src={result.outputs[0].url} controls playsInline /></div>}<div className="ad-actions"><button className="ad-generate" type="submit" disabled={!images.length || busy}>{busy ? <LoaderCircle size={18} /> : <Film size={18} />}{busy ? "任务处理中" : "生成产品广告大片"}</button><button className="ad-reset" type="button" onClick={reset}>重置</button></div></section></form></main>;
}
