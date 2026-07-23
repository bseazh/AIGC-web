"use client";

import { Clapperboard, Film, Layers3, Repeat2, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };

const groups = [
  { title: "带货视频生成", caption: "PRODUCT VIDEO", items: [
    { title: "产品广告大片", text: "一张商品图出发，自动组织卖点、细节与收束镜头。", href: "/create/product-ad-video", icon: Clapperboard, tone: "blue" },
    { title: "复刻带货视频", text: "参考镜头节奏与运镜，生成原创商品内容。", href: "/create/recreate-video", icon: Repeat2, tone: "violet" },
    { title: "智能混剪", text: "至少两段已授权视频，保留原音频合成为长视频。", href: "/create/video-mix", icon: Layers3, tone: "cyan" },
  ] },
  { title: "Seedance2 视频", caption: "ADVANCED CREATION", items: [
    { title: "Seedance2 视频", text: "组合图片、视频、音频和自由脚本，完成高级视频创作。", href: "/create/seedance-video", icon: Film, tone: "cyan" },
  ] },
];

export function VideoCenterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="tools" account={account}><div className="app-page-content video-center"><section className="video-center-hero"><div><span className="page-kicker"><Video size={15} />视频创作中心</span><h1>让内容资产，变成可投放的视频</h1><p>直接引用已生成的图片、已上传的视频和音频，使用经过验证的 Seedance2 生成固定 15 秒成片。</p></div><div className="video-center-stat"><Sparkles size={20} /><strong>15 秒</strong><span>原生生成</span></div></section>{groups.map((group) => <section className="video-center-group" key={group.title}><div className="video-center-heading"><div><span>{group.caption}</span><h2>{group.title}</h2></div><p>{group.items.length} 个创作模板</p></div><div className="video-template-grid">{group.items.map((item) => { const Icon = item.icon; return <Link className="video-template-card" href={item.href} key={item.title}><span className={`video-template-icon ${item.tone}`}><Icon size={25} /></span><div><strong>{item.title}</strong><p>{item.text}</p></div><span className="video-template-action">立即开始 <Layers3 size={14} /></span></Link>; })}</div></section>)}</div></AppShell>;
}
