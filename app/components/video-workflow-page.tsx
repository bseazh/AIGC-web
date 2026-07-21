"use client";

import { ArrowLeft, Check, Film, FolderOpen, LoaderCircle, Music2, Plus, Sparkles, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Account = { wallet: { availablePoints: number } };
type UploadSlot = "image1" | "image2" | "image3" | "image4" | "image5" | "video" | "audio";
type Uploaded = { preview: string; name: string; byteSize: number; file?: File; assetId?: string };
type Asset = { id: string; mimeType: string; byteSize: number; originalName: string; url: string; kind: string };
type Result = { taskId: string; status: string; outputs: Array<{ assetId: string; url: string }> };
type VideoTemplate = "ad" | "recreate" | "seedance";
type Props = { template?: VideoTemplate };
type Definition = { key: UploadSlot; label: string; hint: string; accepts: string; icon: typeof Plus; required?: boolean };

const imageAccepts = "image/jpeg,image/png,image/webp";
const imageKeys: UploadSlot[] = ["image1", "image2", "image3", "image4", "image5"];
const allDefinitions: Definition[] = [
  { key: "image1", label: "产品图片 1", hint: "必传 · JPG / PNG / WebP", accepts: imageAccepts, icon: Plus },
  { key: "image2", label: "产品图片 2", hint: "可选 · 补充细节", accepts: imageAccepts, icon: Plus },
  { key: "image3", label: "产品图片 3", hint: "可选 · 补充细节", accepts: imageAccepts, icon: Plus },
  { key: "image4", label: "产品图片 4", hint: "可选 · 补充细节", accepts: imageAccepts, icon: Plus },
  { key: "image5", label: "产品图片 5", hint: "可选 · 补充细节", accepts: imageAccepts, icon: Plus },
  { key: "video", label: "参考视频", hint: "必传 · MP4，最多 100MB", accepts: "video/mp4", icon: Film },
  { key: "audio", label: "参考音频", hint: "可选 · MP3 / WAV，最多 30MB", accepts: "audio/mpeg,audio/mp3,audio/wav", icon: Music2 },
];

const templateConfig = {
  ad: {
    title: "产品广告大片", subtitle: "产品图片驱动的商业广告短片", submitUrl: "/api/tasks/product-ad-video/", description: "上传产品图，由模型自动识别材质、细节与卖点，生成广告镜头。", keys: imageKeys, scenes: ["产品广告大片"], styles: ["商业广告"],
  },
  recreate: {
    title: "复刻带货视频", subtitle: "参考节奏，生成原创商品内容", submitUrl: "/api/tasks/recreate-video/", description: "仅提取运镜、景别和转场结构，不复制原内容。", keys: ["image1", "video", "audio"] as UploadSlot[], scenes: ["镜头节奏复刻", "商品展示复刻", "种草讲解复刻", "场景切换复刻"], styles: ["自然带货", "轻快节奏", "质感种草", "促销转化"],
  },
  seedance: {
    title: "Seedance2 视频", subtitle: "图、视频、音频自由组合的高级创作", submitUrl: "/api/tasks/video/", description: "完整参考素材与自由脚本控制。", keys: ["image1", "image2", "video", "audio"] as UploadSlot[], scenes: ["商品特写", "第一人称", "生活方式", "自由创作"], styles: ["轻快节奏", "质感广告", "真实记录", "电影感"],
  },
} as const;

const durations = [5, 10, 15];
const resolutions = ["480p", "720p", "1080p"];

export function VideoWorkflowPage({ template = "seedance" }: Props) {
  const router = useRouter();
  const config = templateConfig[template];
  const definitions = allDefinitions.filter((definition) => config.keys.includes(definition.key)).map((definition) => ({ ...definition, required: definition.key === "image1" || (template === "recreate" && definition.key === "video") }));
  const [account, setAccount] = useState<Account | null>(null);
  const [uploads, setUploads] = useState<Partial<Record<UploadSlot, Uploaded>>>({});
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(15);
  const [resolution, setResolution] = useState("720p");
  const [productInfo, setProductInfo] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [librarySlot, setLibrarySlot] = useState<UploadSlot | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);

  const choose = (key: UploadSlot, file?: File) => {
    if (!file) return;
    const definition = definitions.find((item) => item.key === key)!;
    if (!definition.accepts.split(",").includes(file.type)) return setError(`${definition.label}的文件格式不正确`);
    const max = key === "video" ? 100 : key === "audio" ? 30 : 10;
    if (file.size > max * 1024 * 1024) return setError(`${definition.label}不能超过 ${max}MB`);
    setUploads((current) => { if (current[key]?.file) URL.revokeObjectURL(current[key]!.preview); return { ...current, [key]: { file, preview: URL.createObjectURL(file), name: file.name, byteSize: file.size } }; });
    setError(""); setResult(null); setPhase("idle");
  };
  const openLibrary = async (slot: UploadSlot) => {
    setLibrarySlot(slot); setAssetsLoading(true);
    try { const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(); setAssets(body.assets || []); } catch { setError("素材库加载失败，请稍后再试"); } finally { setAssetsLoading(false); }
  };
  const selectAsset = (slot: UploadSlot, asset: Asset) => {
    setUploads((current) => ({ ...current, [slot]: { assetId: asset.id, preview: asset.url, name: asset.originalName, byteSize: asset.byteSize } }));
    setLibrarySlot(null); setError(""); setResult(null); setPhase("idle");
  };
  const upload = async (item: Uploaded) => {
    if (item.assetId) return item.assetId;
    if (!item.file) throw new Error("素材未找到");
    const response = await fetch("/api/uploads/presign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.file.name, mimeType: item.file.type, byteSize: item.file.size }) });
    const presign = await response.json(); if (!response.ok) throw new Error(presign.message || "获取上传地址失败");
    const stored = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": item.file.type }, body: item.file }); if (!stored.ok) throw new Error("素材上传失败");
    const confirmed = await fetch("/api/uploads/confirm/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: presign.assetId }) });
    if (!confirmed.ok) throw new Error("素材校验失败"); return presign.assetId as string;
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
    event.preventDefault(); if (phase === "uploading" || phase === "generating") return;
    setError(""); setPhase("uploading");
    try {
      const assetIds = await Promise.all(definitions.filter((definition) => uploads[definition.key]).map((definition) => upload(uploads[definition.key]!)));
      const promptValue = [`产品信息：${productInfo.trim()}`, `视频特殊要求：${specialRequirements.trim()}`].filter((item) => !item.endsWith("：")).join("\n");
      const response = await fetch(config.submitUrl, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ assetIds, prompt: promptValue, aspectRatio: ratio, duration, resolution, scene: config.scenes[0], style: config.styles[0] }) });
      const created = await response.json(); if (!response.ok) throw new Error(created.message || created.code || "创建任务失败");
      setPhase("generating"); await poll(created.taskId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败"); setPhase("failed"); }
  };
  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  const busy = phase === "uploading" || phase === "generating";
  const missingRequired = definitions.some((definition) => definition.required && !uploads[definition.key]);
  const compatibleAssets = librarySlot ? assets.filter((asset) => definitions.find((definition) => definition.key === librarySlot)!.accepts.split(",").includes(asset.mimeType)) : [];
  const imageCount = imageKeys.filter((key) => uploads[key]).length;

  const inputCard = (definition: Definition) => {
    const item = uploads[definition.key]; const Icon = definition.icon;
    return <label className={`video-upload-card ${item ? "has-file" : ""}`} key={definition.key}>{item && definition.key.startsWith("image") ? <img src={item.preview} alt={definition.label} /> : item ? <div className="file-preview"><Icon size={28} /><strong>{item.name}</strong><small>{Math.ceil(item.byteSize / 1024 / 1024)} MB</small></div> : <><span><Icon size={22} /></span><strong>{definition.label}{definition.required ? " *" : ""}</strong><small>{definition.hint}</small></>}<button type="button" className="asset-picker-button" onClick={(event) => { event.preventDefault(); openLibrary(definition.key); }}><FolderOpen size={14} />素材库</button>{item && <button type="button" aria-label={`移除${definition.label}`} onClick={(event) => { event.preventDefault(); if (item.file) URL.revokeObjectURL(item.preview); setUploads((current) => { const next = { ...current }; delete next[definition.key]; return next; }); }}><X size={15} /></button>}<input type="file" accept={definition.accepts} onChange={(event) => choose(definition.key, event.target.files?.[0])} /></label>;
  };

  return <main className="creator-shell video-creator-shell"><header className="creator-header"><button className="icon-button" aria-label="返回视频中心" onClick={() => router.push("/create/product-video")}><ArrowLeft size={19} /></button><div><strong>{config.title}</strong><span>{config.subtitle}</span></div><div className="creator-points"><Sparkles size={15} />{account.wallet.availablePoints} 积分</div></header>
    <form className="creator-layout video-creator-layout" onSubmit={submit}><section className="video-stage"><div className="video-stage-heading"><div><span>VIDEO STUDIO</span><h1>{config.title}</h1><p>{config.description} 可上传新素材，或直接引用内容资产。</p></div><div className="video-badge"><Film size={16} />Seedance 2.0</div></div>
      <div className="ad-video-inputs"><div className="ad-input-heading"><strong>{template === "ad" ? "产品图片" : "产品与参考素材"} <em>*</em></strong>{template === "ad" && <span>已添加 {imageCount}/5</span>}</div><div className={`video-upload-grid ${template === "ad" ? "ad-image-grid" : ""}`}>{definitions.map(inputCard)}</div><label className="ad-text-field">产品信息（可选）<textarea value={productInfo} onChange={(event) => setProductInfo(event.target.value)} maxLength={600} placeholder="例如：产品名称、核心卖点、材质、目标人群" /></label><label className="ad-text-field">视频特殊要求（可选）<textarea value={specialRequirements} onChange={(event) => setSpecialRequirements(event.target.value)} maxLength={600} placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影" /></label></div>
      {busy && <div className="generation-overlay"><LoaderCircle size={30} /><strong>{phase === "uploading" ? "正在上传参考素材" : "Seedance 正在合成视频"}</strong><span>通常需要数分钟，完成后将自动保存至内容资产</span></div>}{phase === "succeeded" && result?.outputs[0] && <div className="video-result"><video src={result.outputs[0].url} controls playsInline /><a href={result.outputs[0].url} target="_blank" rel="noreferrer">打开视频</a></div>}</section>
      <aside className="creator-panel"><div className="panel-title"><span><Film size={18} /></span><div><h1>生成参数</h1><p>{duration} 秒 · {resolution} · 消耗 40 积分</p></div></div><label className="field-label">视频画面比例</label><div className="ratio-control"><button type="button" className={ratio === "16:9" ? "active" : ""} onClick={() => setRatio("16:9")}>16:9 横版</button><button type="button" className={ratio === "9:16" ? "active" : ""} onClick={() => setRatio("9:16")}>9:16 竖版</button></div><label className="field-label">视频时长</label><div className="ratio-control three-options">{durations.map((item) => <button type="button" key={item} className={duration === item ? "active" : ""} onClick={() => setDuration(item)}>{item} 秒</button>)}</div><label className="field-label">视频分辨率</label><div className="ratio-control three-options">{resolutions.map((item) => <button type="button" key={item} className={resolution === item ? "active" : ""} onClick={() => setResolution(item)}>{item}</button>)}</div>{error && <p className="creator-error" role="alert">{error}</p>}{phase === "succeeded" && <p className="creator-success"><Check size={16} />视频已保存到内容资产</p>}<button className="generate-button" type="submit" disabled={missingRequired || busy || account.wallet.availablePoints < 40}><Upload size={18} />{busy ? "任务处理中" : missingRequired ? "请补充必传素材" : account.wallet.availablePoints < 40 ? "积分不足" : `生成${config.title}`}</button></aside></form>{librarySlot && <div className="asset-picker-backdrop" role="dialog" aria-modal="true" aria-label="选择素材"><section className="asset-picker-modal"><header><div><span>内容资产</span><h2>选择{definitions.find((definition) => definition.key === librarySlot)?.label}</h2></div><button type="button" className="icon-button" onClick={() => setLibrarySlot(null)}><X size={18} /></button></header>{assetsLoading ? <div className="asset-picker-empty"><LoaderCircle size={22} />正在加载素材</div> : compatibleAssets.length === 0 ? <div className="asset-picker-empty"><FolderOpen size={25} /><strong>暂无可用素材</strong><p>先在图片创作或上传后完成校验，素材会自动显示在这里。</p></div> : <div className="asset-picker-grid">{compatibleAssets.map((asset) => <button type="button" key={asset.id} onClick={() => selectAsset(librarySlot, asset)}>{asset.mimeType.startsWith("image/") ? <img src={asset.url} alt="" /> : <span><Film size={24} />{asset.mimeType.startsWith("audio/") ? "音频素材" : "视频素材"}</span>}<strong>{asset.originalName}</strong><small>{asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</small></button>)}</div>}</section></div>}</main>;
}
