"use client";

import { ArrowDown, ArrowLeft, ArrowUp, FolderOpen, ImagePlus, LoaderCircle, Plus, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeneratedAssetActions, TemporaryResultNotice, restoredTaskPhase, watchProjectTaskResult, type GeneratedTaskResult } from "@/app/components/generated-asset-actions";
import { GenerationProgress } from "@/app/components/generation-progress";
import { imageRequest, pollImageTask, uploadImageFile } from "@/app/features/image-creation/shared/image-task-api";
import { ImageAspectRatioControl } from "@/app/features/image-creation/shared/image-aspect-ratio-control";
import { useAssistantPromptReceiver, useAssistantWorkspaceContext } from "@/app/features/creation-assistant/use-assistant-prompt";
import { DETAIL_PAGE_MAX_CARDS, DETAIL_PAGE_MIN_CARDS, normalizeDetailCards, normalizeDetailPlans, type DetailPageCard, type DetailPagePlan } from "@/lib/detail-page-plans";
import type { ImageWorkflowCase } from "@/lib/image-workflow-cases";

type Asset = { id: string; mimeType: string; originalName: string; url: string; kind: string };
type Account = { user: { isAdministrator?: boolean }; wallet: { availablePoints: number } };
type Stage = "brief" | "plans" | "cards" | "results";
type Phase = "idle" | "uploading" | "planning" | "generating" | "succeeded" | "failed";

const ratios = ["1:1", "3:4", "4:3", "9:16"] as const;

type Props = {
  workflowKey: "product-detail-page" | "recreate-detail-page";
  title: string;
  description: string;
  submitUrl: string;
  cases: readonly ImageWorkflowCase[];
  sourceTitle: string;
  sourceHint: string;
  productDescriptionLabel: string;
  productDescriptionPlaceholder: string;
  pointsPerTask: number;
};

function newCard(index: number): DetailPageCard {
  return { id: crypto.randomUUID(), role: `补充模块 ${index + 1}`, title: "填写卡片主标题", subtitle: "填写辅助文案", visualPrompt: "描述商品展示角度、使用场景、光线和需要保留的排版空间" };
}

export function DetailPageStudio(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || "";
  const [account, setAccount] = useState<Account | null>(null);
  const [projectTitle, setProjectTitle] = useState("未命名项目");
  const [file, setFile] = useState<File | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [resolvedAssetId, setResolvedAssetId] = useState("");
  const [preview, setPreview] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [productDescription, setProductDescription] = useState("");
  const [plans, setPlans] = useState<DetailPagePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [cards, setCards] = useState<DetailPageCard[]>([]);
  const [productUnderstanding, setProductUnderstanding] = useState("");
  const [ratio, setRatio] = useState<string>("3:4");
  const [focusedCardId, setFocusedCardId] = useState("");
  const [stage, setStage] = useState<Stage>("brief");
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState<GeneratedTaskResult | null>(null);
  const [error, setError] = useState("");
  const hydrated = useRef(false);

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;
  const busy = ["uploading", "planning", "generating"].includes(phase);
  const currentStep = stage === "brief" ? 1 : stage === "plans" ? 2 : 3;
  const markSaved = (assetId: string) => setTask((current) => current ? { ...current, outputs: current.outputs.map((output) => output.assetId === assetId ? { ...output, savedToLibrary: true, expiresAt: null } : output) } : current);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      setAccount(await response.json());
    }).catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!projectId || !account) return;
    Promise.all([
      fetch(`/api/workflow-drafts/${projectId}/`, { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/assets/?kind=ALL", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([draftBody, assetBody]) => {
      const draft = draftBody?.draft;
      const saved = draft?.payload?.detailPageStudio as Record<string, unknown> | undefined;
      const availableAssets = (assetBody?.assets || []).filter((asset: Asset) => asset.mimeType.startsWith("image/"));
      setAssets(availableAssets);
      if (typeof draft?.title === "string") setProjectTitle(draft.title);
      if (saved) {
        const assetId = typeof saved.assetId === "string" ? saved.assetId : "";
        const asset = availableAssets.find((item: Asset) => item.id === assetId) || null;
        if (asset) { setSelectedAsset(asset); setResolvedAssetId(asset.id); setPreview(asset.url); }
        if (typeof saved.productDescription === "string") setProductDescription(saved.productDescription.slice(0, 900));
        const restoredPlans = normalizeDetailPlans(saved.plans);
        const restoredCards = normalizeDetailCards(saved.cards);
        setPlans(restoredPlans);
        setCards(restoredCards);
        if (typeof saved.selectedPlanId === "string") setSelectedPlanId(saved.selectedPlanId);
        if (typeof saved.productUnderstanding === "string") setProductUnderstanding(saved.productUnderstanding.slice(0, 240));
        if (typeof saved.ratio === "string") setRatio(saved.ratio);
        if (restoredCards.length >= DETAIL_PAGE_MIN_CARDS) setStage("cards");
        else if (restoredPlans.length) setStage("plans");
      }
      hydrated.current = true;
    }).catch(() => { hydrated.current = true; });
  }, [account, projectId]);

  useEffect(() => watchProjectTaskResult(projectId, (restored) => {
    setTask(restored);
    const restoredPhase = restoredTaskPhase(restored);
    setPhase(restoredPhase);
    if (restoredPhase === "succeeded") {
      const restoredCards = normalizeDetailCards(restored.inputSummary?.detailCards);
      if (restoredCards.length) setCards(restoredCards);
      setStage("results");
    }
  }), [projectId]);

  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  useAssistantPromptReceiver({
    setPrompt: (value) => setProductDescription(value.slice(0, 900)),
    setReferenceImages: (images) => {
      const image = images.find((item) => item.url);
      if (!image?.url) return;
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      setFile(null);
      setSelectedAsset({ id: image.assetId, mimeType: "image/jpeg", originalName: image.name, url: image.url, kind: "INPUT" });
      setResolvedAssetId(image.assetId);
      setPreview(image.url);
      setPlans([]); setCards([]); setSelectedPlanId(""); setStage("brief"); setTask(null); setPhase("idle"); setError("");
    },
  });
  useAssistantWorkspaceContext(useMemo(() => ({
    images: preview ? [{ url: preview, name: file?.name || selectedAsset?.originalName || "商品图", role: "product" as const }] : [],
    productText: productDescription,
  }), [file?.name, preview, productDescription, selectedAsset?.originalName]));

  useEffect(() => {
    if (stage !== "cards" || !focusedCardId) return;
    const timer = window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>(`[data-detail-card-id="${CSS.escape(focusedCardId)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.querySelector<HTMLInputElement>('input[aria-label="卡片主标题"]')?.focus();
      setFocusedCardId("");
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusedCardId, stage]);

  useEffect(() => {
    if (!hydrated.current || !projectId || (!resolvedAssetId && !plans.length)) return;
    const timer = window.setTimeout(() => {
      fetch("/api/workflow-drafts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          workflowKey: props.workflowKey,
          title: projectTitle,
          payload: { step: stage, detailPageStudio: { assetId: resolvedAssetId || selectedAsset?.id || "", productDescription, plans, selectedPlanId, cards, productUnderstanding, ratio } },
        }),
      }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [cards, plans, productDescription, productUnderstanding, projectId, projectTitle, props.workflowKey, ratio, resolvedAssetId, selectedAsset?.id, selectedPlanId, stage]);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) return setError("仅支持 JPG、PNG、WebP 图片");
    if (nextFile.size > 10 * 1024 * 1024) return setError("图片不能超过 10MB");
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(nextFile); setSelectedAsset(null); setResolvedAssetId(""); setPreview(URL.createObjectURL(nextFile));
    setPlans([]); setCards([]); setSelectedPlanId(""); setStage("brief"); setTask(null); setPhase("idle"); setError("");
  };

  const uploadSource = async () => {
    if (resolvedAssetId) return resolvedAssetId;
    if (selectedAsset) { setResolvedAssetId(selectedAsset.id); return selectedAsset.id; }
    if (!file) throw new Error("请先上传商品图片");
    const assetId = await uploadImageFile(file);
    setResolvedAssetId(assetId);
    return assetId;
  };

  const openLibrary = async () => {
    setLibraryOpen(true); setAssetsLoading(true); setError("");
    try {
      const body = await imageRequest<{ assets?: Asset[] }>("/api/assets/?kind=ALL", { cache: "no-store" });
      setAssets((body.assets || []).filter((asset: Asset) => asset.mimeType.startsWith("image/")));
    } catch { setError("素材库加载失败，请稍后重试"); }
    finally { setAssetsLoading(false); }
  };

  const selectAsset = (asset: Asset) => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(null); setSelectedAsset(asset); setResolvedAssetId(asset.id); setPreview(asset.url); setLibraryOpen(false);
    setPlans([]); setCards([]); setSelectedPlanId(""); setStage("brief"); setTask(null); setPhase("idle"); setError("");
  };

  const generatePlans = async () => {
    if (!preview || busy) return;
    setError(""); setTask(null); setPhase(file && !resolvedAssetId ? "uploading" : "planning");
    try {
      const assetId = await uploadSource();
      setPhase("planning");
      const body = await imageRequest<{ plans: unknown; productUnderstanding?: string }>("/api/workflows/detail-page-plan/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, productDescription, mode: props.workflowKey === "recreate-detail-page" ? "recreate" : "original" }),
      });
      const nextPlans = normalizeDetailPlans(body.plans);
      if (nextPlans.length !== 3) throw new Error("方案结构不完整，请重新生成");
      setPlans(nextPlans); setProductUnderstanding(typeof body.productUnderstanding === "string" ? body.productUnderstanding : "");
      setSelectedPlanId(""); setCards([]); setStage("plans"); setPhase("idle");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "方案生成失败"); setPhase("failed"); }
  };

  const choosePlan = (plan: DetailPagePlan) => {
    setSelectedPlanId(plan.id);
    setCards(plan.cards.map((card) => ({ ...card, id: crypto.randomUUID() })));
    setStage("cards"); setError("");
  };

  const updateCard = (index: number, field: keyof DetailPageCard, value: string) => setCards((current) => current.map((card, cardIndex) => cardIndex === index ? { ...card, [field]: value } : card));
  const moveCard = (index: number, offset: -1 | 1) => setCards((current) => {
    const target = index + offset;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const submit = async () => {
    const normalized = normalizeDetailCards(cards);
    if (normalized.length < DETAIL_PAGE_MIN_CARDS || busy) return setError(`请至少保留 ${DETAIL_PAGE_MIN_CARDS} 张内容完整的卡片`);
    setError(""); setTask(null); setPhase("uploading");
    try {
      const assetId = await uploadSource();
      const body = await imageRequest<{ taskId: string }>(props.submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ assetId, prompt: productDescription, productDescription, aspectRatio: ratio, detailCards: normalized, draftId: projectId }),
      });
      setCards(normalized); setPhase("generating"); setStage("results");
      await pollImageTask(body.taskId, setTask, 10 * 60 * 1000);
      setPhase("succeeded"); setStage("results");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败"); setPhase("failed"); }
  };

  const applyCase = (item: ImageWorkflowCase) => {
    if (item.productDescription) setProductDescription(item.productDescription.slice(0, 900));
  };

  const resultCards = useMemo(() => {
    const fromTask = normalizeDetailCards(task?.inputSummary?.detailCards);
    return fromTask.length ? fromTask : cards;
  }, [cards, task?.inputSummary?.detailCards]);

  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  const canAfford = account.user.isAdministrator || account.wallet.availablePoints >= props.pointsPerTask;

  return <main className="detail-studio-page">
    <button className="yh-back-button" type="button" onClick={() => router.push("/tools")}><ArrowLeft size={16} />返回图片创作</button>
    <header className="detail-studio-header">
      <div><span>{props.workflowKey === "recreate-detail-page" ? "原创复刻工作流" : "详情页套图工作流"}</span><h1>{props.title}</h1><p>{props.description}</p></div>
      <ol>{["商品与方向", "选择方案", "编排与生成"].map((label, index) => <li className={currentStep >= index + 1 ? "active" : ""} key={label}><span>{index + 1}</span>{label}</li>)}</ol>
    </header>

    <div className="detail-studio-layout">
      <aside className="detail-studio-sidebar">
        <section>
          <header><ImagePlus size={16} /><strong>商品素材</strong></header>
          {!preview ? <><div className="yh-upload-tabs"><span className="active"><Upload size={14} />本地上传</span><button type="button" onClick={openLibrary}><FolderOpen size={14} />资产库</button></div><label className="yh-upload-drop compact"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /><span><Upload size={22} /></span><strong>{props.sourceTitle}</strong><small>{props.sourceHint}</small></label></> : <div className="detail-source-preview"><img src={preview} alt="商品素材" /><button type="button" aria-label="更换商品图片" onClick={() => { setFile(null); setSelectedAsset(null); setResolvedAssetId(""); setPreview(""); setPlans([]); setCards([]); setStage("brief"); }}><X size={14} /></button></div>}
        </section>
        <label className="yh-field wide">{props.productDescriptionLabel}<textarea value={productDescription} onChange={(event) => setProductDescription(event.target.value)} maxLength={900} placeholder={props.productDescriptionPlaceholder} /><small>{productDescription.length}/900</small></label>
        <ImageAspectRatioControl value={ratio} options={ratios} onChange={setRatio} disabled={busy} required={false} />
        <button className="detail-primary-action" type="button" disabled={!preview || busy} onClick={generatePlans}>{phase === "uploading" || phase === "planning" ? <LoaderCircle className="generation-spinner" size={16} /> : <Wand2 size={16} />}{phase === "uploading" ? "正在上传商品" : phase === "planning" ? "正在策划三套方案" : plans.length ? "重新生成方案" : "生成 A / B / C 方案"}</button>
        <p className="yh-credit"><Sparkles size={14} />{account.user.isAdministrator ? `管理员免积分 · 报价 ${props.pointsPerTask} 积分` : `整套生成预估 ${props.pointsPerTask} 积分`}</p>
        {error && <p className="creator-error" role="alert">{error}</p>}
      </aside>

      <section className="detail-studio-workspace">
        {stage === "brief" && <><header><div><span>案例参考</span><h2>先确定商品的表达方向</h2></div><p>上传商品后，AI 会识别商品并给出三套不同结构方案。</p></header><div className="detail-case-grid">{props.cases.map((item) => <article key={item.id}><img src={item.image} alt={item.title} /><div><span>{item.tag}</span><strong>{item.title}</strong><button type="button" onClick={() => applyCase(item)}><Wand2 size={14} />参考这个方向</button></div></article>)}</div></>}

        {stage === "plans" && <><header><div><span>方案选择</span><h2>选择一套详情页叙事结构</h2></div><p>{productUnderstanding || "已结合商品图片和补充信息生成方案。"}</p></header><div className="detail-plan-grid">{plans.map((plan) => <article key={plan.id}><div><span>{plan.label}</span><em>{plan.cards.length} 张卡片</em></div><h3>{plan.title}</h3><p>{plan.strategy}</p><small>适合：{plan.suitableFor}</small><ol>{plan.cards.map((card, index) => <li key={card.id}><b>{index + 1}</b><span><strong>{card.role}</strong>{card.title}</span></li>)}</ol><button type="button" onClick={() => choosePlan(plan)}>选择并编辑这套方案</button></article>)}</div></>}

        {stage === "cards" && <><header><div><span>{selectedPlan?.label || "卡片编排"}</span><h2>{selectedPlan?.title || "编辑详情页卡片"}</h2></div><div className="detail-workspace-actions"><button type="button" onClick={() => setStage("plans")}>返回选方案</button><button type="button" disabled={!preview || !canAfford || busy || cards.length < DETAIL_PAGE_MIN_CARDS} onClick={submit}><Wand2 size={15} />{canAfford ? `生成整套 ${cards.length} 张` : "积分不足"}</button></div></header><div className="detail-card-editor">{cards.map((card, index) => <article key={card.id} data-detail-card-id={card.id}><div className="detail-card-order"><span>{String(index + 1).padStart(2, "0")}</span><div><button type="button" aria-label="上移卡片" disabled={index === 0} onClick={() => moveCard(index, -1)}><ArrowUp size={14} /></button><button type="button" aria-label="下移卡片" disabled={index === cards.length - 1} onClick={() => moveCard(index, 1)}><ArrowDown size={14} /></button><button type="button" aria-label="删除卡片" disabled={cards.length <= DETAIL_PAGE_MIN_CARDS} onClick={() => setCards((current) => current.filter((_, cardIndex) => cardIndex !== index))}><Trash2 size={14} /></button></div></div><div className="detail-card-fields"><label>卡片作用<input value={card.role} maxLength={40} onChange={(event) => updateCard(index, "role", event.target.value)} /></label><label>主标题<input aria-label="卡片主标题" value={card.title} maxLength={36} onChange={(event) => updateCard(index, "title", event.target.value)} /></label><label className="wide">辅助文案<textarea value={card.subtitle} maxLength={90} onChange={(event) => updateCard(index, "subtitle", event.target.value)} /></label><label className="wide">画面描述<textarea value={card.visualPrompt} maxLength={360} onChange={(event) => updateCard(index, "visualPrompt", event.target.value)} /></label></div></article>)}{cards.length < DETAIL_PAGE_MAX_CARDS && <button className="detail-add-card" type="button" onClick={() => setCards((current) => [...current, newCard(current.length)])}><Plus size={16} />新增一张卡片</button>}</div></>}

        {stage === "results" && <><header><div><span>生成结果</span><h2>{props.title}</h2></div>{phase === "succeeded" && <button className="detail-edit-again" type="button" onClick={() => setStage("cards")}>修改卡片后重新生成</button>}</header>{phase === "uploading" || phase === "generating" ? <GenerationProgress phase={phase === "uploading" ? "uploading" : "generating"} taskStatus={task?.status} title={props.title} outputCount={cards.length} /> : null}<TemporaryResultNotice result={task} />{task?.outputs.length ? <div className="detail-result-list">{task.outputs.map((output, index) => { const card = resultCards[index]; return <article key={output.assetId}><img src={output.url} alt={`${props.title} ${index + 1}`} /><div><span>第 {index + 1} 张 · {card?.role || "详情卡片"}</span><h3>{card?.title || `详情卡片 ${index + 1}`}</h3>{card?.subtitle && <p>{card.subtitle}</p>}<GeneratedAssetActions output={output} onSaved={markSaved} /><button type="button" className="detail-card-revise" onClick={() => { if (card?.id) setFocusedCardId(card.id); setStage("cards"); }}>修改这张卡片</button></div></article>; })}</div> : phase === "failed" ? <div className="detail-empty"><strong>任务未完成</strong><p>{error || task?.errorCode || "请返回卡片编排后重试"}</p></div> : null}</>}
      </section>
    </div>

    {libraryOpen && <div className="asset-picker-backdrop" role="dialog" aria-modal="true" aria-label="选择图片素材"><section className="asset-picker-modal"><header><div><span>内容资产</span><h2>选择商品图片</h2></div><button type="button" className="icon-button" onClick={() => setLibraryOpen(false)}><X size={18} /></button></header>{assetsLoading ? <div className="asset-picker-empty"><LoaderCircle size={22} />正在加载素材</div> : assets.length ? <div className="asset-picker-grid">{assets.map((asset) => <button type="button" key={asset.id} onClick={() => selectAsset(asset)}><img src={asset.url} alt="" /><strong>{asset.originalName}</strong><small>{asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</small></button>)}</div> : <div className="asset-picker-empty"><FolderOpen size={25} /><strong>暂无图片素材</strong></div>}</section></div>}
  </main>;
}
