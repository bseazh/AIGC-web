"use client";

export const dynamic = "force-dynamic";

import { AudioLines, Boxes, ChevronLeft, ChevronRight, Download, FileVideo, LoaderCircle, Search, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { projectGateHref } from "@/lib/project-workflows";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type Asset = { id: string; kind: string; mimeType: string; byteSize: number; originalName: string; taskId: string | null; url: string; createdAt: string };
const kinds = [{ key: "ALL", label: "全部" }, { key: "INPUT", label: "上传素材" }, { key: "OUTPUT", label: "已保存结果" }];
const mediaFilters = [{ key: "ALL", label: "全部" }, { key: "IMAGE", label: "图片" }, { key: "VIDEO", label: "视频" }, { key: "AUDIO", label: "音频" }, { key: "OTHER", label: "其他" }];
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const matchesMediaType = (asset: Asset, mediaType: string) => mediaType === "ALL" || mediaType === "IMAGE" && asset.mimeType.startsWith("image/") || mediaType === "VIDEO" && asset.mimeType.startsWith("video/") || mediaType === "AUDIO" && asset.mimeType.startsWith("audio/");
const sha256Hex = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function AssetsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState("ALL");
  const [mediaType, setMediaType] = useState("ALL");
  const [query, setQuery] = useState("");
  const [totalBytes, setTotalBytes] = useState(0);
  const [quotaBytes, setQuotaBytes] = useState(1024 * 1024 * 1024);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(); setAccount(await response.json());
    }).catch(() => router.replace("/"));
  }, [router]);
  useEffect(() => {
    if (!account) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const response = await fetch(`/api/assets/?kind=${kind}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (response.status === 401) return router.replace("/");
      const body = await response.json(); setAssets(body.assets || []); setTotalBytes(body.totalBytes || 0); setQuotaBytes(body.storage?.quotaBytes || quotaBytes); setLoading(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [account, kind, query, router]);
  useEffect(() => {
    if (!previewAsset) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAsset(null);
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const visible = assets.filter((asset) => matchesMediaType(asset, mediaType));
      const currentIndex = visible.findIndex((asset) => asset.id === previewAsset.id);
      if (currentIndex < 0 || visible.length < 2) return;
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      setPreviewAsset(visible[(currentIndex + offset + visible.length) % visible.length]);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [assets, mediaType, previewAsset]);
  const refresh = async () => {
    const response = await fetch(`/api/assets/?kind=${kind}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const body = await response.json(); setAssets(body.assets || []); setTotalBytes(body.totalBytes || 0); setQuotaBytes(body.storage?.quotaBytes || quotaBytes);
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const contentHash = await sha256Hex(file);
      const presign = await fetch("/api/uploads/presign/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size, contentHash }) });
      const signed = await presign.json(); if (!presign.ok) throw new Error(signed.message || "无法上传该文件");
      if (signed.duplicate) {
        await refresh();
        return;
      }
      const put = await fetch(signed.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }); if (!put.ok) throw new Error("文件上传失败");
      const confirm = await fetch("/api/uploads/confirm/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: signed.assetId, contentHash }) }); const confirmed = await confirm.json(); if (!confirm.ok) throw new Error(confirmed.message || "文件校验失败");
      if (confirmed.status === "PENDING_REVIEW") window.alert("素材已提交审核，通过后会显示在内容资产中。");
      await refresh();
    } catch (error) { window.alert(error instanceof Error ? error.message : "上传失败"); } finally { setUploading(false); }
  };
  const remove = async (asset: Asset) => {
    if (!window.confirm(`确认删除“${asset.originalName}”？`)) return;
    const response = await fetch("/api/assets/", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: asset.id }) });
    if (!response.ok) return window.alert("删除失败，请重试");
    if (previewAsset?.id === asset.id) setPreviewAsset(null);
    setAssets((items) => items.filter((item) => item.id !== asset.id)); setTotalBytes((bytes) => Math.max(0, bytes - asset.byteSize));
  };
  const filteredAssets = assets.filter((asset) => mediaType === "OTHER" ? !asset.mimeType.startsWith("image/") && !asset.mimeType.startsWith("video/") && !asset.mimeType.startsWith("audio/") : matchesMediaType(asset, mediaType));
  const uploadedAssets = filteredAssets.filter((asset) => asset.kind === "INPUT");
  const generatedAssets = filteredAssets.filter((asset) => asset.kind === "OUTPUT");
  const sections = kind === "INPUT"
    ? [{ key: "INPUT", kicker: "UPLOADED", title: "上传素材", assets: uploadedAssets }]
    : kind === "OUTPUT"
      ? [{ key: "OUTPUT", kicker: "SAVED OUTPUTS", title: "已保存结果", assets: generatedAssets }]
      : [
          { key: "INPUT", kicker: "UPLOADED", title: "上传素材", assets: uploadedAssets },
          { key: "OUTPUT", kicker: "SAVED OUTPUTS", title: "已保存结果", assets: generatedAssets },
        ];
  const previewIndex = previewAsset ? filteredAssets.findIndex((asset) => asset.id === previewAsset.id) : -1;
  const movePreview = (offset: number) => {
    if (previewIndex < 0 || filteredAssets.length < 2) return;
    setPreviewAsset(filteredAssets[(previewIndex + offset + filteredAssets.length) % filteredAssets.length]);
  };
  const assetCard = (asset: Asset) => <article className="asset-card" key={asset.id}><button className="asset-media" type="button" aria-label={`预览${asset.originalName}`} onClick={() => setPreviewAsset(asset)}>{asset.mimeType.startsWith("video/") ? <video src={asset.url} muted preload="metadata" /> : asset.mimeType.startsWith("audio/") ? <span className="asset-file-icon"><AudioLines size={35} /></span> : <img src={asset.url} alt={asset.originalName} />}<span className="asset-kind-badge">{asset.mimeType.startsWith("video/") ? <><FileVideo size={13} />视频</> : asset.mimeType.startsWith("audio/") ? "音频" : asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</span></button><div className="asset-card-footer"><div><strong title={asset.originalName}>{asset.originalName}</strong><small>{formatBytes(asset.byteSize)} · {new Date(asset.createdAt).toLocaleDateString("zh-CN")}</small></div><a className="icon-button" aria-label="下载资产" title="下载" href={`/api/assets/${asset.id}/download/`}><Download size={17} /></a><button className="icon-button danger" type="button" aria-label="删除资产" title="删除" onClick={() => remove(asset)}><Trash2 size={16} /></button></div>{asset.mimeType.startsWith("image/") && <div className="asset-continue"><Link href={projectGateHref("product-hero-image", `/create/product-hero?assetId=${asset.id}`)}>生成主图</Link><Link href={projectGateHref("scene-image", `/create/scene-image?assetId=${asset.id}`)}>生成场景</Link><Link href={projectGateHref("product-detail-page", `/create/product-detail?assetId=${asset.id}`)}>生成详情</Link></div>}{asset.mimeType.startsWith("video/") && <div className="asset-continue"><Link href={projectGateHref("recreate-video", `/create/recreate-video?assetId=${asset.id}`)}>用于视频复刻</Link></div>}{asset.taskId && <Link className="asset-task-link" href={`/tasks/${asset.taskId}`}>查看来源任务</Link>}</article>;
  if (!account) return <LoadingScreen />;
  return <AppShell active="assets" account={account}>
    <div className="app-page-content asset-library-page">
      <section className="asset-library-head">
        <div>
          <span><Boxes size={15} />我的资产</span>
          <h1>管理您的图片、视频、音频素材</h1>
        </div>
        <div className="asset-quota"><i style={{ width: `${Math.min(100, totalBytes / quotaBytes * 100)}%` }} />{formatBytes(totalBytes)} / {formatBytes(quotaBytes)}</div>
        <label className="primary-command upload-command"><Upload size={17} />{uploading ? "上传中" : "上传资产"}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/mp3,audio/wav" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.currentTarget.value = ""; }} /></label>
      </section>
      <section className="asset-toolbar asset-library-toolbar"><div className="filter-tabs">{kinds.map((item) => <button key={item.key} className={kind === item.key ? "active" : ""} onClick={() => { setKind(item.key); setPreviewAsset(null); }}>{item.label}</button>)}</div><div className="filter-tabs asset-type-tabs">{mediaFilters.map((item) => <button key={item.key} className={mediaType === item.key ? "active" : ""} onClick={() => { setMediaType(item.key); setPreviewAsset(null); }}>{item.label}</button>)}</div><label className="asset-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPreviewAsset(null); }} placeholder="搜索资产名称..." /></label></section>
      <p className="asset-library-count">共 {filteredAssets.length} 项资产</p>
      {loading ? <div className="records-loading"><LoaderCircle size={22} />正在载入资产</div> : filteredAssets.length === 0 ? <div className="asset-library-empty"><span><Boxes size={46} /></span><strong>暂无资产</strong><p>点击上方「上传资产」按钮添加素材；任务结果需要手动加入素材库后才会长期保存。</p></div> : <div className="asset-sections">{sections.map((section) => <section className="asset-section" key={section.key}><div className="asset-section-title"><div><span>{section.kicker}</span><h2>{section.title}</h2></div><p>{section.assets.length} 项</p></div>{section.assets.length ? <div className="asset-grid">{section.assets.map(assetCard)}</div> : <div className="asset-section-empty">暂无{section.title}</div>}</section>)}</div>}
    </div>
    {previewAsset && <div className="asset-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreviewAsset(null)}><section className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={`预览${previewAsset.originalName}`}><button className="asset-preview-close" type="button" aria-label="关闭预览" title="关闭" onClick={() => setPreviewAsset(null)}><X size={21} /></button><div className="asset-preview-stage">{previewAsset.mimeType.startsWith("video/") ? <video key={previewAsset.id} src={previewAsset.url} controls autoPlay playsInline /> : previewAsset.mimeType.startsWith("audio/") ? <div className="asset-preview-audio"><AudioLines size={52} /><strong>{previewAsset.originalName}</strong><audio key={previewAsset.id} src={previewAsset.url} controls autoPlay /></div> : <img src={previewAsset.url} alt={previewAsset.originalName} />}</div>{filteredAssets.length > 1 && <><button className="asset-preview-nav previous" type="button" aria-label="上一个" title="上一个" onClick={() => movePreview(-1)}><ChevronLeft size={24} /></button><button className="asset-preview-nav next" type="button" aria-label="下一个" title="下一个" onClick={() => movePreview(1)}><ChevronRight size={24} /></button></>}<footer><div><strong>{previewAsset.originalName}</strong><small>{previewAsset.kind === "OUTPUT" ? "生成结果" : "上传素材"} · {formatBytes(previewAsset.byteSize)} · {new Date(previewAsset.createdAt).toLocaleString("zh-CN")}</small></div><a href={`/api/assets/${previewAsset.id}/download/`}><Download size={17} />下载</a></footer></section></div>}
  </AppShell>;
}
