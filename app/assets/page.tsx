"use client";

import { Boxes, Download, FileImage, LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type Asset = { id: string; kind: string; mimeType: string; byteSize: number; originalName: string; taskId: string | null; url: string; createdAt: string };
const kinds = [{ key: "ALL", label: "全部" }, { key: "INPUT", label: "上传素材" }, { key: "OUTPUT", label: "生成结果" }];
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function AssetsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState("ALL");
  const [query, setQuery] = useState("");
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
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
      const body = await response.json(); setAssets(body.assets || []); setTotalBytes(body.totalBytes || 0); setLoading(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [account, kind, query, router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="assets" account={account}>
    <div className="app-page-content">
      <section className="page-intro"><div><span className="page-kicker"><Boxes size={15} />创作素材</span><h1>内容资产</h1><p>管理上传素材和已生成内容，当前共使用 {formatBytes(totalBytes)}。</p></div><Link className="primary-command" href="/create/product-hero"><FileImage size={17} />上传并创作</Link></section>
      <section className="asset-toolbar"><div className="filter-tabs">{kinds.map((item) => <button key={item.key} className={kind === item.key ? "active" : ""} onClick={() => setKind(item.key)}>{item.label}</button>)}</div><label className="asset-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产名称" /></label><span>共 {assets.length} 项</span></section>
      {loading ? <div className="records-loading"><LoaderCircle size={22} />正在载入资产</div> : assets.length === 0 ? <div className="page-empty standalone"><span><Boxes size={27} /></span><strong>暂无匹配资产</strong><p>上传商品素材或完成生成后，内容会自动保存在这里。</p><Link href="/create/product-hero">开始创作</Link></div> : <section className="asset-grid">{assets.map((asset) => <article className="asset-card" key={asset.id}><a className="asset-media" href={asset.url} target="_blank" rel="noreferrer"><img src={asset.url} alt={asset.originalName} /><span>{asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</span></a><div className="asset-card-footer"><div><strong title={asset.originalName}>{asset.originalName}</strong><small>{formatBytes(asset.byteSize)} · {new Date(asset.createdAt).toLocaleDateString("zh-CN")}</small></div><a className="icon-button" aria-label="下载资产" href={asset.url} target="_blank" rel="noreferrer"><Download size={17} /></a></div>{asset.taskId && <Link className="asset-task-link" href={`/tasks/${asset.taskId}`}>查看来源任务</Link>}</article>)}</section>}
    </div>
  </AppShell>;
}
