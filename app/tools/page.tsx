"use client";

import { Crop, ImageIcon, Layers3, ScanSearch, Shirt, Sparkles, Video, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
const tools = [
  { name: "商品主图", group: "电商商品图", description: "上传商品素材，生成四张适配店铺首屏的商业主图。", href: "/create/product-hero", icon: ImageIcon, color: "blue", ready: true },
  { name: "场景图生成", group: "AI 创意生图", description: "将商品自然融入居家、户外、精品店等营销场景。", href: "/create/scene-image", icon: WandSparkles, color: "cyan", ready: true },
  { name: "模特穿搭", group: "AI 带货模特", description: "模特图加商品图，生成自然上身展示效果。", href: "/create/model-wear", icon: Shirt, color: "violet", ready: true },
  { name: "商品详情页", group: "电商商品图", description: "围绕卖点组织四张统一风格的详情页视觉。", href: "/create/product-detail", icon: Layers3, color: "orange", ready: true },
  { name: "高清优化", group: "图片处理", description: "修复细节、放大分辨率并提升商品展示质感。", href: "/create/hd-enhance", icon: ScanSearch, color: "blue", ready: true },
  { name: "白底图生成", group: "图片处理", description: "自动保留商品主体，生成干净的电商白底图。", href: "/create/white-background", icon: ImageIcon, color: "cyan", ready: true },
  { name: "图片比例调整", group: "图片处理", description: "智能扩图适配常用电商比例，保持主体不变形。", href: "/create/resize-image", icon: Crop, color: "blue", ready: true },
  { name: "复刻商品主图", group: "电商商品图", description: "提取参考图构图方向，生成原创商品主图。", href: "/create/recreate-product-hero", icon: WandSparkles, color: "violet", ready: true },
  { name: "复刻商详页", group: "电商商品图", description: "参考卖点结构和节奏，生成原创详情页套图。", href: "/create/recreate-detail-page", icon: Layers3, color: "orange", ready: true },
  { name: "视频创作中心", group: "AI 视频", description: "产品广告大片、复刻带货与 Seedance2 高级视频创作。", href: "/create/product-video", icon: Video, color: "violet", ready: true },
];

export default function ToolsPage() {
  const router = useRouter(); const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error(); setAccount(await r.json()); }).catch(() => router.replace("/")); }, [router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="tools" account={account}>
    <div className="app-page-content"><section className="page-intro"><div><span className="page-kicker"><Sparkles size={15} />创作能力</span><h1>创作工具</h1><p>每个已开放的工具都接入任务、资产和积分结算。</p></div></section>
      <section className="catalog-grid">{tools.map((tool) => { const Icon = tool.icon; const content = <><span className={`tool-icon ${tool.color}`}><Icon size={24} /></span><span className="catalog-copy"><small>{tool.group}</small><strong>{tool.name}{!tool.ready && <em>即将上线</em>}</strong><p>{tool.description}</p></span>{tool.ready && <span className="catalog-action">开始创作</span>}</>; return tool.ready ? <Link href={tool.href!} className="catalog-card" key={tool.name}>{content}</Link> : <article className="catalog-card disabled" key={tool.name}>{content}</article>; })}</section>
    </div>
  </AppShell>;
}
