"use client";

import { Check, ChevronLeft, Clipboard, Copy, ImageIcon, ImagePlus, LoaderCircle, MessageCircleMore, Pencil, RotateCcw, Send, Sparkles, WandSparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { projectStartHref } from "@/lib/project-workflows";
import { imageRequest } from "@/app/features/image-creation/shared/image-task-api";
import { assistantOutputCounts, defaultAssistantSeriesConfig, getImageWorkflowSpec } from "@/app/features/image-creation/shared/image-workflow-spec";
import {
  CREATION_ASSISTANT_APPLY_EVENT,
  CREATION_ASSISTANT_CONTEXT_REQUEST_EVENT,
  type AssistantContextRequestDetail,
  type AssistantMessage,
  type AssistantWorkspaceContext,
  type AssistantSeriesConfig,
  type CreationAssistantState,
  type ImageAssistantWorkflowKey,
} from "../types";
import { imageAssistantWorkflows, imageAssistantWorkflowKeys } from "../workflows";

const initialMessage: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content: "先告诉我你想生成什么。我会读取当前商品图，并通过几轮选择把想法整理成可直接使用的提示词。",
};

function initialState(workflowKey: ImageAssistantWorkflowKey): CreationAssistantState {
  return {
    step: "service",
    goal: workflowKey,
    sourceText: "",
    audience: "",
    scene: "",
    style: "",
    sellingPoint: "",
    revision: "",
    prompt: "",
    recommendations: null,
    productConfirmed: false,
    messages: [initialMessage],
    referenceImages: [],
    seriesConfig: defaultAssistantSeriesConfig(workflowKey),
    visualBible: "",
    seriesPlan: [],
    handoffPending: false,
  };
}

function emptyProductProfile() {
  return { name: "", colors: [], materials: [], structure: [], visibleSellingPoints: [], uncertainItems: [] };
}

function message(role: AssistantMessage["role"], content: string): AssistantMessage {
  return { id: crypto.randomUUID(), role, content };
}

function collectWorkspaceContext() {
  const contexts: AssistantWorkspaceContext[] = [];
  window.dispatchEvent(new CustomEvent<AssistantContextRequestDetail>(CREATION_ASSISTANT_CONTEXT_REQUEST_EVENT, {
    detail: { respond: (context) => contexts.push(context) },
  }));
  return contexts.reduce<AssistantWorkspaceContext>((result, context) => ({
    images: [...result.images, ...(context.images || [])].filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index).slice(0, 4),
    productText: result.productText || context.productText,
  }), { images: [] });
}

async function prepareVisionImage(url: string) {
  if (url.startsWith("https://")) return url;
  if (url.startsWith("data:image/") && url.length <= 1_400_000) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error("图片读取失败");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("图片处理失败");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.76);
}

export function CreationAssistant({ projectId, workflowKey }: { projectId: string; workflowKey: ImageAssistantWorkflowKey }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CreationAssistantState>(() => initialState(workflowKey));
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [workspaceContext, setWorkspaceContext] = useState<AssistantWorkspaceContext>({ images: [] });
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeStepRef = useRef<HTMLElement>(null);
  const previousStepRef = useRef(state.step);
  const currentWorkflow = imageAssistantWorkflows[state.goal];
  const workflowSpec = getImageWorkflowSpec(state.goal);
  const outputCounts = assistantOutputCounts(state.goal);
  const directionLabels = workflowSpec.assistantMode === "transform"
    ? { audience: "", scene: "处理目标", sellingPoint: "重点保留", style: "处理强度" }
    : workflowSpec.assistantMode === "model"
      ? { audience: "目标人群", scene: "展示场景", sellingPoint: "商品交互动作", style: "人物与镜头" }
      : workflowSpec.assistantMode === "detail"
        ? { audience: "目标受众", scene: "页面使用场景", sellingPoint: "卖点排序重点", style: "系列视觉方向" }
        : { audience: "卖给谁", scene: "使用场景", sellingPoint: "突出价值", style: "画面风格" };

  useEffect(() => {
    let active = true;
    fetch(`/api/creation-assistant/?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "创作助手记录加载失败");
        if (!active) return;
        if (body.assistant) {
          const savedGoal = body.assistant.goal || workflowKey;
          const allowedCounts = assistantOutputCounts(savedGoal);
          const savedCount = Number(body.assistant.seriesConfig?.count);
          setState({
            ...initialState(workflowKey),
            ...body.assistant,
            goal: savedGoal,
            seriesConfig: {
              ...defaultAssistantSeriesConfig(savedGoal),
              ...(body.assistant.seriesConfig || {}),
              count: allowedCounts.includes(savedCount as 1 | 2 | 4 | 6 | 8) ? savedCount : allowedCounts[0],
            },
            productConfirmed: body.assistant.productConfirmed === true,
            recommendations: body.assistant.recommendations ? {
              ...body.assistant.recommendations,
              productProfile: { ...emptyProductProfile(), ...(body.assistant.recommendations.productProfile || {}) },
            } : null,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => active && setHydrated(true));
    return () => { active = false; };
  }, [projectId, workflowKey]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/creation-assistant/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, assistant: state }),
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [hydrated, projectId, state]);

  useEffect(() => {
    if (!open) return;
    setWorkspaceContext(collectWorkspaceContext());
    const container = scrollRef.current;
    if (!container) return;
    if (previousStepRef.current !== state.step) {
      const currentStep = activeStepRef.current;
      if (currentStep) {
        const containerTop = container.getBoundingClientRect().top;
        const stepTop = currentStep.getBoundingClientRect().top;
        container.scrollTo({ top: Math.max(0, container.scrollTop + stepTop - containerTop - 12), behavior: "smooth" });
      }
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
    previousStepRef.current = state.step;
  }, [open, state.messages.length, state.step]);

  useEffect(() => {
    if (!hydrated || !state.handoffPending || !state.prompt) return;
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(CREATION_ASSISTANT_APPLY_EVENT, {
        detail: { prompt: state.prompt, productSummary: state.recommendations?.productSummary || state.sourceText, referenceImages: state.referenceImages, seriesConfig: state.seriesConfig, visualBible: state.visualBible, seriesPlan: state.seriesPlan },
      }));
      setState((current) => ({ ...current, handoffPending: false }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, state.handoffPending, state.prompt, state.recommendations?.productSummary, state.sourceText]);

  const selectionsReady = useMemo(() => workflowSpec.assistantMode === "transform"
    ? Boolean(state.scene && state.style && state.sellingPoint)
    : Boolean(state.audience && state.scene && state.style && state.sellingPoint),
  [state.audience, state.scene, state.sellingPoint, state.style, workflowSpec.assistantMode]);

  const chooseService = (goal: ImageAssistantWorkflowKey) => {
    setError("");
    setState((current) => ({
      ...current,
      goal,
      step: "product",
      prompt: "",
      recommendations: null,
      seriesConfig: defaultAssistantSeriesConfig(goal),
      visualBible: "",
      seriesPlan: [],
      messages: [...current.messages, message("user", imageAssistantWorkflows[goal].label), message("assistant", "请补充商品信息。当前工作台已有商品图时，我也会一起识别。")],
    }));
  };

  const pasteProduct = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (value.trim()) setState((current) => ({ ...current, sourceText: value.trim().slice(0, 3000) }));
    } catch {
      setError("浏览器未允许读取剪贴板，请直接粘贴到输入框");
    }
  };

  const addReferenceImages = async (files: FileList | null) => {
    const selected = Array.from(files || []).slice(0, Math.max(0, 4 - state.referenceImages.length));
    if (!selected.length) return;
    const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024);
    if (invalid) return setError("参考图仅支持 JPG、PNG、WebP，单张最大 10MB");
    setReferenceBusy(true);
    setError("");
    try {
      const uploaded: Array<{ assetId: string; name: string }> = [];
      for (const file of selected) {
        const presign = await imageRequest<{ assetId: string; uploadUrl?: string; duplicate?: boolean }>("/api/uploads/presign/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }),
        });
        if (presign.uploadUrl) {
          const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
          if (!upload.ok) throw new Error(`参考图上传失败 (${upload.status})`);
          await imageRequest("/api/uploads/confirm/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId: presign.assetId }),
          });
        }
        uploaded.push({ assetId: presign.assetId, name: file.name });
      }
      const assets = await imageRequest<{ assets: Array<{ id: string; url: string; originalName: string }> }>("/api/assets/?kind=INPUT", { cache: "no-store" });
      const urls = new Map(assets.assets.map((asset) => [asset.id, asset]));
      setState((current) => ({
        ...current,
        referenceImages: [...current.referenceImages, ...uploaded.map((item) => ({ ...item, url: urls.get(item.assetId)?.url }))]
          .filter((item, index, items) => items.findIndex((candidate) => candidate.assetId === item.assetId) === index)
          .slice(0, 4),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "参考图上传失败");
    } finally {
      setReferenceBusy(false);
    }
  };

  const visionImages = async () => {
    const current = collectWorkspaceContext();
    setWorkspaceContext(current);
    const settled = await Promise.allSettled(current.images.slice(0, 4).map((item) => prepareVisionImage(item.url)));
    return {
      imageUrls: settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      productText: current.productText || "",
    };
  };

  const recommend = async () => {
    const context = await visionImages();
    const sourceText = state.sourceText.trim() || context.productText.trim();
    if (sourceText.length < 2 && !context.imageUrls.length && !state.referenceImages.length) return setError("请先描述商品，或添加商品参考图");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creation-assistant/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recommend",
          projectId,
          goal: state.goal,
          assistantMode: workflowSpec.assistantMode,
          sourceText,
          imageUrls: context.imageUrls,
          referenceAssetIds: state.referenceImages.map((image) => image.assetId),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "方向推荐失败");
      const recommendations = body.recommendations;
      const imageCount = Math.min(4, context.imageUrls.length + state.referenceImages.length);
      const userSummary = sourceText || `识别当前提供的 ${imageCount} 张商品图`;
      setState((current) => ({
        ...current,
        sourceText: current.sourceText || sourceText,
        step: "direction",
        recommendations,
        productConfirmed: false,
        audience: recommendations.audiences[0] || "",
        scene: recommendations.scenes[0] || "",
        style: recommendations.styles[0] || "",
        sellingPoint: recommendations.sellingPoints[0] || "",
        messages: [...current.messages, message("user", userSummary), message("assistant", `${recommendations.reply}${recommendations.question ? `\n${recommendations.question}` : ""}`)],
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "方向推荐失败");
    } finally {
      setBusy(false);
    }
  };

  const refineDirection = async (answer?: string) => {
    const userMessage = (answer || chatInput).trim();
    if (!userMessage) return setError("请点击一个回答，或输入你的修改意见");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creation-assistant/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          projectId,
          goal: state.goal,
          assistantMode: workflowSpec.assistantMode,
          sourceText: state.sourceText || state.recommendations?.productSummary,
          productSummary: state.recommendations?.productSummary,
          visualAnalysis: state.recommendations?.visualAnalysis,
          recommendations: state.recommendations,
          audience: state.audience,
          scene: state.scene,
          style: state.style,
          sellingPoint: state.sellingPoint,
          messages: state.messages,
          userMessage,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "方向校正失败");
      const recommendations = body.recommendations;
      setState((current) => ({
        ...current,
        recommendations,
        productConfirmed: false,
        audience: recommendations.audiences[0] || current.audience,
        scene: recommendations.scenes[0] || current.scene,
        style: recommendations.styles[0] || current.style,
        sellingPoint: recommendations.sellingPoints[0] || current.sellingPoint,
        messages: [...current.messages, message("user", userMessage), message("assistant", `${recommendations.reply}${recommendations.question ? `\n${recommendations.question}` : ""}`)],
      }));
      setChatInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "方向校正失败");
    } finally {
      setBusy(false);
    }
  };

  const generatePrompt = async () => {
    if (!selectionsReady) return setError("请先选择受众、场景、风格和核心卖点");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/creation-assistant/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          projectId,
          goal: state.goal,
          assistantMode: workflowSpec.assistantMode,
          sourceText: state.sourceText || state.recommendations?.productSummary,
          productSummary: state.recommendations?.productSummary,
          recommendations: state.recommendations,
          visualAnalysis: state.recommendations?.visualAnalysis,
          audience: state.audience,
          scene: state.scene,
          style: state.style,
          sellingPoint: state.sellingPoint,
          revision: state.revision,
          seriesConfig: state.seriesConfig,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "提示词生成失败");
      setState((current) => ({
        ...current,
        step: workflowSpec.assistantMode === "transform" ? "result" : "series",
        prompt: body.prompt,
        visualBible: body.visualBible || "",
        seriesPlan: Array.isArray(body.seriesPlan) ? body.seriesPlan : [],
        revision: "",
        messages: [...current.messages, message("user", "按当前方向生成提示词"), message("assistant", body.summary)],
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提示词生成失败");
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(state.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const applyPrompt = async () => {
    if (state.goal === workflowKey) {
      window.dispatchEvent(new CustomEvent(CREATION_ASSISTANT_APPLY_EVENT, {
        detail: { prompt: state.prompt, productSummary: state.recommendations?.productSummary || state.sourceText, referenceImages: state.referenceImages, seriesConfig: state.seriesConfig, visualBible: state.visualBible, seriesPlan: state.seriesPlan },
      }));
      setOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const titleBase = (state.recommendations?.productSummary || currentWorkflow.label).replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 22);
      const title = `${titleBase || currentWorkflow.label}-${currentWorkflow.label}-${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/:/g, "")}`;
      const response = await fetch("/api/workflow-drafts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowKey: state.goal,
          title,
          payload: { creationAssistant: { ...state, handoffPending: true, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "目标项目创建失败");
      router.push(projectStartHref(state.goal, body.draft.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "目标项目创建失败");
      setBusy(false);
    }
  };

  const reset = () => {
    setState(initialState(workflowKey));
    setChatInput("");
    setError("");
    setCopied(false);
    setProfileEditing(false);
  };

  const updateProductProfile = (field: keyof NonNullable<CreationAssistantState["recommendations"]>["productProfile"], value: string) => {
    setState((current) => {
      if (!current.recommendations) return current;
      const nextValue = field === "name"
        ? value.slice(0, 100)
        : value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
      const productProfile = { ...current.recommendations.productProfile, [field]: nextValue };
      return {
        ...current,
        productConfirmed: false,
        recommendations: {
          ...current.recommendations,
          productProfile,
          productSummary: field === "name" && typeof nextValue === "string" ? nextValue : current.recommendations.productSummary,
        },
      };
    });
  };

  const hasWorkspaceImages = workspaceContext.images.length > 0;
  const hasReferenceImages = state.referenceImages.length > 0;
  const hasWorkspaceProductText = Boolean(workspaceContext.productText?.trim());
  const targetDiffers = state.goal !== workflowKey;

  return (
    <>
      <button className={`creation-assistant-launcher ${open ? "active" : ""}`} type="button" aria-label="打开创作助手" onClick={() => setOpen((value) => !value)}>
        {open ? <X size={20} /> : <MessageCircleMore size={21} />}
        {!open && <span>创作助手</span>}
      </button>
      {open && <aside className="creation-assistant-panel" aria-label="图片创作助手">
        <header>
          <span><Sparkles size={17} /></span>
          <div><strong>图片创作助手</strong><small>项目对话保留 7 天</small></div>
          <button type="button" aria-label="重新开始" title="重新开始" onClick={reset}><RotateCcw size={16} /></button>
          <button type="button" aria-label="关闭" onClick={() => setOpen(false)}><X size={17} /></button>
        </header>
        <div className="creation-assistant-history" ref={scrollRef}>
          {state.messages.slice(-12).map((item) => <p className={item.role} key={item.id}>{item.content}</p>)}

          {state.step === "service" && <section className="creation-assistant-step" ref={activeStepRef}>
            <div className="creation-assistant-step-title"><b>选择服务</b><span>1 / 4</span></div>
            <div className="creation-assistant-service-grid">
              {imageAssistantWorkflowKeys.map((key) => <button type="button" className={state.goal === key ? "selected" : ""} onClick={() => chooseService(key)} key={key}>
                <strong>{imageAssistantWorkflows[key].label}</strong><small>{imageAssistantWorkflows[key].description}</small>
              </button>)}
            </div>
          </section>}

          {state.step === "product" && <section className="creation-assistant-step" ref={activeStepRef}>
            <div className="creation-assistant-step-title"><b>理解商品</b><span>2 / 4</span></div>
            {hasWorkspaceImages && <div className="creation-assistant-reference-block">
              <div className="creation-assistant-reference-heading"><span><ImageIcon size={15} />当前工作台</span><small>{workspaceContext.images.length} 张</small></div>
              <div className="creation-assistant-reference-grid">{workspaceContext.images.map((image) => <figure key={image.url}><img src={image.url} alt={image.name || "工作台商品图"} /><figcaption>{image.name || "商品图"}</figcaption></figure>)}</div>
            </div>}
            <div className="creation-assistant-reference-block">
              <div className="creation-assistant-reference-heading"><span><ImagePlus size={15} />补充参考图</span><small>{state.referenceImages.length} / 4</small></div>
              {hasReferenceImages && <div className="creation-assistant-reference-grid">{state.referenceImages.map((image) => <figure key={image.assetId}>{image.url ? <img src={image.url} alt={image.name} /> : <span className="creation-assistant-reference-placeholder"><ImageIcon size={18} /></span>}<figcaption>{image.name}</figcaption><button type="button" aria-label={`移除${image.name}`} onClick={() => setState((current) => ({ ...current, referenceImages: current.referenceImages.filter((item) => item.assetId !== image.assetId) }))}><X size={12} /></button></figure>)}</div>}
              {state.referenceImages.length < 4 && <label className="creation-assistant-reference-upload">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={referenceBusy} onChange={(event) => { void addReferenceImages(event.target.files); event.currentTarget.value = ""; }} />
                {referenceBusy ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}
                <span>{referenceBusy ? "正在上传" : "添加商品或效果参考图"}</span>
              </label>}
              <small className="creation-assistant-reference-note">参考图会保存到素材库，并跟随当前项目助手记录。</small>
            </div>
            <label className="creation-assistant-input">
              <textarea value={state.sourceText} onChange={(event) => setState((current) => ({ ...current, sourceText: event.target.value.slice(0, 3000) }))} placeholder={hasWorkspaceImages ? "可以不填；也可以补充商品名称、已知卖点或不能改变的细节。" : "例如：专业户外音箱，面向活动执行团队，希望突出覆盖范围和快速部署。"} />
              <small>{state.sourceText.length}/3000</small>
            </label>
            <button className="creation-assistant-paste" type="button" onClick={pasteProduct}><Clipboard size={15} />粘贴商品信息</button>
            <div className="creation-assistant-footer"><button type="button" onClick={() => setState((current) => ({ ...current, step: "service" }))}><ChevronLeft size={15} />上一步</button><button className="primary" type="button" disabled={busy || referenceBusy || (!hasWorkspaceImages && !hasReferenceImages && !hasWorkspaceProductText && state.sourceText.trim().length < 2)} onClick={recommend}>{busy ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{hasWorkspaceImages || hasReferenceImages ? "识别图片并推荐" : "AI 推荐方向"}</button></div>
          </section>}

          {state.step === "direction" && state.recommendations && <section className="creation-assistant-step" ref={activeStepRef}>
            <div className="creation-assistant-step-title"><b>{workflowSpec.assistantMode === "transform" ? "确认处理方案" : "对话校正方向"}</b><span>3 / 5</span></div>
            <div className={`creation-assistant-product-profile ${state.productConfirmed ? "confirmed" : ""}`}>
              <header><div><strong>商品识别档案</strong><small>{state.productConfirmed ? "已确认，将作为生成事实依据" : "请确认后再生成系列方案"}</small></div><button type="button" onClick={() => setProfileEditing((value) => !value)}>{profileEditing ? <Check size={13} /> : <Pencil size={13} />}{profileEditing ? "完成编辑" : "编辑"}</button></header>
              {profileEditing ? <div className="creation-assistant-profile-fields">
                <label>商品名称<input value={state.recommendations.productProfile.name} onChange={(event) => updateProductProfile("name", event.target.value)} /></label>
                <label>主要颜色<input value={state.recommendations.productProfile.colors.join("，")} onChange={(event) => updateProductProfile("colors", event.target.value)} placeholder="用逗号分隔" /></label>
                <label>可见材质<input value={state.recommendations.productProfile.materials.join("，")} onChange={(event) => updateProductProfile("materials", event.target.value)} placeholder="用逗号分隔" /></label>
                <label>结构特征<textarea value={state.recommendations.productProfile.structure.join("\n")} onChange={(event) => updateProductProfile("structure", event.target.value)} /></label>
                <label>可见卖点<textarea value={state.recommendations.productProfile.visibleSellingPoints.join("\n")} onChange={(event) => updateProductProfile("visibleSellingPoints", event.target.value)} /></label>
                <label>待确认信息<textarea value={state.recommendations.productProfile.uncertainItems.join("\n")} onChange={(event) => updateProductProfile("uncertainItems", event.target.value)} /></label>
              </div> : <div className="creation-assistant-profile-summary">
                <h3>{state.recommendations.productProfile.name || state.recommendations.productSummary}</h3>
                {[state.recommendations.productProfile.colors, state.recommendations.productProfile.materials].flat().length > 0 && <p>{[...state.recommendations.productProfile.colors, ...state.recommendations.productProfile.materials].join(" · ")}</p>}
                {state.recommendations.productProfile.structure.length > 0 && <dl><dt>结构</dt><dd>{state.recommendations.productProfile.structure.join("；")}</dd></dl>}
                {state.recommendations.productProfile.visibleSellingPoints.length > 0 && <dl><dt>可见卖点</dt><dd>{state.recommendations.productProfile.visibleSellingPoints.join("；")}</dd></dl>}
                {state.recommendations.productProfile.uncertainItems.length > 0 && <dl className="uncertain"><dt>待确认</dt><dd>{state.recommendations.productProfile.uncertainItems.join("；")}</dd></dl>}
              </div>}
              <footer><button type="button" disabled={busy} onClick={() => { setProfileEditing(false); setState((current) => ({ ...current, productConfirmed: true })); }}><Check size={14} />确认识别正确</button><button type="button" disabled={busy} onClick={() => { setState((current) => ({ ...current, step: "product", productConfirmed: false })); setProfileEditing(false); }}><RotateCcw size={14} />重新识别</button></footer>
            </div>
            {state.recommendations.visualAnalysis && <details className="creation-assistant-vision-analysis"><summary><ImageIcon size={14} />已读取参考图，查看识别结果</summary><p>{state.recommendations.visualAnalysis}</p></details>}
            {directionLabels.audience && <ChoiceGroup label={directionLabels.audience} value={state.audience} options={state.recommendations.audiences} onChange={(audience) => setState((current) => ({ ...current, audience }))} />}
            <ChoiceGroup label={directionLabels.scene} value={state.scene} options={state.recommendations.scenes} onChange={(scene) => setState((current) => ({ ...current, scene }))} />
            <ChoiceGroup label={directionLabels.sellingPoint} value={state.sellingPoint} options={state.recommendations.sellingPoints} onChange={(sellingPoint) => setState((current) => ({ ...current, sellingPoint }))} />
            <ChoiceGroup label={directionLabels.style} value={state.style} options={state.recommendations.styles} onChange={(style) => setState((current) => ({ ...current, style }))} />
            <div className="creation-assistant-chat-box">
              <strong>{state.recommendations.question || "还需要怎样调整？"}</strong>
              {state.recommendations.quickReplies.length > 0 && <div>{state.recommendations.quickReplies.map((item) => <button type="button" disabled={busy} onClick={() => refineDirection(item)} key={item}>{item}</button>)}</div>}
              <label><input value={chatInput} onChange={(event) => setChatInput(event.target.value.slice(0, 500))} placeholder="输入你的回答或修改意见" /><button type="button" disabled={busy || !chatInput.trim()} onClick={() => refineDirection()} aria-label="发送修改意见"><Send size={15} /></button></label>
            </div>
            <div className="creation-assistant-footer"><button type="button" onClick={() => setState((current) => ({ ...current, step: "product" }))}><ChevronLeft size={15} />修改商品</button><button className="primary" type="button" disabled={busy || !selectionsReady || !state.productConfirmed} onClick={generatePrompt}>{busy ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{workflowSpec.assistantMode === "transform" ? "生成处理方案" : workflowSpec.assistantMode === "detail" ? "生成详情页方案" : "生成创作方案"}</button></div>
          </section>}

          {state.step === "series" && <section className="creation-assistant-step" ref={activeStepRef}>
            <div className="creation-assistant-step-title"><b>{workflowSpec.assistantMode === "detail" ? "详情页卡片规划" : "系列设置与预览"}</b><span>4 / 5</span></div>
            <p className="creation-assistant-summary">{workflowSpec.assistantMode === "detail" ? "确认详情页叙事顺序、每张卖点和文案，再生成整套图片。" : "确认图片数量和统一规则，每张图片会绑定自己的角度与卖点。"}</p>
            <fieldset className="creation-assistant-choices"><legend>生成数量</legend><div>{outputCounts.map((count) => <button type="button" className={state.seriesConfig.count === count ? "selected" : ""} key={count} onClick={() => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, count: count as AssistantSeriesConfig["count"] }, seriesPlan: [] }))}>{count} 张</button>)}</div></fieldset>
            <label className="creation-assistant-series-ratio"><span>系列画幅</span><select value={["auto", "1:1", "3:4", "4:3", "9:16"].includes(state.seriesConfig.ratio) ? state.seriesConfig.ratio : "custom"} onChange={(event) => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, ratio: event.target.value === "custom" ? "8:20" : event.target.value } }))}><option value="auto">自动</option><option value="1:1">1:1 方形</option><option value="3:4">3:4 竖版</option><option value="4:3">4:3 横版</option><option value="9:16">9:16 手机竖版</option><option value="custom">自定义</option></select>{!["auto", "1:1", "3:4", "4:3", "9:16"].includes(state.seriesConfig.ratio) && <input value={state.seriesConfig.ratio} placeholder="例如 8:20" onChange={(event) => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, ratio: event.target.value.replace(/[^0-9:]/g, "").slice(0, 11) } }))} />}</label>
            <div className="creation-assistant-series-toggles"><label><input type="checkbox" checked={state.seriesConfig.unifiedStyle} onChange={(event) => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, unifiedStyle: event.target.checked } }))} />统一视觉风格</label><label><input type="checkbox" checked={state.seriesConfig.unifiedBackground} onChange={(event) => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, unifiedBackground: event.target.checked } }))} />统一背景体系</label>{workflowSpec.assistantMode === "detail" && <label><input type="checkbox" checked={state.seriesConfig.reserveCopySpace} onChange={(event) => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, reserveCopySpace: event.target.checked } }))} />预留文案空间</label>}<label><input type="checkbox" checked={state.seriesConfig.differentAngles} onChange={(event) => setState((current) => ({ ...current, seriesConfig: { ...current.seriesConfig, differentAngles: event.target.checked } }))} />每张使用不同角度</label></div>
            {state.visualBible && <details className="creation-assistant-vision-analysis" open><summary>已生成统一视觉基准</summary><p>{state.visualBible}</p></details>}
            <div className="creation-assistant-series-plan">{state.seriesPlan.map((card, index) => <article key={card.id}><header><b>{index + 1}</b><input value={card.title} onChange={(event) => setState((current) => ({ ...current, seriesPlan: current.seriesPlan.map((item) => item.id === card.id ? { ...item, title: event.target.value.slice(0, 80) } : item) }))} /></header><label>角度<input value={card.angle} onChange={(event) => setState((current) => ({ ...current, seriesPlan: current.seriesPlan.map((item) => item.id === card.id ? { ...item, angle: event.target.value.slice(0, 80) } : item) }))} /></label><label>卖点<input value={card.sellingPoint} onChange={(event) => setState((current) => ({ ...current, seriesPlan: current.seriesPlan.map((item) => item.id === card.id ? { ...item, sellingPoint: event.target.value.slice(0, 120) } : item) }))} /></label><label>文案<textarea value={card.copy} onChange={(event) => setState((current) => ({ ...current, seriesPlan: current.seriesPlan.map((item) => item.id === card.id ? { ...item, copy: event.target.value.slice(0, 120) } : item) }))} /></label></article>)}</div>
            {state.seriesPlan.length !== state.seriesConfig.count && <p className="creation-assistant-series-note">数量发生变化，请返回方向后重新生成系列方案。</p>}
            <div className="creation-assistant-footer"><button type="button" onClick={() => setState((current) => ({ ...current, step: "direction" }))}><ChevronLeft size={15} />返回并重新生成</button><button className="primary" type="button" disabled={state.seriesPlan.length !== state.seriesConfig.count} onClick={() => setState((current) => ({ ...current, step: "result" }))}><WandSparkles size={15} />确认系列并查看提示词</button></div>
          </section>}

          {state.step === "result" && <section className="creation-assistant-step result" ref={activeStepRef}>
            <div className="creation-assistant-step-title"><b>{currentWorkflow.label}{workflowSpec.assistantMode === "transform" ? "处理提示词" : "系列提示词"}</b><span>5 / 5</span></div>
            <div className="creation-assistant-reference-block">
              <div className="creation-assistant-reference-heading"><span><ImageIcon size={15} />本次参考图</span><small>{state.referenceImages.length} / 4，将随提示词一起回填</small></div>
              {state.referenceImages.length > 0 && <div className="creation-assistant-reference-grid">{state.referenceImages.map((image) => <figure key={image.assetId}>{image.url ? <img src={image.url} alt={image.name} /> : <span className="creation-assistant-reference-placeholder"><ImageIcon size={18} /></span>}<figcaption>{image.name}</figcaption><button type="button" aria-label={`移除${image.name}`} onClick={() => setState((current) => ({ ...current, referenceImages: current.referenceImages.filter((item) => item.assetId !== image.assetId) }))}><X size={12} /></button></figure>)}</div>}
              {state.referenceImages.length < 4 && <label className="creation-assistant-reference-upload">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={referenceBusy} onChange={(event) => { void addReferenceImages(event.target.files); event.currentTarget.value = ""; }} />
                {referenceBusy ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}
                <span>{referenceBusy ? "正在上传" : "添加参考图"}</span>
              </label>}
            </div>
            <textarea className="creation-assistant-prompt" value={state.prompt} onChange={(event) => setState((current) => ({ ...current, prompt: event.target.value.slice(0, 1200) }))} />
            {targetDiffers && <p className="creation-assistant-handoff-note">当前是 {imageAssistantWorkflows[workflowKey].label} 项目。应用后会新建 {currentWorkflow.label} 项目并自动回填提示词。</p>}
            <div className="creation-assistant-result-actions">
              <button type="button" onClick={copyPrompt}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "已复制" : "复制提示词"}</button>
              <button className="primary" type="button" disabled={busy} onClick={applyPrompt}>{busy ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />}{targetDiffers ? `新建${currentWorkflow.label}项目` : "回填当前页面"}</button>
            </div>
            <label className="creation-assistant-revision"><span>还想怎么调整？</span><textarea value={state.revision} onChange={(event) => setState((current) => ({ ...current, revision: event.target.value.slice(0, 500) }))} placeholder="例如：商品再大一些，场景更专业，不要人物" /></label>
            <button className="creation-assistant-regenerate" type="button" disabled={busy || !state.revision.trim()} onClick={generatePrompt}>{busy ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}按意见重新生成</button>
          </section>}
          {error && <p className="creation-assistant-error">{error}</p>}
        </div>
      </aside>}
    </>
  );
}

function ChoiceGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [customOpen, setCustomOpen] = useState(() => Boolean(value && !options.includes(value)));
  return <fieldset className="creation-assistant-choices">
    <legend>{label}</legend>
    <div>{options.map((option) => <button type="button" className={value === option ? "selected" : ""} onClick={() => { setCustomOpen(false); onChange(option); }} key={option}>{value === option && <Check size={12} />}{option}</button>)}<button type="button" className={customOpen ? "selected" : ""} onClick={() => setCustomOpen(true)}><Pencil size={12} />自己填写</button></div>
    {customOpen && <input autoFocus value={options.includes(value) ? "" : value} onChange={(event) => onChange(event.target.value.slice(0, 120))} placeholder={`填写${label}`} />}
  </fieldset>;
}
