"use client";

import { Clapperboard, Film, Layers3, MicVocal, Repeat2, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type VideoCenterTab = "recreate" | "commerce" | "spokesperson" | "advanced";
type VideoTemplate = { title: string; text: string; href: string; icon: typeof Repeat2; tone: string };
type VideoModule = { key: VideoCenterTab; title: string; caption: string; summary: string; items: VideoTemplate[] };

const modules: VideoModule[] = [
  { key: "recreate", title: "复刻视频", caption: "REFERENCE REPLICA", summary: "项目化管理对标视频、十二宫格、替换素材和生成任务。", items: [
    { title: "复刻带货视频", text: "参考镜头节奏、动作走势与运镜，替换商品或模特生成原创带货内容。", href: "/create/recreate-video", icon: Repeat2, tone: "violet" },
  ] },
  { key: "commerce", title: "带货视频", caption: "PRODUCT VIDEO", summary: "从商品素材生成广告片，或把多个视频片段做成混剪。", items: [
    { title: "产品广告大片", text: "一张商品图出发，自动组织卖点、细节与收束镜头。", href: "/create/product-ad-video", icon: Clapperboard, tone: "blue" },
    { title: "智能混剪", text: "至少两段已授权视频，保留原音频合成为长视频。", href: "/create/video-mix", icon: Layers3, tone: "cyan" },
  ] },
  { key: "spokesperson", title: "AI 模特口播", caption: "SPOKESPERSON VIDEO", summary: "先沉淀可编辑脚本，再衔接口播视频链路。", items: [
    { title: "模特口播文案", text: "先生成可编辑的分镜口播稿，后续直接衔接口型、配音与视频生成。", href: "/create/model-spokesperson-video", icon: MicVocal, tone: "violet" },
  ] },
  { key: "advanced", title: "高级创作", caption: "ADVANCED CREATION", summary: "组合多种输入素材，用自由脚本驱动 Seedance 视频生成。", items: [
    { title: "Seedance2 视频", text: "组合图片、视频、音频和自由脚本，完成高级视频创作。", href: "/create/seedance-video", icon: Film, tone: "cyan" },
  ] },
];

export function VideoCenterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [activeTab, setActiveTab] = useState<VideoCenterTab>("recreate");
  const activeModule = modules.find((module) => module.key === activeTab) || modules[0];
  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="tools" account={account}><div className="app-page-content video-center"><section className="video-center-hero"><div><span className="page-kicker"><Video size={15} />视频创作中心</span><h1>让内容资产，变成可投放的视频</h1><p>从口播文案、商品素材到视频片段，逐步完成可编辑、可复用的带货视频创作。</p></div><div className="video-center-stat"><Sparkles size={20} /><strong>文案 → 视频</strong><span>分阶段创作</span></div></section><nav className="video-center-tabs" aria-label="视频创作模块">{modules.map((module) => <button className={module.key === activeTab ? "active" : ""} key={module.key} type="button" onClick={() => setActiveTab(module.key)}><strong>{module.title}</strong><span>{module.items.length}</span></button>)}</nav><section className="video-center-group"><div className="video-center-heading"><div><span>{activeModule.caption}</span><h2>{activeModule.title}</h2><p>{activeModule.summary}</p></div><p>{activeModule.items.length} 个创作模板</p></div><div className="video-template-grid">{activeModule.items.map((item) => { const Icon = item.icon; return <Link className="video-template-card" href={item.href} key={item.title}><span className={`video-template-icon ${item.tone}`}><Icon size={25} /></span><div><strong>{item.title}</strong><p>{item.text}</p></div><span className="video-template-action">立即开始 <Layers3 size={14} /></span></Link>; })}</div></section></div></AppShell>;
}
