"use client";

export const dynamic = "force-dynamic";

import { ArrowRight, Boxes, ChevronRight, ImageIcon, Layers3, PackageOpen, ScanSearch, Search, Shirt, Sparkles, Video, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { WorkflowIcon } from "@/app/components/workflow-icon";
import { projectGateHref, projectStartHref, projectWorkflows, type ProjectWorkflowKey } from "@/lib/project-workflows";

type WorkspaceTool = {
  name: string;
  note: string;
  icon: typeof ImageIcon;
  color: string;
  workflowKey?: ProjectWorkflowKey;
  href?: string;
  available: boolean;
};

const tools: WorkspaceTool[] = [
  { name: "AI生图", note: "提示词生成原创图片", icon: Sparkles, color: "blue", workflowKey: "image-generate", available: true },
  { name: "商品主图", note: "生成电商首屏视觉", icon: ImageIcon, color: "blue", workflowKey: "product-hero-image", available: true },
  { name: "模特穿搭", note: "服装自然上身展示", icon: Shirt, color: "violet", workflowKey: "model-wear", available: true },
  { name: "场景延展", note: "匹配营销使用场景", icon: WandSparkles, color: "cyan", workflowKey: "scene-image", available: true },
  { name: "高清优化", note: "修复细节并提升清晰度", icon: ScanSearch, color: "blue", workflowKey: "hd-enhance", available: true },
  { name: "详情页套图", note: "生成四张统一卖点视觉", icon: Layers3, color: "orange", workflowKey: "product-detail-page", available: true },
  { name: "视频创作中心", note: "广告大片、复刻与高级创作", icon: Video, color: "violet", href: "/create/product-video", available: true },
];

type Account = { user: { identifier: string; displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number; frozenPoints: number } };
type ProjectDraft = { id: string; title: string; workflowKey: ProjectWorkflowKey; updatedAt: string };
type Inspiration = { id: string; title: string; category: string; industry: string; description: string; image: string; href: string };

export default function Workspace() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [projects, setProjects] = useState<ProjectDraft[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [caseQuery, setCaseQuery] = useState(""); const [industry, setIndustry] = useState("全部");
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session/", { cache: "no-store" }),
      fetch("/api/workflow-drafts/?limit=5", { cache: "no-store" }),
      fetch("/api/tasks/list/?status=ACTIVE&limit=1", { cache: "no-store" }),
      fetch("/api/home/", { cache: "no-store" }),
    ]).then(async ([sessionResponse, projectsResponse, tasksResponse, homeResponse]) => {
      if (!sessionResponse.ok) throw new Error("unauthenticated");
      setAccount(await sessionResponse.json());
      if (projectsResponse.ok) { const body = await projectsResponse.json(); setProjects(body.drafts || []); }
      if (tasksResponse.ok) { const body = await tasksResponse.json(); setActiveCount(body.activeCount || 0); }
      if (homeResponse.ok) { const body = await homeResponse.json(); setInspirations(body.items || []); }
    }).catch(() => router.replace("/"));
  }, [router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="workspace" account={account} taskCount={activeCount}>
    <div className="workspace-content">
      <section className="welcome-row"><div><p>{account.user.identifier}</p><h1>今天想做什么？</h1></div><Link className="new-task" href={projectGateHref("image-generate")}><ImageIcon size={18} />新建项目</Link></section>
      <section className="tool-grid" aria-label="创作工具">{tools.map((tool) => { const Icon = tool.icon; const href = tool.href || (tool.workflowKey ? projectGateHref(tool.workflowKey) : "/tools"); return tool.available ? (
        <Link className="tool-card" key={tool.name} href={href}><span className={`tool-icon ${tool.color}`}><Icon size={22} /></span><span><strong>{tool.name}</strong><small>{tool.note}</small></span><ChevronRight size={18} /></Link>
      ) : <div className="tool-card coming-soon" key={tool.name}><span className={`tool-icon ${tool.color}`}><Icon size={22} /></span><span><strong>{tool.name}<em>即将上线</em></strong><small>{tool.note}</small></span></div>; })}</section>
      <section className="workspace-band"><div className="section-title"><div><h2>最近项目</h2><p>按创作项目查看进度、积分和最新结果</p></div><Link href="/tasks">查看全部<ChevronRight size={16} /></Link></div>
        {projects.length === 0 ? <div className="empty-tasks"><span><PackageOpen size={24} /></span><strong>暂无项目</strong><p>创建项目后，进度与结果会出现在这里。</p></div> : <div className="dashboard-task-list">{projects.map((project) => <Link className="dashboard-task project" href={projectStartHref(project.workflowKey, project.id)} key={project.id}><div className="record-thumb"><WorkflowIcon workflowKey={project.workflowKey} /></div><div><strong>{project.title}</strong><span>{new Date(project.updatedAt).toLocaleString("zh-CN")}</span></div><span>项目</span><span>{projectWorkflows[project.workflowKey]?.title || "创作项目"}</span><ChevronRight size={17} /></Link>)}</div>}
      </section>
      <section className="asset-shortcut"><div><span><Boxes size={20} /></span><div><strong>内容资产</strong><p>上传素材与生成结果都已集中保存。</p></div></div><Link href="/assets">打开资产库<ChevronRight size={16} /></Link></section>
      <section className="inspiration-band"><div className="section-title"><div><h2>灵感案例</h2><p>授权示例素材，可按行业筛选并一键带入创作参数。</p></div><Link href="/tools">查看工具<ChevronRight size={16} /></Link></div><div className="case-controls"><label><Search size={15} /><input value={caseQuery} onChange={(event) => setCaseQuery(event.target.value)} placeholder="搜索案例" /></label><div>{["全部", ...Array.from(new Set(inspirations.map((item) => item.industry)))].map((item) => <button type="button" className={industry === item ? "active" : ""} key={item} onClick={() => setIndustry(item)}>{item}</button>)}</div></div><div className="inspiration-grid">{inspirations.filter((item) => (industry === "全部" || item.industry === industry) && `${item.title}${item.category}${item.description}`.includes(caseQuery.trim())).map((item) => <article className="inspiration-card" key={item.id}><img src={item.image} alt="" /><span>{item.industry} · {item.category}</span><div><strong>{item.title}</strong><p>{item.description}</p><Link href={item.href}>做同款<ArrowRight size={15} /></Link></div></article>)}</div></section>
    </div>
  </AppShell>;
}
