"use client";

export const dynamic = "force-dynamic";

import {
  ArrowRight,
  Crop,
  ImageIcon,
  Layers3,
  Package,
  ScanSearch,
  Shirt,
  Sparkles,
  Video,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { projectGateHref, type ProjectWorkflowKey } from "@/lib/project-workflows";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };

type ToolCard = {
  title: string;
  category: string;
  description: string;
  workflowKey?: ProjectWorkflowKey;
  href?: string;
  icon: typeof ImageIcon;
  tone: "blue" | "violet" | "cyan" | "rose" | "orange" | "green";
  cover?: string;
  badge?: string;
  disabled?: boolean;
};

type ToolSection = {
  title: string;
  tools: ToolCard[];
};

const imageSections: ToolSection[] = [
  {
    title: "AI创意生图",
    tools: [
      {
        title: "AI生图",
        category: "文字/参考图生成",
        description: "输入提示词或参考案例，一键生成高质感电商创意图。",
        workflowKey: "image-generate",
        icon: Sparkles,
        tone: "blue",
        cover: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=88",
        badge: "Banana2 / Image2",
      },
      {
        title: "生成产品场景图",
        category: "商品场景生成",
        description: "上传商品图并填写卖点，生成室内、户外、棚拍等营销场景。",
        workflowKey: "scene-image",
        icon: WandSparkles,
        tone: "violet",
        cover: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=88",
        badge: "HOT",
      },
    ],
  },
  {
    title: "AI带货模特",
    tools: [
      {
        title: "创作专属带货模特",
        category: "模特资产",
        description: "沉淀可复用的带货模特形象，后续接入穿搭与口播流程。",
        workflowKey: "model-wear",
        icon: Shirt,
        tone: "cyan",
        cover: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=88",
        badge: "VIP",
      },
      {
        title: "模特穿搭图",
        category: "服饰上身",
        description: "用模特图和商品图生成自然上身展示，适合服饰主图。",
        workflowKey: "model-wear",
        icon: Shirt,
        tone: "rose",
        cover: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=88",
      },
    ],
  },
  {
    title: "电商商品图制作",
    tools: [
      {
        title: "商品主图+详情页",
        category: "套图生成",
        description: "先生成商品主图，再衔接详情页素材，统一视觉表达。",
        workflowKey: "product-hero-image",
        icon: Package,
        tone: "orange",
        cover: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=88",
        badge: "组合流程",
      },
      {
        title: "商品详情页（百货）",
        category: "详情页生成",
        description: "围绕商品卖点生成统一风格的详情页视觉内容。",
        workflowKey: "product-detail-page",
        icon: Layers3,
        tone: "green",
        cover: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=88",
      },
      {
        title: "复制详情页",
        category: "参考复刻",
        description: "参考竞品详情页节奏与版式，生成原创商品详情页。",
        workflowKey: "recreate-detail-page",
        icon: Layers3,
        tone: "violet",
        cover: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=88",
      },
      {
        title: "复制主图",
        category: "主图复刻",
        description: "提取参考图的构图方向，重新生成原创商品主图。",
        workflowKey: "recreate-product-hero",
        icon: WandSparkles,
        tone: "blue",
        cover: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=88",
      },
    ],
  },
  {
    title: "图片处理",
    tools: [
      {
        title: "调整图片比例",
        category: "智能扩图",
        description: "扩展画面比例并保持商品主体稳定，适配常用平台尺寸。",
        workflowKey: "resize-image",
        icon: Crop,
        tone: "cyan",
        cover: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=88",
      },
      {
        title: "白底图生成",
        category: "电商白底",
        description: "自动保留商品主体，生成干净的白底展示图。",
        workflowKey: "white-background",
        icon: ImageIcon,
        tone: "green",
        cover: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=88",
      },
    ],
  },
  {
    title: "图片处理与优化",
    tools: [
      {
        title: "商品图高清优化",
        category: "清晰度增强",
        description: "修复商品细节、提升清晰度，适配店铺与投放素材。",
        workflowKey: "hd-enhance",
        icon: ScanSearch,
        tone: "blue",
        cover: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=900&q=88",
      },
    ],
  },
  {
    title: "图片生成",
    tools: [
      {
        title: "批量替换",
        category: "批量生产",
        description: "批量替换商品或模特素材，适合多 SKU 批量出图场景。",
        icon: WandSparkles,
        tone: "violet",
        cover: "https://images.unsplash.com/photo-1526178613552-2b45c6c302f0?auto=format&fit=crop&w=900&q=88",
        badge: "即将上线",
        disabled: true,
      },
    ],
  },
];

const videoTools: ToolCard[] = [
  {
    title: "视频创作中心",
    category: "带货视频",
    description: "产品广告大片、复刻带货、Seedance2 视频创作集中入口。",
    href: "/create/product-video",
    icon: Video,
    tone: "violet",
    cover: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=88",
  },
];

function hrefForTool(tool: ToolCard) {
  if (tool.workflowKey) return projectGateHref(tool.workflowKey);
  return tool.href || "/tools";
}

function ToolTile({ tool }: { tool: ToolCard }) {
  const Icon = tool.icon;
  const visual = (
    <div className={`yh-tools-card-visual ${tool.tone}${tool.cover ? " has-cover" : ""}`}>
      {tool.cover && <img className="yh-tools-card-cover" src={tool.cover} alt="" />}
      <div className="yh-tools-visual-glow" />
      <div className="yh-tools-visual-copy">
        <span>{tool.category}</span>
        <strong>{tool.title}</strong>
      </div>
      {!tool.cover && <div className="yh-tools-mockup-grid" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>}
      <span className="yh-tools-visual-icon"><Icon size={24} /></span>
    </div>
  );
  const info = (
    <div className="yh-tools-card-info">
      <div>
        <span className="yh-tools-card-kicker">{tool.category}</span>
        {tool.badge && <em>{tool.badge}</em>}
      </div>
      <h3>{tool.title}</h3>
      <p>{tool.description}</p>
      <span className="yh-tools-card-action">
        {tool.disabled ? "敬请期待" : "立即开始"}
        {!tool.disabled && <ArrowRight size={14} />}
      </span>
    </div>
  );

  return tool.disabled ? (
    <article className="yh-tools-card disabled">
      {visual}
      {info}
    </article>
  ) : (
    <Link href={hrefForTool(tool)} className="yh-tools-card">
      {visual}
      {info}
    </Link>
  );
}

export default function ToolsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unauthorized");
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  if (!account) return <LoadingScreen />;

  const imageToolCount = imageSections.reduce((total, section) => total + section.tools.length, 0);

  return (
    <AppShell active="tools" account={account}>
      <div className="app-page-content yh-tools-page">
        <section className="yh-tools-hero">
          <div>
            <span><Sparkles size={15} />图片创作中心</span>
            <h1>AI 图片创作</h1>
            <p>按目标站的图片创作模块重组入口，先选择项目，再进入对应工具沉淀素材和任务。</p>
          </div>
          <nav aria-label="创作类型">
            <a className="active" href="#image-tools">图片</a>
            <Link href="/create/product-video">视频</Link>
          </nav>
        </section>

        <section id="image-tools" className="yh-tools-shell">
          <header className="yh-tools-shell-head">
            <div>
              <span>IMAGE GENERATION</span>
              <h2>图片创作</h2>
            </div>
            <p>{imageToolCount} 个图片工具</p>
          </header>

          <div className="yh-tools-section-list">
            {imageSections.map((section) => (
              <section className="yh-tools-section" key={section.title}>
                <h2>{section.title}</h2>
                <div className="yh-tools-grid">
                  {section.tools.map((tool) => <ToolTile tool={tool} key={tool.title} />)}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="yh-tools-video-strip" aria-label="视频创作">
          <header>
            <span>VIDEO CREATION</span>
            <h2>视频创作</h2>
          </header>
          <div className="yh-tools-grid">
            {videoTools.map((tool) => <ToolTile tool={tool} key={tool.title} />)}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
