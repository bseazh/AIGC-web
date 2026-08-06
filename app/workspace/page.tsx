"use client";

export const dynamic = "force-dynamic";

import { ArrowRight, Boxes, ChevronRight, ImageIcon, PackageOpen, Play, RefreshCw, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { projectGateHref, projectStartHref, projectWorkflows, type ProjectWorkflowKey } from "@/lib/project-workflows";

type Account = { user: { identifier: string; displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number; frozenPoints: number } };
type ProjectDraft = { id: string; title: string; workflowKey: ProjectWorkflowKey; updatedAt: string };
type Inspiration = { id: string; title: string; category: string; industry: string; description: string; image: string; href: string };
const caseCategories = ["灵感广场", "服装鞋包", "珠宝首饰", "童装带货", "宠物带货", "美妆护理", "剧情带货", "数码家电", "零食食品", "母婴用品", "海外电商", "日用百货"];

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
  const visibleCases = inspirations.filter((item) => (industry === "全部" || industry === "灵感广场" || item.industry === industry) && `${item.title}${item.category}${item.description}`.includes(caseQuery.trim()));
  return <AppShell active="workspace" account={account} taskCount={activeCount}>
    <div className="workspace-content inspiration-workstation">
      <section className="station-heading">
        <div>
          <h1>灵感工作站</h1>
          <p>从灵感案例出发，开启高效创作</p>
        </div>
        <Link className="new-task" href={projectGateHref("image-generate")}><ImageIcon size={18} />新建项目</Link>
      </section>

      <section className="station-hero">
        <div className="station-hero-copy">
          <span>全新功能上线</span>
          <h2>复刻带货视频<br />抽帧换品更稳一致</h2>
          <p>保留爆款节奏，换成你的商品与模特。</p>
          <Link href={projectGateHref("recreate-video")}><Play size={17} />点击使用</Link>
        </div>
        <div className="station-hero-flow" aria-hidden="true">
          {["选择关键词", "生成脚本", "确认素材", "生成视频"].map((item, index) => <span key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</span>)}
        </div>
        <div className="station-hero-stage" aria-hidden="true">
          <i /><i /><i /><i /><i />
          <strong><Play size={42} /></strong>
        </div>
      </section>

      <section className="station-search">
        <button type="button">全部<ChevronRight size={14} /></button>
        <label><Search size={16} /><input value={caseQuery} onChange={(event) => setCaseQuery(event.target.value)} placeholder="搜索案例名称或关键词..." /></label>
        <button type="button" aria-label="刷新案例"><RefreshCw size={16} /></button>
      </section>

      <section className="station-case-panel">
        <nav className="station-case-tabs" aria-label="案例分类">
          {caseCategories.map((item) => <button type="button" className={industry === item || (industry === "全部" && item === "灵感广场") ? "active" : ""} key={item} onClick={() => setIndustry(item)}>{item}</button>)}
        </nav>
        {visibleCases.length === 0 ? <div className="empty-tasks"><span><PackageOpen size={24} /></span><strong>暂无案例</strong><p>换一个关键词试试看。</p></div> : <div className="station-case-grid">{visibleCases.map((item) => <article className="station-case-card" key={item.id}><img src={item.image} alt="" /><span>{item.category}</span><div><strong>{item.title}</strong><p>{item.description}</p><Link href={item.href}>做同款<ArrowRight size={15} /></Link></div></article>)}</div>}
      </section>

      <section className="workspace-overview-row">
        <section className="workspace-band"><div className="section-title"><div><h2>最近项目</h2><p>按项目继续编辑和查看进度</p></div><Link href="/tasks">查看全部<ChevronRight size={16} /></Link></div>
          {projects.length === 0 ? <div className="empty-tasks"><span><PackageOpen size={24} /></span><strong>暂无项目</strong><p>创建项目后，进度与结果会出现在这里。</p></div> : <div className="dashboard-task-list compact">{projects.map((project) => <Link className="dashboard-task project" href={projectStartHref(project.workflowKey, project.id)} key={project.id}><div><strong>{project.title}</strong><span>{projectWorkflows[project.workflowKey]?.title || "创作项目"} · {new Date(project.updatedAt).toLocaleString("zh-CN")}</span></div><ChevronRight size={17} /></Link>)}</div>}
        </section>
        <section className="asset-shortcut"><div><span><Boxes size={20} /></span><div><strong>素材库</strong><p>只长期保存主动上传或手动加入素材库的资产。</p></div></div><Link href="/assets">打开素材库<ChevronRight size={16} /></Link></section>
      </section>
    </div>
  </AppShell>;
}
