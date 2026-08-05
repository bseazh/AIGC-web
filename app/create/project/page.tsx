"use client";

export const dynamic = "force-dynamic";

import { ArrowLeft, ChevronRight, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { WorkflowIcon } from "@/app/components/workflow-icon";
import {
  appendProjectId,
  isProjectWorkflowKey,
  projectWorkflows,
  type ProjectWorkflowKey,
} from "@/lib/project-workflows";

type Account = { user: { displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
type ProjectDraft = {
  id: string;
  title: string;
  workflowKey: ProjectWorkflowKey;
  payload: Record<string, unknown>;
  taskId: string | null;
  updatedAt: string;
};

function initialPayload(workflowKey: ProjectWorkflowKey) {
  const projectSeed = crypto.randomUUID();
  if (workflowKey === "recreate-video") {
    return {
      projectSeed,
      step: "source",
      sourceMode: "douyin",
      douyinInput: "",
      douyinAnalysis: null,
      douyinStart: 0,
      douyinClipDuration: 15,
      sourceItem: null,
      douyinClips: [],
      activeClipId: null,
      selectedKeyframes: [],
      products: [],
      referenceImage: null,
      usageAuthorized: false,
      productInfo: "",
      special: "",
      polishedPrompt: null,
      ratio: "9:16",
      duration: "15",
      resolution: "720p",
    };
  }
  return {
    projectSeed,
    step: "start",
    sourceItem: null,
    products: [],
    notes: "",
  };
}

export default function ProjectGatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowKey = searchParams?.get("workflowKey") || null;
  const normalizedWorkflowKey = isProjectWorkflowKey(workflowKey) ? workflowKey : "product-hero-image";
  const workflow = projectWorkflows[normalizedWorkflowKey];
  const nextParam = searchParams?.get("next") || "";
  const next = nextParam.startsWith("/create/") ? nextParam : workflow.startPath;
  const [account, setAccount] = useState<Account | null>(null);
  const [drafts, setDrafts] = useState<ProjectDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const createPlaceholder = useMemo(() => `${workflow.title} ${new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}`, [workflow.title]);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/workflow-drafts/?workflowKey=${normalizedWorkflowKey}&limit=20`, { cache: "no-store" });
      if (response.status === 401) return router.replace("/");
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "项目列表加载失败");
      setDrafts(body?.drafts || []);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "项目列表加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (account) void loadDrafts();
  }, [account, normalizedWorkflowKey]);

  const openProject = (draft: ProjectDraft) => {
    router.push(appendProjectId(next, draft.id));
  };

  const createProject = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setMessage("请先填写项目名称");
      return;
    }
    if (drafts.some((draft) => draft.title.trim().toLowerCase() === normalizedTitle.toLowerCase())) {
      setMessage("同名项目已存在，请换一个项目名称");
      return;
    }
    setCreating(true);
    setMessage("");
    try {
      const response = await fetch("/api/workflow-drafts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: null,
          workflowKey: normalizedWorkflowKey,
          title: normalizedTitle,
          payload: initialPayload(normalizedWorkflowKey),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "项目创建失败");
      openProject(body.draft);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "项目创建失败");
    } finally {
      setCreating(false);
    }
  };

  if (!account) return <LoadingScreen />;

  return (
    <AppShell active="tools" account={account}>
      <div className="app-page-content">
        <section className="project-gate-page">
          <Link className="back-link" href="/tools">
            <ArrowLeft size={16} />
            返回创作工具
          </Link>
          <header>
            <span>PROJECT REQUIRED</span>
            <h1>先选择一个项目</h1>
            <p>{workflow.title} 会以项目方式保存输入素材、生成任务、积分状态和后续编辑痕迹。</p>
          </header>

          <section className="project-create-panel">
            <div className="record-thumb">
              <WorkflowIcon workflowKey={normalizedWorkflowKey} />
            </div>
            <label>
              新项目名称
              <input
                value={title}
                maxLength={80}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setMessage("");
                }}
                placeholder={`例如：${createPlaceholder}`}
              />
            </label>
            <button type="button" onClick={createProject} disabled={creating}>
              {creating ? <LoaderCircle className="generation-spinner" size={16} /> : <Plus size={16} />}
              创建项目并开始
            </button>
          </section>
          {message ? <p className="creator-error">{message}</p> : null}

          <section className="project-list-panel">
            <div className="section-title">
              <div>
                <h2>已有项目</h2>
                <p>选择项目后继续创作，项目名称不可重复。</p>
              </div>
              <button type="button" onClick={loadDrafts} disabled={loading}>
                {loading ? <LoaderCircle className="generation-spinner" size={15} /> : <RefreshCw size={15} />}
                刷新
              </button>
            </div>
            {loading ? (
              <div className="records-loading"><LoaderCircle size={22} />正在读取项目</div>
            ) : drafts.length ? (
              <div className="project-list">
                {drafts.map((draft) => (
                  <button type="button" key={draft.id} onClick={() => openProject(draft)}>
                    <span className="record-thumb">
                      <WorkflowIcon workflowKey={draft.workflowKey} />
                    </span>
                    <span>
                      <strong>{draft.title}</strong>
                      <small>最近编辑 {new Date(draft.updatedAt).toLocaleString("zh-CN")}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="page-empty compact">
                <span><Plus size={24} /></span>
                <strong>还没有项目</strong>
                <p>先创建一个项目，再进入创作流程。</p>
              </div>
            )}
          </section>
        </section>
      </div>
    </AppShell>
  );
}
