"use client";

import { ImageIcon, Layers3, ScanSearch, Shirt, Sparkles, WandSparkles } from "lucide-react";
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
