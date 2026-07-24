"use client";

import { AudioLines, Boxes, Download, FileImage, FileVideo, LoaderCircle, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type Asset = { id: string; kind: string; mimeType: string; byteSize: number; originalName: string; taskId: string | null; url: string; createdAt: string };
const kinds = [{ key: "ALL", label: "全部" }, { key: "INPUT", label: "上传素材" }, { key: "OUTPUT", label: "生成结果" }];
const mediaFilters = [{ key: "ALL", label: "全部类型" }, { key: "IMAGE", label: "图片" }, { key: "VIDEO", label: "视频" }, { key: "AUDIO", label: "音频" }];
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

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
  if (!account) return <LoadingScreen />;
  const refresh = async () => {
    const response = await fetch(`/api/assets/?kind=${kind}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const body = await response.json(); setAssets(body.assets || []); setTotalBytes(body.totalBytes || 0); setQuotaBytes(body.storage?.quotaBytes || quotaBytes);
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const presign = await fetch("/api/uploads/presign/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }) });
      const signed = await presign.json(); if (!presign.ok) throw new Error(signed.message || "无法上传该文件");
      const put = await fetch(signed.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } }); if (!put.ok) throw new Error("文件上传失败");
      const confirm = await fetch("/api/uploads/confirm/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: signed.assetId }) }); const confirmed = await confirm.json(); if (!confirm.ok) throw new Error(confirmed.message || "文件校验失败");
      if (confirmed.status === "PENDING_REVIEW") window.alert("素材已提交审核，通过后会显示在内容资产中。");
      await refresh();
    } catch (error) { window.alert(error instanceof Error ? error.message : "上传失败"); } finally { setUploading(false); }
  };
  const remove = async (asset: Asset) => {
    if (!window.confirm(`确认删除“${asset.originalName}”？`)) return;
    const response = await fetch("/api/assets/", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: asset.id }) });
    if (!response.ok) return window.alert("删除失败，请重试");
    setAssets((items) => items.filter((item) => item.id !== asset.id)); setTotalBytes((bytes) => Math.max(0, bytes - asset.byteSize));
  };
  const filteredAssets = assets.filter((asset) => mediaType === "ALL" || mediaType === "IMAGE" && asset.mimeType.startsWith("image/") || mediaType === "VIDEO" && asset.mimeType.startsWith("video/") || mediaType === "AUDIO" && asset.mimeType.startsWith("audio/"));
  const imageAssets = filteredAssets.filter((asset) => asset.mimeType.startsWith("image/"));
  const mediaAssets = filteredAssets.filter((asset) => asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("audio/"));
  const assetCard = (asset: Asset) => <article className="asset-card" key={asset.id}><a className="asset-media" href={asset.url} target="_blank" rel="noreferrer">{asset.mimeType.startsWith("video/") ? <video src={asset.url} muted preload="metadata" /> : asset.mimeType.startsWith("audio/") ? <span className="asset-file-icon"><AudioLines size={35} /></span> : <img src={asset.url} alt={asset.originalName} />}<span>{asset.mimeType.startsWith("video/") ? <FileVideo size={13} /> : asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</span></a><div className="asset-card-footer"><div><strong title={asset.originalName}>{asset.originalName}</strong><small>{formatBytes(asset.byteSize)} · {new Date(asset.createdAt).toLocaleDateString("zh-CN")}</small></div><a className="icon-button" aria-label="下载资产" href={`/api/assets/${asset.id}/download/`}><Download size={17} /></a><button className="icon-button danger" aria-label="删除资产" onClick={() => remove(asset)}><Trash2 size={16} /></button></div>{asset.mimeType.startsWith("image/") && <div className="asset-continue"><Link href={`/create/product-hero?assetId=${asset.id}`}>生成主图</Link><Link href={`/create/scene-image?assetId=${asset.id}`}>生成场景</Link><Link href={`/create/product-detail?assetId=${asset.id}`}>生成详情</Link></div>}{asset.mimeType.startsWith("video/") && <div className="asset-continue"><Link href="/create/recreate-video">用于视频复刻</Link></div>}{asset.taskId && <Link className="asset-task-link" href={`/tasks/${asset.taskId}`}>查看来源任务</Link>}</article>;
  return <AppShell active="assets" account={account}>
    <div className="app-page-content">
      <section className="page-intro"><div><span className="page-kicker"><Boxes size={15} />创作素材</span><h1>内容资产</h1><p>已使用 {formatBytes(totalBytes)} / {formatBytes(quotaBytes)} 免费存储空间。</p></div><label className="primary-command upload-command"><Upload size={17} />{uploading ? "上传中" : "上传素材"}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg,audio/mp3,audio/wav" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.currentTarget.value = ""; }} /></label></section>
      <section className="asset-toolbar"><div className="filter-tabs">{kinds.map((item) => <button key={item.key} className={kind === item.key ? "active" : ""} onClick={() => setKind(item.key)}>{item.label}</button>)}</div><div className="filter-tabs asset-type-tabs">{mediaFilters.map((item) => <button key={item.key} className={mediaType === item.key ? "active" : ""} onClick={() => setMediaType(item.key)}>{item.label}</button>)}</div><label className="asset-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产名称" /></label><span>共 {filteredAssets.length} 项</span></section>
      {loading ? <div className="records-loading"><LoaderCircle size={22} />正在载入资产</div> : filteredAssets.length === 0 ? <div className="page-empty standalone"><span><Boxes size={27} /></span><strong>暂无匹配资产</strong><p>上传商品素材或完成生成后，内容会自动保存在这里。</p><Link href="/create/product-hero">开始创作</Link></div> : <div className="asset-sections"><section className="asset-section"><div className="asset-section-title"><div><span>IMAGE ASSETS</span><h2>图片素材</h2></div><p>{imageAssets.length} 项</p></div>{imageAssets.length ? <div className="asset-grid">{imageAssets.map(assetCard)}</div> : <div className="asset-section-empty">暂无图片素材</div>}</section><div className="asset-section-divider" /><section className="asset-section"><div className="asset-section-title"><div><span>VIDEO &amp; AUDIO</span><h2>视频与音频素材</h2></div><p>{mediaAssets.length} 项</p></div>{mediaAssets.length ? <div className="asset-grid">{mediaAssets.map(assetCard)}</div> : <div className="asset-section-empty">暂无视频或音频素材</div>}</section></div>}
    </div>
  </AppShell>;
}
