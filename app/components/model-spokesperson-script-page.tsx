"use client";

import {
  ArrowLeft,
  Check,
  Clipboard,
  FileText,
  ImagePlus,
  Layers3,
  LoaderCircle,
  MicVocal,
  Upload,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  WandSparkles,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { VideoGenerationProgress } from "@/app/components/video-generation-progress";
import {
  getTaskStatus,
  loadImageForCanvas,
  resolveAssetPreviewUrl,
  uploadRecreateItem,
  type FaceMaskRegion,
  type Item,
} from "@/app/features/recreate-video";

type Account = {
  user: { isAdministrator?: boolean };
  wallet: { availablePoints: number };
};
type Segment = {
  id: string;
  stage: string;
  timeRange: string;
  narration: string;
  visual: string;
};
type ScriptResult = {
  status: string;
  draftId: string;
  title: string;
  durationSeconds: number;
  tone: string;
  segments: Segment[];
  alternativeOpeners: string[];
  generatedAt: string;
};
type ScriptPlan = {
  id: string;
  label: string;
  title: string;
  angle: string;
  storyArc?: string;
  actionBeats?: string[];
  sellingPointSummary: string[];
  modelDirection: string;
  productDirection: string;
  internalPrompt: string;
  script: ScriptResult;
};
type DirectorBrief = {
  audience: string;
  usageScene: string;
  valueFocus: string;
  storyStyle: string;
  peopleMode: "no_people" | "hands_or_back" | "spokesperson";
  productUnderstanding: string;
};
type DirectorChatMessage = {
  role: "assistant" | "user";
  content: string;
  quickReplies?: string[];
};
type Draft = {
  productName: string;
  productBrief: string;
  tone: string;
  duration: number;
  generateAudio: boolean;
  directorBrief: DirectorBrief;
  directorMessages?: DirectorChatMessage[];
  productImages: Array<{
    id: string;
    name: string;
    preview: string;
    byteSize: number;
    assetId?: string;
  }>;
  stageAssets: Partial<Record<SpokespersonStage, StageAsset>>;
  modelSource: StageAsset | null;
  modelSourceMode: ModelSourceMode;
  plans: ScriptPlan[];
  selectedPlanId: string;
  result: ScriptResult | null;
  videoPack: VideoPack | null;
};
type VideoPack = {
  status: string;
  draftId: string;
  title: string;
  selectedPlanId: string;
  selectedPlanLabel: string;
  productMultiview: {
    summary: string;
    views: Array<{ name: string; purpose: string; prompt: string; note: string }>;
  };
  modelRecommendation: {
    mode: "auto" | "asset_library" | "blurred_reference";
    label: string;
    reason: string;
    maskingAdvice: string;
  };
  storyboard: {
    summary: string;
    frames: Array<{
      index: number;
      timeRange: string;
      scene?: string;
      intent?: string;
      visual: string;
      camera: string;
      narration: string;
      assetUse: string;
    }>;
  };
  bindings: Array<{
    segmentId: string;
    timeRange: string;
    narration: string;
    frameIndexes: number[];
    note: string;
  }>;
  finalPrompt: string;
  generatedAt: string;
};
type VideoTask = {
  taskId?: string;
  status: string;
  errorCode?: string;
  outputs?: Array<{ assetId: string; mimeType?: string; name?: string; url: string }>;
};
type StageAsset = {
  assetId: string;
  url: string;
  mimeType?: string;
  name?: string;
};
type SpokespersonStage = "productMultiview" | "modelReference" | "storyboard";
type StageTask = VideoTask & { stage: SpokespersonStage };
type SpokespersonCase = {
  id: string;
  title: string;
  tag: string;
  image: string;
  description: string;
  productName: string;
  sellingPoints: string;
  audience: string;
  usageScene: string;
  callToAction: string;
  tone: string;
  duration: number;
};
type ProductImage = Item & { id: string };
type LibraryAsset = {
  id: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  url: string;
};
type ModelSourceMode = "auto" | "upload" | "library";
type WorkflowStep = "brief" | "plans" | "assets" | "generate";

const draftStorageKey = "aigc-model-spokesperson-script-draft";
const systemRecommended = "系统推荐";
const toneOptions = [
  ["auto", "智能匹配"],
  ["natural", "自然种草"],
  ["enthusiastic", "强带货"],
  ["professional", "专业讲解"],
];
const peopleModeOptions: Array<[DirectorBrief["peopleMode"], string]> = [
  ["no_people", "无真人"],
  ["hands_or_back", "手部/背影"],
  ["spokesperson", "真人讲解"],
];

const spokespersonCases: SpokespersonCase[] = [
  {
    id: "healthy-breakfast",
    title: "轻食早餐机口播脚本",
    tag: "文案案例",
    image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=86",
    description: "通勤人群、快手早餐、自然亲和口吻。",
    productName: "轻氧多功能早餐机",
    sellingPoints: "三分钟快速加热；煎烤蒸一体，小厨房也能放；不粘涂层，清洗省心；适合上班族快速准备早餐",
    audience: "通勤上班族、独居年轻人",
    usageScene: "早晨赶时间、办公室轻食、周末简单早餐",
    callToAction: "点击了解更多，今天就把早餐效率提起来",
    tone: "natural",
    duration: 15,
  },
  {
    id: "beauty-serum",
    title: "精华液种草口播脚本",
    tag: "文案案例",
    image: "https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=900&q=86",
    description: "美妆护肤、卖点拆解、专业讲解口吻。",
    productName: "维稳修护精华液",
    sellingPoints: "质地清爽不黏腻；适合换季干燥和屏障脆弱期；按压泵设计更卫生；妆前使用也不搓泥",
    audience: "关注维稳修护的护肤用户",
    usageScene: "晚间护肤、换季维稳、妆前打底",
    callToAction: "需要维稳修护的朋友可以先从这一瓶开始",
    tone: "professional",
    duration: 15,
  },
  {
    id: "travel-bag",
    title: "通勤包带货口播脚本",
    tag: "文案案例",
    image: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=86",
    description: "箱包容量、穿搭场景、热情带货口吻。",
    productName: "大容量通勤托特包",
    sellingPoints: "可以放下电脑、雨伞和化妆包；皮革纹理细腻，版型挺括；通勤、出差、周末逛街都能背；肩带宽，不容易勒肩",
    audience: "都市通勤女性、轻商务人群",
    usageScene: "上班通勤、短途出差、周末约会",
    callToAction: "喜欢实用又有质感的包，可以直接入手",
    tone: "enthusiastic",
    duration: 15,
  },
];

function scriptText(result: ScriptResult | null) {
  return result?.segments.map((segment) => segment.narration).join("\n") || "";
}

function estimateSeconds(characterCount: number) {
  return Math.max(1, Math.round(characterCount / 5.2));
}

function createBriefFromCase(item: SpokespersonCase) {
  return [
    item.sellingPoints,
    item.audience ? `目标人群：${item.audience}` : "",
    item.usageScene ? `使用场景：${item.usageScene}` : "",
    item.callToAction ? `行动引导：${item.callToAction}` : "",
  ].filter(Boolean).join("\n");
}

function splitSummaryPoints(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  if (typeof value !== "string") return [];
  return value
    .split(/[\n，,；;。]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeActionBeatText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [
    record.timeRange || record.time || record.duration,
    record.scene || record.environment || record.setting,
    record.action || record.motion || record.behavior,
    record.product || record.productPosition || record.assetUse,
    record.lens || record.camera || record.cameraShot,
    record.purpose || record.intent || record.goal,
  ].map((item) => String(item || "").trim()).filter(Boolean).join("；");
}

function normalizeDraftPlan(plan: ScriptPlan) {
  return {
    ...plan,
    sellingPointSummary: splitSummaryPoints(plan.sellingPointSummary),
    actionBeats: Array.isArray(plan.actionBeats)
      ? plan.actionBeats.map((beat) => normalizeActionBeatText(beat)).filter(Boolean).slice(0, 4)
      : [],
  };
}

function defaultDirectorBrief(): DirectorBrief {
  return {
    audience: systemRecommended,
    usageScene: systemRecommended,
    valueFocus: systemRecommended,
    storyStyle: systemRecommended,
    peopleMode: "no_people",
    productUnderstanding: "",
  };
}

export function ModelSpokespersonScriptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [projectTitle, setProjectTitle] = useState("模特口播项目");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [productName, setProductName] = useState("");
  const [productBrief, setProductBrief] = useState("");
  const [tone, setTone] = useState("auto");
  const [duration] = useState(15);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [directorBrief, setDirectorBrief] = useState<DirectorBrief>(() => defaultDirectorBrief());
  const [directorMessages, setDirectorMessages] = useState<DirectorChatMessage[]>([]);
  const [directorInput, setDirectorInput] = useState("");
  const [directorChatBusy, setDirectorChatBusy] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("brief");
  const [variant, setVariant] = useState(0);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [plans, setPlans] = useState<ScriptPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [videoPack, setVideoPack] = useState<VideoPack | null>(null);
  const [videoTask, setVideoTask] = useState<VideoTask | null>(null);
  const [stageTasks, setStageTasks] = useState<Partial<Record<SpokespersonStage, StageTask>>>({});
  const [stageAssets, setStageAssets] = useState<Partial<Record<SpokespersonStage, StageAsset>>>({});
  const [stageBusy, setStageBusy] = useState<SpokespersonStage | "">("");
  const [previewAsset, setPreviewAsset] = useState<StageAsset | null>(null);
  const [modelSourceMode, setModelSourceMode] = useState<ModelSourceMode>("auto");
  const [modelSource, setModelSource] = useState<StageAsset | null>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [modelUploading, setModelUploading] = useState(false);
  const [videoPhase, setVideoPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [busy, setBusy] = useState(false);
  const [directorBusy, setDirectorBusy] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [videoError, setVideoError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const productImagesRef = useRef<ProductImage[]>([]);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const applyDraft = (draft: Partial<Draft>) => {
      if (cancelled) return;
      setProductName(draft.productName || "");
      setProductBrief(draft.productBrief || "");
      if (typeof draft.generateAudio === "boolean") setGenerateAudio(draft.generateAudio);
      setDirectorBrief({ ...defaultDirectorBrief(), ...(draft.directorBrief || {}) });
      if (Array.isArray(draft.directorMessages)) setDirectorMessages(draft.directorMessages.slice(-12));
      if (["auto", "natural", "enthusiastic", "professional"].includes(draft.tone || "")) setTone(draft.tone!);
      if (Array.isArray(draft.productImages)) {
        setProductImages(
          draft.productImages
            .filter((image) => typeof image?.assetId === "string" && typeof image.preview === "string")
            .map((image) => ({ ...image, file: undefined })),
        );
      }
      if (draft.stageAssets && typeof draft.stageAssets === "object") setStageAssets(draft.stageAssets);
      if (draft.modelSource?.assetId && draft.modelSource.url) setModelSource(draft.modelSource);
      if (["auto", "upload", "library"].includes(draft.modelSourceMode || "")) setModelSourceMode(draft.modelSourceMode!);
      if (Array.isArray(draft.plans)) setPlans(draft.plans.map((plan) => normalizeDraftPlan(plan as ScriptPlan)));
      if (typeof draft.selectedPlanId === "string") setSelectedPlanId(draft.selectedPlanId);
      if (draft.result?.segments?.length) setResult(draft.result);
      if (draft.videoPack?.finalPrompt) setVideoPack(draft.videoPack);
    };

    const load = async () => {
      try {
        if (projectId) {
          const response = await fetch(`/api/workflow-drafts/${projectId}/`, { cache: "no-store" });
          const body = await response.json().catch(() => null);
          if (response.ok && body?.draft?.payload) {
            if (typeof body.draft.title === "string" && body.draft.title.trim()) setProjectTitle(body.draft.title);
            applyDraft(body.draft.payload as Partial<Draft>);
            return;
          }
        }
        const stored = localStorage.getItem(draftStorageKey);
        if (!stored) return;
        try {
          applyDraft(JSON.parse(stored) as Partial<Draft>);
        } catch {
          localStorage.removeItem(draftStorageKey);
        }
      } finally {
        if (!cancelled) setDraftHydrated(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    productImagesRef.current = productImages;
  }, [productImages]);

  useEffect(
    () => () => {
      productImagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview));
    },
    [],
  );

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;
  const fullScript = useMemo(() => scriptText(result), [result]);
  const characterCount = fullScript.replace(/\s/g, "").length;
  const estimatedSeconds = estimateSeconds(characterCount);
  const overTarget = !!result && estimatedSeconds > 15;
  const canGeneratePlans = (productName.trim().length > 0 || productBrief.trim().length > 0 || productImages.length > 0) && !busy;
  const productUnderstanding = useMemo(
    () =>
      [
        productName.trim() ? `商品：${productName.trim()}` : productImages.length ? "商品：已上传商品图，等待系统识别用途" : "",
        directorBrief.productUnderstanding.trim() ? `识别理解：${directorBrief.productUnderstanding.trim()}` : "",
        productBrief.trim() ? `用户补充：${productBrief.trim()}` : "用户补充：较少，系统需要自动推断广告方向",
        directorBrief.audience !== systemRecommended ? `目标用户：${directorBrief.audience}` : "目标用户：系统推荐",
        directorBrief.usageScene !== systemRecommended ? `使用场景：${directorBrief.usageScene}` : "使用场景：系统推荐",
        directorBrief.valueFocus !== systemRecommended ? `价值重点：${directorBrief.valueFocus}` : "价值重点：系统推荐",
        directorBrief.storyStyle !== systemRecommended ? `表达方式：${directorBrief.storyStyle}` : "表达方式：系统推荐",
      ].filter(Boolean).join("\n"),
    [directorBrief.audience, directorBrief.productUnderstanding, directorBrief.storyStyle, directorBrief.usageScene, directorBrief.valueFocus, productBrief, productImages.length, productName],
  );
  const showCaseReferences = workflowStep === "brief" && productImages.length === 0 && !productName.trim() && !productBrief.trim() && !result;
  const updateDirectorBrief = <Key extends keyof DirectorBrief>(key: Key, value: DirectorBrief[Key]) => {
    setDirectorBrief((current) => ({ ...current, [key]: value }));
    setPlans([]);
    setSelectedPlanId("");
    setResult(null);
    setVideoPack(null);
  };

  const draftValue = (): Draft => ({
    productName,
    productBrief,
    tone,
    duration,
    generateAudio,
    directorBrief,
    directorMessages,
    productImages: productImages.map(({ id, name, preview, byteSize, assetId }) => ({
      id,
      name,
      preview: assetId ? `/api/assets/${assetId}/download/` : preview,
      byteSize,
      assetId,
    })),
    stageAssets,
    modelSource,
    modelSourceMode,
    plans,
    selectedPlanId,
    result,
    videoPack,
  });

  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      const payload = draftValue();
      localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      if (projectId) {
        void fetch("/api/workflow-drafts/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: projectId,
            workflowKey: "model-spokesperson-script",
            title: projectTitle,
            payload,
          }),
        });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [directorBrief, directorMessages, draftHydrated, duration, generateAudio, modelSource, modelSourceMode, plans, productBrief, productImages, projectId, projectTitle, result, selectedPlanId, stageAssets, tone, videoPack]);

  const saveDraft = () => {
    localStorage.setItem(draftStorageKey, JSON.stringify(draftValue()));
    setNotice("讲稿草稿已保存在当前浏览器");
    window.setTimeout(() => setNotice(""), 2400);
  };

  const handleImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
      .filter((file) => file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024)
      .slice(0, Math.max(0, 4 - productImages.length));
    if (!files.length) return;
    event.target.value = "";
    setImageUploading(true);
    setError("");
    setNotice("正在保存商品图...");
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const localPreview = URL.createObjectURL(file);
          const item = {
            id: crypto.randomUUID(),
            name: file.name,
            preview: localPreview,
            file,
            byteSize: file.size,
          };
          const assetId = await uploadRecreateItem(item);
          URL.revokeObjectURL(localPreview);
          return { ...item, assetId, preview: `/api/assets/${assetId}/download/`, file: undefined };
        }),
      );
      setProductImages((current) => [...current, ...uploaded]);
      setNotice("商品图已保存到当前项目，刷新后会自动恢复");
      window.setTimeout(() => setNotice(""), 2400);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "商品图保存失败");
      setNotice("");
    } finally {
      setImageUploading(false);
    }
  };

  const removeImage = (id: string) =>
    setProductImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((image) => image.id !== id);
    });

  const loadAssets = async () => {
    setAssetsLoading(true);
    try {
      const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      const imageAssets = Array.isArray(body?.assets)
        ? body.assets.filter((asset: LibraryAsset) => asset.mimeType?.startsWith("image/")).slice(0, 24)
        : [];
      setAssets(imageAssets);
    } finally {
      setAssetsLoading(false);
    }
  };

  const chooseModelSourceMode = (mode: ModelSourceMode) => {
    setModelSourceMode(mode);
    if (mode === "library") void loadAssets();
    if (mode === "auto") setModelSource(null);
  };

  const handleModelFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(event.target.files || []).find((item) => item.type.startsWith("image/") && item.size <= 10 * 1024 * 1024);
    event.target.value = "";
    if (!file) return;
    setModelUploading(true);
    setVideoError("");
    try {
      const preview = URL.createObjectURL(file);
      const assetId = await uploadRecreateItem({ file, preview, name: file.name, byteSize: file.size });
      const url = await resolveAssetPreviewUrl(assetId, preview);
      if (url !== preview) URL.revokeObjectURL(preview);
      setModelSource({ assetId, url, mimeType: file.type, name: file.name });
      setModelSourceMode("upload");
      setNotice("模特源图已保存，生成模特参考时会优先使用");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setVideoError(caught instanceof Error ? caught.message : "模特源图上传失败");
    } finally {
      setModelUploading(false);
    }
  };

  const selectModelAsset = (asset: LibraryAsset) => {
    setModelSource({ assetId: asset.id, url: asset.url, mimeType: asset.mimeType, name: asset.originalName });
    setModelSourceMode("library");
    setNotice("已选择资产库模特图");
    window.setTimeout(() => setNotice(""), 1800);
  };

  const generatePlans = async (event?: FormEvent, nextVariant = variant) => {
    event?.preventDefault();
    if (!canGeneratePlans && !event) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workflows/model-spokesperson-script/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "plans",
          productName,
          sellingPoints: productBrief,
          directorBrief: { ...directorBrief, productUnderstanding },
          audience: "",
          usageScene: "",
          callToAction: "",
          tone: tone === "auto" ? "natural" : tone,
          duration,
          variant: nextVariant,
          productImageCount: productImages.length,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY" || !Array.isArray(body?.plans))
        throw new Error(body?.message || "口播方案生成失败");
      const normalizedPlans = body.plans.map((plan: ScriptPlan) => normalizeDraftPlan(plan));
      setPlans(normalizedPlans);
      setSelectedPlanId(normalizedPlans[0]?.id || "");
      setResult(normalizedPlans[0]?.script || null);
      setWorkflowStep("plans");
      setVideoPack(null);
      setVideoTask(null);
      setVideoPhase("idle");
      setVideoError("");
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          ...draftValue(),
          plans: normalizedPlans,
          selectedPlanId: normalizedPlans[0]?.id || "",
          result: normalizedPlans[0]?.script || null,
          videoPack: null,
        }),
      );
      setNotice("已生成 A/B/C 三套口播方案");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "口播方案生成失败");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => {
    const next = variant + 1;
    setVariant(next);
    void generatePlans(undefined, next);
  };

  const selectPlan = (plan: ScriptPlan) => {
    setSelectedPlanId(plan.id);
    setResult(plan.script);
    setVideoPack(null);
    setVideoTask(null);
    setVideoPhase("idle");
    setVideoError("");
      setNotice(`已选用 ${plan.label} 方案，可继续编辑讲稿`);
      setWorkflowStep("assets");
      window.setTimeout(() => setNotice(""), 1800);
  };

  const updateSegment = (id: string, narration: string) =>
    setResult((current) =>
      current
        ? {
            ...current,
            segments: current.segments.map((segment) =>
              segment.id === id ? { ...segment, narration } : segment,
            ),
          }
        : current,
    );

  const useOpener = (opener: string) =>
    setResult((current) =>
      current
        ? {
            ...current,
            segments: current.segments.map((segment, index) =>
              index === 0 ? { ...segment, narration: `${opener}，这是${productName}。` } : segment,
            ),
          }
        : current,
    );

  const applyCase = (item: SpokespersonCase) => {
    setProductName(item.productName);
    setProductBrief(createBriefFromCase(item));
    setDirectorBrief({
      ...defaultDirectorBrief(),
      audience: item.audience || systemRecommended,
      usageScene: item.usageScene || systemRecommended,
      valueFocus: systemRecommended,
      storyStyle: "场景痛点",
      peopleMode: "hands_or_back",
      productUnderstanding: `${item.productName}：${item.sellingPoints}`,
    });
    if (["natural", "enthusiastic", "professional"].includes(item.tone)) setTone(item.tone);
    setPlans([]);
    setSelectedPlanId("");
    setResult(null);
    setVideoPack(null);
    setVideoTask(null);
    setVideoPhase("idle");
    setVideoError("");
    setError("");
    setDirectorMessages([]);
    setNotice("案例参数已回填，可以生成 A/B/C 方案");
    window.setTimeout(() => setNotice(""), 1800);
  };

  const runDirectorChat = async (message: string) => {
    const userMessage = message.trim();
    if (!userMessage && !productImages.length && !productName.trim() && !productBrief.trim()) {
      setError("请先上传商品图，或简单说一下商品是什么");
      return;
    }
    const nextMessages: DirectorChatMessage[] = userMessage
      ? [...directorMessages, { role: "user", content: userMessage }]
      : directorMessages;
    setDirectorMessages(nextMessages);
    setDirectorInput("");
    setDirectorChatBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workflows/model-spokesperson-script/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "director_chat",
          productName,
          sellingPoints: productBrief,
          directorBrief: { ...directorBrief, productUnderstanding },
          messages: nextMessages,
          message: userMessage,
          productImageCount: productImages.length,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY") throw new Error(body?.message || "AI 导演对话失败");
      const nextBrief = { ...defaultDirectorBrief(), ...directorBrief, ...(body.directorBrief || {}) };
      setDirectorBrief(nextBrief);
      if (typeof body.productBriefSuggestion === "string" && body.productBriefSuggestion.trim() && !productBrief.trim()) {
        setProductBrief(body.productBriefSuggestion.trim());
      }
      setDirectorMessages([
        ...nextMessages,
        {
          role: "assistant" as const,
          content: String(body.reply || "我已更新导演理解，可以继续补充或生成方案。"),
          quickReplies: Array.isArray(body.quickReplies) ? body.quickReplies.slice(0, 5) : [],
        },
      ].slice(-12));
      setPlans([]);
      setSelectedPlanId("");
      setResult(null);
      setVideoPack(null);
      setNotice(body.readyToGenerate ? "导演意图已比较清楚，可以生成 A/B/C 方案" : "已更新导演理解，可继续校正");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 导演对话失败");
      setDirectorMessages(directorMessages);
    } finally {
      setDirectorChatBusy(false);
    }
  };

  const renderCaseReferences = () => (
    <aside className="spokesperson-case-board inline">
      <header>
        <span>
          <Sparkles size={17} />
        </span>
        <div>
          <h1>案例参考</h1>
          <p>做同款会回填商品描述</p>
        </div>
      </header>
      <div className="spokesperson-case-grid compact">
        {spokespersonCases.map((item) => (
          <article key={item.id}>
            <div className="spokesperson-case-media">
              <img src={item.image} alt={item.title} />
              <span>{item.tag}</span>
            </div>
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            <button type="button" onClick={() => applyCase(item)}>
              <WandSparkles size={15} />
              做同款
            </button>
          </article>
        ))}
      </div>
    </aside>
  );

  const analyzeDirectorBrief = async () => {
    if (!productImages.length && !productName.trim() && !productBrief.trim()) {
      setError("请先上传商品图，或填写商品名称/一句话描述");
      return;
    }
    setDirectorBusy(true);
    setError("");
    setNotice("");
    try {
      const uploadedImages = await Promise.all(
        productImages.map(async (image) => {
          const assetId = image.assetId || (image.file ? await uploadRecreateItem(image) : null);
          return assetId ? { ...image, assetId, preview: `/api/assets/${assetId}/download/`, file: undefined } : image;
        }),
      );
      setProductImages(uploadedImages);
      const assetIds = uploadedImages.map((image) => image.assetId).filter((id): id is string => Boolean(id));
      const response = await fetch("/api/workflows/model-spokesperson-script/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "director",
          productName,
          sellingPoints: productBrief,
          assetIds,
          productImageCount: uploadedImages.length,
          directorBrief: { ...directorBrief, productUnderstanding },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY" || !body?.directorBrief) {
        throw new Error(body?.message || "商品识别失败");
      }
      const nextBrief = { ...defaultDirectorBrief(), ...body.directorBrief } as DirectorBrief;
      setDirectorBrief(nextBrief);
      if (!productName.trim() && typeof body.productName === "string" && body.productName.trim()) setProductName(body.productName.trim());
      if (!productBrief.trim() && Array.isArray(body.sellingPoints) && body.sellingPoints.length) {
        setProductBrief(body.sellingPoints.join("；"));
      }
      setPlans([]);
      setSelectedPlanId("");
      setResult(null);
      setVideoPack(null);
      setVideoTask(null);
      setVideoPhase("idle");
      setNotice("已完成商品识别和导演推荐");
      setWorkflowStep("plans");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "商品识别失败");
    } finally {
      setDirectorBusy(false);
    }
  };

  const copyScript = async () => {
    if (!fullScript) return;
    await navigator.clipboard.writeText(fullScript);
    setNotice("完整口播讲稿已复制");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const generateVideoPack = async () => {
    if (!selectedPlan) {
      setVideoError("请先选择一个口播方案");
      return null;
    }
    if (!productImages.length) {
      setVideoError("请先上传至少一张商品图片");
      return null;
    }
    setPackBusy(true);
    setVideoError("");
    setVideoTask(null);
    setVideoPhase("idle");
    try {
      const response = await fetch("/api/workflows/model-spokesperson-script/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "pack",
          productName,
          sellingPoints: productBrief,
          tone: tone === "auto" ? "natural" : tone,
          duration,
          productImageCount: productImages.length,
          directorBrief: { ...directorBrief, productUnderstanding },
          selectedPlan,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY" || !body?.pack?.finalPrompt) {
        throw new Error(body?.message || "视频任务包生成失败");
      }
      setVideoPack(body.pack);
      setWorkflowStep("assets");
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          ...draftValue(),
          videoPack: body.pack,
        }),
      );
      setNotice("视频任务包已生成");
      window.setTimeout(() => setNotice(""), 1800);
      return body.pack as VideoPack;
    } catch (caught) {
      setVideoError(caught instanceof Error ? caught.message : "视频任务包生成失败");
      return null;
    } finally {
      setPackBusy(false);
    }
  };

  const traceStage = (stage: string, details: Record<string, unknown>) => {
    void fetch("/api/workflows/model-spokesperson-script/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "trace", stage, details }),
    }).catch(() => undefined);
  };

  const analyzeFaceMaskRegions = async (assetId?: string): Promise<FaceMaskRegion[]> => {
    if (!assetId) return [];
    const response = await fetch("/api/workflows/recreate-face-mask-analysis/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    }).catch(() => null);
    if (!response?.ok) return [];
    const body = await response.json().catch(() => null);
    return Array.isArray(body?.faceRegions)
      ? body.faceRegions
          .map((region: Partial<FaceMaskRegion>) => ({
            x: Number(region.x),
            y: Number(region.y),
            width: Number(region.width),
            height: Number(region.height),
            confidence: Number(region.confidence) || 0.5,
            view: typeof region.view === "string" ? region.view : "",
          }))
          .filter((region: FaceMaskRegion) =>
            [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
            region.width > 0 &&
            region.height > 0,
          )
          .slice(0, 24)
      : [];
  };

  const drawFaceMask = (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    variant: number,
  ) => {
    const maskX = Math.max(0, x + width * 0.08);
    const maskY = Math.max(0, y + height * 0.08);
    const maskWidth = Math.min(context.canvas.width - maskX, width * 0.84);
    const maskHeight = Math.min(context.canvas.height - maskY, height * 0.68);
    if (maskWidth <= 1 || maskHeight <= 1) return;

    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.ceil(maskWidth));
    source.height = Math.max(1, Math.ceil(maskHeight));
    source.getContext("2d")?.drawImage(context.canvas, maskX, maskY, maskWidth, maskHeight, 0, 0, source.width, source.height);

    context.save();
    context.filter = `blur(${Math.max(0.35, Math.min(1.1, maskWidth / 260))}px)`;
    context.drawImage(source, 0, 0, source.width, source.height, maskX, maskY, maskWidth, maskHeight);
    context.restore();

    const partials = [
      { x: 0.18, y: 0.04, width: 0.64, height: 0.18 },
      { x: 0.16, y: 0.3, width: 0.68, height: 0.16 },
      { x: 0.26, y: 0.45, width: 0.48, height: 0.18 },
      { x: 0.28, y: 0.68, width: 0.44, height: 0.16 },
      { x: 0.1, y: 0.38, width: 0.22, height: 0.26 },
      { x: 0.68, y: 0.38, width: 0.22, height: 0.26 },
    ];
    const partial = partials[variant % partials.length];
    const partialX = maskX + maskWidth * partial.x;
    const partialY = maskY + maskHeight * partial.y;
    const partialWidth = maskWidth * partial.width;
    const partialHeight = maskHeight * partial.height;
    const block = Math.max(3, Math.min(partialWidth, partialHeight) / 7);
    for (let yy = partialY; yy < partialY + partialHeight; yy += block) {
      for (let xx = partialX; xx < partialX + partialWidth; xx += block) {
        const tone = 225 + ((Math.floor(xx / block) + Math.floor(yy / block) + variant) % 3) * 8;
        context.fillStyle = `rgba(${tone}, ${tone}, ${Math.min(255, tone + 4)}, 0.22)`;
        context.fillRect(xx, yy, block + 1, block + 1);
      }
    }
    context.fillStyle = "rgba(255, 255, 255, 0.1)";
    context.fillRect(partialX, partialY, partialWidth, partialHeight);
    context.strokeStyle = "rgba(15, 23, 42, 0.12)";
    context.lineWidth = Math.max(1, partialWidth / 50);
    context.strokeRect(partialX, partialY, partialWidth, partialHeight);
  };

  const fallbackFaceRegions = (width: number, height: number) => {
    const landscape = width >= height;
    const columns = landscape ? 4 : 2;
    const rows = landscape ? 2 : 4;
    const regions: FaceMaskRegion[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        regions.push({
          x: column / columns + 0.35 / columns,
          y: row / rows + 0.15 / rows,
          width: 0.3 / columns,
          height: 0.16 / rows,
          confidence: 0.2,
          view: "fallback",
        });
      }
    }
    return regions;
  };

  const createFaceMaskedReferenceAsset = async (source: StageAsset) => {
    const image = await loadImageForCanvas(source.url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("模特遮挡处理失败");
    context.drawImage(image, 0, 0);
    const detectedRegions = await analyzeFaceMaskRegions(source.assetId);
    const regions = detectedRegions.length ? detectedRegions : fallbackFaceRegions(canvas.width, canvas.height);
    regions.forEach((region, index) =>
      drawFaceMask(
        context,
        region.x * canvas.width,
        region.y * canvas.height,
        region.width * canvas.width,
        region.height * canvas.height,
        index,
      ),
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("模特遮挡图导出失败");
    const file = new File([blob], "spokesperson-model-reference-masked.jpg", { type: "image/jpeg" });
    const preview = URL.createObjectURL(file);
    const assetId = await uploadRecreateItem({ file, preview, name: "已遮挡模特参考", byteSize: file.size });
    const url = await resolveAssetPreviewUrl(assetId, preview);
    if (url !== preview) URL.revokeObjectURL(preview);
    return { assetId, url, mimeType: "image/jpeg", name: "已遮挡模特参考" };
  };

  const generateStage = async (stage: SpokespersonStage) => {
    if (!selectedPlan) {
      setVideoError("请先选择一个口播方案");
      return;
    }
    if (!productImages.length) {
      setVideoError("请先上传至少一张商品图片");
      return;
    }
    const pack = videoPack || (await generateVideoPack());
    if (!pack) return;
    const originalAssetIds = productImages.map((image) => image.assetId).filter((id): id is string => Boolean(id));
    const sourceIds =
      stage === "productMultiview"
        ? originalAssetIds
        : stage === "modelReference"
          ? [modelSource?.assetId || stageAssets.productMultiview?.assetId || originalAssetIds[0]].filter((id): id is string => Boolean(id))
          : [stageAssets.productMultiview?.assetId, stageAssets.modelReference?.assetId, originalAssetIds[0]].filter(
              (id): id is string => Boolean(id),
            );
    if (!sourceIds.length) {
      setVideoError("阶段素材还没有准备好，请先完成上一步");
      return;
    }
    const stagePrompt =
      stage === "productMultiview"
        ? [
            "商品多视图阶段。只生成同一款真实商品本体参考板，不生成广告场景图。",
            `商品名称仅作为识别线索：${productName || "用户上传商品"}`,
            "必须包含正面、左右45度、侧面、背面、顶部或底部、材质/功能细节、接口/按键/结构细节。",
            "背景必须是纯白、浅灰或干净摄影棚背景；不要放入客厅、厨房、办公室、户外、租房、展会、人物手部或任何故事场景。",
            "保持产品轮廓、材质、颜色、接口、按键、Logo位置和比例一致；不得因为用户输入的使用场景改变商品造型、材质或摆放环境。",
            "不要生成真人，不要生成文字、标签、编号、价格或水印。",
            pack.productMultiview.summary,
          ].join("\n")
        : stage === "modelReference"
          ? directorBrief.peopleMode === "no_people"
            ? [
                "任务类型：商品场景导演参考板，不是人物模特图生成。",
                "根据商品多视图、用户商品描述和导演问答，生成一张 16:9 商品广告场景参考板。",
                "画面必须以商品、空间、安装/摆放关系、使用前后变化、材质细节和镜头路径为主；不要生成真人、清晰人脸、模特、角色设定或口播人物。",
                "参考板需要包含：主场景大图、商品安装/摆放位置、空间远景、商品近景、功能/材质细节、使用前后对比、收尾效果氛围。",
                "必须讲清楚商品在什么场景里解决什么问题，以及它的价值如何通过画面被看见。",
                "禁止生成字幕、编号、可读文字、Logo、水印、价格贴纸。",
                `导演问答：目标用户=${directorBrief.audience}；使用场景=${directorBrief.usageScene}；价值重点=${directorBrief.valueFocus}；故事表达=${directorBrief.storyStyle}`,
                productUnderstanding,
                pack.modelRecommendation.reason,
              ].join("\n")
            : [
              "任务类型：模特/人物多视图参考，不是商品图生成。",
              modelSource
                ? "用户已提供模特源图：必须以该模特图作为人物身份、发型轮廓、身形比例、穿搭气质和姿态气质的强参考。"
                : "用户未提供模特源图：请生成一位隐私安全、真实摄影质感的原创虚拟真人模特。",
              "主体锁定规则：只要输入图里出现真人、模特、人体轮廓、头发、脸、手臂、腿或穿在人身上的服装，就必须把完整人物/模特作为唯一主主体；衣服、裙子、包、鞋只是人物身上的附着物。",
              "创建一张 16:9 真实摄影棚多机位试衣参考图，像同一位真人模特在白色摄影棚完成一次 fitting 拍摄后整理出的 contact sheet；必须是真人摄影质感，真实皮肤纹理、真实布料、自然站姿、相机透视和棚拍柔光，不能是动漫、插画、手绘、3D 渲染、游戏建模、瓷娃娃、塑料皮肤或概念设定图。",
              "先提取身份锚点：脸型外轮廓、脸长脸宽比例、下颌线、颧骨位置、额头高度、眼距、眼型大致走向、鼻梁长度、鼻头宽度、嘴型厚度、肤色与年龄感、身材比例、体态、发型轮廓和穿搭关系；不要继承原图背景、光线、拍摄角度或当下表情。",
              "请以输入人物脸部结构和五官相对位置为强参考，生成一位隐私安全的相似虚拟真人模特：脸型、五官比例、发型轮廓、身形比例和姿态气质要接近输入，不要换成通用网红脸、瓷娃娃脸、AI 模特脸、游戏角色脸或完全陌生的漂亮脸。",
              "即使输入图只有裙子、衣服或局部穿搭，也必须补全为完整虚拟真人模特：头部、肩颈、躯干、手臂、腿部、脚部都要出现。",
              "第一步必须先生成完整头部和完整脸部轮廓：脸型外轮廓、头发轮廓、额头、眼鼻口的大致位置关系需要存在，不能省略头部，不能把头部画成空白块、无脸人或裁掉。",
              "人物身份必须隐私安全，不要逐像素复制真实五官；但必须保留输入人物可用于参考的脸型轮廓、五官相对比例、年龄感、发型轮廓和头身比例，整体相似度优先于美化。",
              "布局像专业电商真人模特试衣拍摄的照片 contact sheet：中央一个真实棚拍全身正面站姿大图，旁边包含背面全身、侧面全身、3/4 角度全身、上半身近景、服装材质/裙摆细节和 2-3 张自然头肩近景。不要使用黑色剪影研究、角色设定轮廓稿、建模三视图或游戏资产展示。",
              "脸部/头部近景控制在 2-3 个即可：正面头肩近景、3/4 头肩近景、可选侧面头肩近景；这些近景必须像真实相机拍摄，有皮肤细节、发丝层次、轻微镜头景深和自然光影，不要磨皮过度，不要生成蜡像感。",
              "每个视角都必须是同一位相似虚拟真人模特，保持相同脸型轮廓、眼距鼻型嘴型比例、发型轮廓、身体比例、服装轮廓和姿态气质；每个视角都要清晰分离，不要重叠，不要像拼贴插画。",
              "每个主要视图都必须是衣服穿在模特身上的效果，不允许出现空心裙、衣架、平铺服装、单件裙子、商品白底图或只有服装没有人体。",
              "如果输出结果只有衣服、长裙、服装商品图、空白分格或没有人体，则方向错误，必须重新生成完整人物多视图。",
              "禁止输出单件服装多视图、商品展示图、裙子独立展示图、3D 模型渲染、AI 娃娃脸、过度对称五官、塑料皮肤、游戏角色、二次元、插画或设计稿。",
              "不要在生图阶段提前遮挡脸部；生成完成后由系统二次做极轻微模糊，并按不同脸部小图局部遮挡额头、眼睛、鼻口、下巴或脸颊中的某一小部分，五官比例仍可辨认但真实身份不清晰，保留脸型、发型和头部轮廓。",
              "背景为真实白色或浅灰摄影棚无缝纸，柔和棚拍阴影，画面干净但不要过度留白；整张图像是一张真实电商模特多机位参考图，适合作为后续视频口播动作和人体姿态参考使用。",
              pack.modelRecommendation.reason,
            ].join("\n")
          : [
              "12格分镜参考阶段。把已生成的商品多视图、模特参考和商品原图综合为一张清晰的 4 列 x 3 行连续故事分镜板。",
              "版式顺序硬规则：画面必须是 4 列 x 3 行；阅读顺序必须从左到右、从上到下，第一行是第1-4格，第二行是第5-8格，第三行是第9-12格；不要蛇形排列，不要乱序，不要交换镜头。",
              "禁止在图像中写任何数字、序号、角标、箭头、字幕、对白文字、口播文字、标题、标签、水印、Logo、价格、贴纸或可读字符；顺序只能通过画面连续性体现，不能通过写编号体现。",
              "每一格都必须有人物、商品和具体场景关系，不能空场，不能只生成商品静物，不能只站着指向商品。",
              directorBrief.peopleMode === "no_people"
                ? "人物参与规则：用户选择无真人；12 宫格不要出现真人、模特或清晰人脸，改用商品、空间、安装/摆放关系、镜头路径和场景前后变化讲故事。"
                : directorBrief.peopleMode === "hands_or_back"
                  ? "人物参与规则：只能出现手部、背影、安装动作或局部操作，不要出现可识别人脸。"
                  : "人物参与规则：可以出现讲解者动作，但避免清晰可识别人脸，重点仍是商品和场景。",
              "这不是普通动作列表，而是一条 15 秒小广告：先建立生活场景和问题，再引出商品，再展示细节/使用过程，再给出效果反馈，最后自然收尾。",
              "每格都要表现连续的身体重心、手势、商品展示方向、情绪变化和镜头运动；人物必须是同一位隐私安全虚拟模特，商品外观必须和商品多视图一致。",
              "口播内容只作为内部节奏绑定，不能画进分镜图；不要生成字幕。",
              pack.storyboard.frames
                .map((frame) =>
                  [
                    `第${frame.index}格 ${frame.timeRange}`,
                    frame.scene ? `场景=${frame.scene}` : "",
                    frame.intent ? `目的=${frame.intent}` : "",
                    `画面=${frame.visual}`,
                    `动作镜头=${frame.camera}`,
                    `内部口播节奏参考=${frame.narration}，不要写入画面`,
                  ].filter(Boolean).join("；"),
                )
                .join("\n"),
            ].join("\n");
    setStageBusy(stage);
    setVideoError("");
    setStageTasks((current) => ({ ...current, [stage]: { stage, status: "QUEUED" } }));
    traceStage("stage_started", { stage, sourceIds, productName, selectedPlanId });
    try {
      const response = await fetch("/api/tasks/recreate-reference/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          draftId: projectId,
          assetIds: sourceIds,
          aspectRatio: "16:9",
          scene: stage === "productMultiview" ? "商品多视图" : stage === "modelReference" ? (directorBrief.peopleMode === "no_people" ? "场景导演参考" : "人物多视图") : "场景多视图",
          style: stage === "modelReference" ? (directorBrief.peopleMode === "no_people" ? "商品场景" : "隐私遮挡") : "参考板",
          prompt: stagePrompt,
        }),
      });
      const created = await response.json().catch(() => null);
      if (!response.ok || !created?.taskId) throw new Error(created?.message || "阶段任务创建失败");
      traceStage("stage_task_created", { stage, taskId: created.taskId });
      const deadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < deadline) {
        const task = await getTaskStatus(created.taskId);
        setStageTasks((current) => ({ ...current, [stage]: { ...task, stage } }));
        if (task.status === "SUCCEEDED" && task.outputs?.[0]) {
          const output = task.outputs[0];
          const generatedAsset = { assetId: output.assetId, url: output.url, mimeType: output.mimeType, name: output.name };
          const asset = stage === "modelReference" && directorBrief.peopleMode !== "no_people" ? await createFaceMaskedReferenceAsset(generatedAsset) : generatedAsset;
          setStageAssets((current) => ({ ...current, [stage]: asset }));
          if (stage === "storyboard") setWorkflowStep("generate");
          traceStage("stage_succeeded", {
            stage,
            taskId: created.taskId,
            assetId: asset.assetId,
            sourceAssetId: output.assetId,
            mimeType: asset.mimeType || output.mimeType || "",
            faceMasked: stage === "modelReference",
          });
          setNotice(stage === "productMultiview" ? "商品多视图已生成" : stage === "modelReference" ? "模特参考已生成并完成遮挡" : "12格分镜图已生成");
          return asset;
        }
        if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) {
          throw new Error(task.errorCode || "阶段生成失败");
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      throw new Error("阶段任务仍在生成中，请稍后在任务中心查看");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "阶段生成失败";
      setStageTasks((current) => ({ ...current, [stage]: { stage, status: "FAILED", errorCode: message } }));
      setVideoError(message);
      traceStage("stage_failed", { stage, message });
    } finally {
      setStageBusy("");
    }
  };

  const pollVideoTask = async (taskId: string) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    setVideoPhase("generating");
    while (Date.now() < deadline) {
      const task = await getTaskStatus(taskId);
      setVideoTask(task);
      if (task.status === "SUCCEEDED") {
        setVideoPhase("succeeded");
        return task;
      }
      if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) {
        setVideoPhase("failed");
        throw new Error(task.errorCode || "视频生成失败");
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    setVideoPhase("failed");
    throw new Error("视频仍在生成中，请稍后在任务中心查看");
  };

  const submitVideo = async () => {
    if (!selectedPlan) {
      setVideoError("请先选择一个口播方案");
      return;
    }
    if (!stageAssets.storyboard) {
      setVideoError("请先依次生成商品多视图、模特参考和12格分镜图");
      return;
    }
    setSubmitBusy(true);
    setVideoError("");
    try {
      const pack = videoPack || (await generateVideoPack());
      if (!pack?.finalPrompt) return;
      const uploadedImages = await Promise.all(
        productImages.map(async (image) => {
          const assetId = image.assetId || (image.file ? await uploadRecreateItem(image) : null);
          return assetId ? { ...image, assetId } : image;
        }),
      );
      if (!uploadedImages.length) throw new Error("请先上传至少一张商品图片");
      setProductImages(uploadedImages);
      const stagedAssetIds = [
        stageAssets.productMultiview?.assetId,
        ...uploadedImages.map((image) => image.assetId),
      ].filter((id): id is string => Boolean(id));
      const safeFinalPrompt = [
        pack.finalPrompt,
        "画面要求：不要在画面中生成字幕、对白文字、标题条、气泡字、歌词、价格贴纸或任何可读文字；字幕会在后期单独添加。",
        generateAudio
          ? "音频要求：请生成自然清晰的中文讲解口播声音，语速适配15秒，声音和画面口型节奏尽量一致。"
          : "音频要求：不要生成讲解声音或旁白，保持视频无口播音频；后期会单独配音。",
        "审核安全提交策略：模特参考图和12格分镜图只作为前端调试产物，不作为 Ark image content 上传；请仅根据以下文字复刻其结构。",
        directorBrief.peopleMode === "no_people"
          ? "人物参与：不需要真人出镜，视频以商品、空间场景、安装/摆放、细节和前后变化为主。"
          : directorBrief.peopleMode === "hands_or_back"
            ? "人物参与：可以出现手部、背影、安装或操作动作，不出现可识别人脸。"
            : "人物参与：可以出现讲解者，但不要复刻真实人脸，重点仍是商品价值和场景证明。",
        stageAssets.modelReference
          ? directorBrief.peopleMode === "no_people"
            ? "场景导演参考文字化：使用商品场景参考板，商品是主角，通过空间关系、细节特写和使用前后变化推进故事。"
            : "模特参考文字化：使用隐私安全虚拟模特，完整人体，正面口播，手势自然，面部不可识别，不复刻真实人脸。"
          : "",
        stageAssets.storyboard
          ? `12格分镜文字化：严格按 4 列 x 3 行从左到右、从上到下的顺序理解为第1-12格；${pack.storyboard.frames.map((frame) => `第${frame.index}格 ${frame.timeRange}，场景：${frame.scene || "同一广告场景连续推进"}，目的：${frame.intent || "推进卖点叙事"}，画面：${frame.visual}，镜头：${frame.camera}，口播：${frame.narration}`).join("；")}`
          : "",
      ].filter(Boolean).join("\n");
      const response = await fetch("/api/tasks/model-spokesperson-video/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          assetIds: [...new Set(stagedAssetIds)].slice(0, 6),
          prompt: safeFinalPrompt,
          aspectRatio: "9:16",
          duration,
          resolution: "720p",
          scene: "口播讲解",
          style: "自然口播",
          productInfo: [productBrief, productUnderstanding].filter(Boolean).join("\n"),
          specialRequirements: selectedPlan.internalPrompt,
          selectedPlanId: selectedPlan.id,
          peopleMode: directorBrief.peopleMode,
          generateAudio,
          videoModel: "doubao-seedance-2-0-260128",
          executionMode: "single",
          usageAuthorized: true,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.taskId) {
        throw new Error(body?.message || body?.code || "视频任务提交失败");
      }
      setVideoPhase("generating");
      const task = await pollVideoTask(body.taskId);
      if (task.status === "SUCCEEDED") {
        setNotice("视频任务已提交，生成完成后可直接预览");
        window.setTimeout(() => setNotice(""), 2200);
      }
    } catch (caught) {
      setVideoPhase("failed");
      setVideoError(caught instanceof Error ? caught.message : "视频提交失败");
    } finally {
      setSubmitBusy(false);
    }
  };

  if (!account)
    return (
      <main className="workspace-loading">
        <Sparkles size={22} />
        <p>正在载入商品口播导演工作台</p>
      </main>
    );

  return (
    <main className="spokesperson-script-page">
      <header className="spokesperson-script-header">
        <button type="button" aria-label="返回视频创作中心" onClick={() => router.push("/create/product-video")}>
          <ArrowLeft size={19} />
        </button>
        <div>
          <span>阶段 1 / 2 · 方案到视频</span>
          <strong>商品口播导演</strong>
        </div>
        <em>
          <FileText size={15} />
          文案生成暂不扣积分
        </em>
      </header>

      <nav className="spokesperson-workflow-steps" aria-label="商品口播导演步骤">
        {([
          ["brief", "1 商品理解"],
          ["plans", "2 方案选择"],
          ["assets", "3 多视图/分镜"],
          ["generate", "4 提交视频"],
        ] as Array<[WorkflowStep, string]>).map(([step, label]) => (
          <button type="button" className={workflowStep === step ? "active" : ""} onClick={() => setWorkflowStep(step)} key={step}>
            {label}
          </button>
        ))}
      </nav>

      <form className="spokesperson-script-layout spokesperson-two-column" onSubmit={generatePlans}>
        <section className="spokesperson-script-form spokesperson-plan-column">
          <div className="spokesperson-script-intro">
            <span>
              <MicVocal size={18} />
              PRODUCT DIRECTOR
            </span>
            <h1>上传商品，先生成 A/B/C 导演方案</h1>
            <p>用户只需要给商品图和一句描述，系统会识别商品、推荐场景，并内置 15 秒广告导演脚本。</p>
          </div>

          <section className={`spokesperson-product-upload ${workflowStep === "brief" ? "" : "spokesperson-step-hidden"}`}>
            <header>
              <strong>商品图</strong>
              <small>后续会自动生成商品多视图参考板</small>
            </header>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleImages} />
            <button type="button" className="spokesperson-upload-drop" disabled={imageUploading} onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={22} />
              <span>{imageUploading ? "正在保存商品图" : "上传商品图"}</span>
              <small>最多 4 张，JPG / PNG / WebP</small>
            </button>
            {productImages.length ? (
              <div className="spokesperson-product-images">
                {productImages.map((image) => (
                  <article key={image.id}>
                    <img src={image.preview} alt={image.name} />
                    <button type="button" aria-label="移除商品图" onClick={() => removeImage(image.id)}>
                      <Trash2 size={13} />
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <div className={`spokesperson-field-grid compact ${workflowStep === "brief" ? "" : "spokesperson-step-hidden"}`}>
            <label>
              商品名称
              <input value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={80} placeholder="例如：轻氧便携榨汁杯" />
            </label>
            <label>
              口播方向
              <select value={tone} onChange={(event) => setTone(event.target.value)}>
                {toneOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={`spokesperson-wide-field ${workflowStep === "brief" ? "" : "spokesperson-step-hidden"}`}>
            一句话描述 / 补充卖点
            <textarea
              value={productBrief}
              onChange={(event) => setProductBrief(event.target.value)}
              maxLength={600}
              placeholder="例如：这是一个便携榨汁杯，适合上班族、健身人群，卖点是轻巧、好清洗、续航够用。"
            />
            <small>{productBrief.length}/600</small>
          </label>

          <section className={`spokesperson-director-brief ${workflowStep === "brief" ? "" : "spokesperson-step-hidden"}`}>
            <header>
              <strong>商品导演问答</strong>
              <small>不懂怎么拍就保持系统推荐</small>
            </header>
            <div className="spokesperson-understanding-card">
              <div>
                <b>商品理解卡</b>
                <button type="button" onClick={() => void analyzeDirectorBrief()} disabled={directorBusy || imageUploading}>
                  {directorBusy ? <LoaderCircle className="generation-spinner" size={13} /> : <Sparkles size={13} />}
                  {directorBusy ? "识别中" : "自动识别/推荐"}
                </button>
              </div>
              <p>{productUnderstanding}</p>
            </div>
            <section className="spokesperson-director-chat">
              <header>
                <strong>AI 导演对话</strong>
                <small>不断校正到满意后再生成方案</small>
              </header>
              <div className="spokesperson-director-messages">
                {directorMessages.length ? (
                  directorMessages.map((message, index) => (
                    <article className={message.role} key={`${message.role}-${index}`}>
                      <p>{message.content}</p>
                      {message.quickReplies?.length ? (
                        <nav>
                          {message.quickReplies.map((reply) => (
                            <button type="button" onClick={() => void runDirectorChat(reply)} disabled={directorChatBusy} key={reply}>
                              {reply}
                            </button>
                          ))}
                        </nav>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <article className="assistant">
                    <p>我会先帮你判断商品、受众、价值场景和故事方向。你可以直接点下面选项，或者说“不要租房场景，改成工程采购”。</p>
                    <nav>
                      {["帮我推荐适合场景", "突出产品价值", "生成更有故事的方向"].map((reply) => (
                        <button type="button" onClick={() => void runDirectorChat(reply)} disabled={directorChatBusy} key={reply}>
                          {reply}
                        </button>
                      ))}
                    </nav>
                  </article>
                )}
              </div>
              <div className="spokesperson-director-input">
                <input
                  value={directorInput}
                  onChange={(event) => setDirectorInput(event.target.value)}
                  placeholder="例如：不要家庭场景，面向工程采购商，突出安装效率和成本"
                  disabled={directorChatBusy}
                />
                <button type="button" onClick={() => void runDirectorChat(directorInput)} disabled={directorChatBusy || (!directorInput.trim() && !canGeneratePlans)}>
                  {directorChatBusy ? <LoaderCircle className="generation-spinner" size={14} /> : <Send size={14} />}
                  {directorChatBusy ? "沟通中" : "发送"}
                </button>
              </div>
            </section>
            <div className="spokesperson-director-question">
              <span>人物参与</span>
              <nav>
                {peopleModeOptions.map(([value, label]) => (
                  <button
                    type="button"
                    className={directorBrief.peopleMode === value ? "active" : ""}
                    onClick={() => updateDirectorBrief("peopleMode", value)}
                    key={value}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <small>默认分镜不出现可识别人脸；最终视频按这里决定是否加入手部、背影或讲解者。</small>
            </div>
          </section>

          <div className={`spokesperson-options compact ${workflowStep === "brief" ? "" : "spokesperson-step-hidden"}`}>
            <div>
              <span>目标时长</span>
              <nav>
                <button type="button" className="active">
                  15 秒
                </button>
              </nav>
            </div>
          </div>

          {error && (
            <p className="creator-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="spokesperson-notice">
              <Check size={15} />
              {notice}
            </p>
          )}

          <button className={`spokesperson-generate ${workflowStep === "brief" ? "" : "spokesperson-step-hidden"}`} type="submit" disabled={!canGeneratePlans}>
            {busy ? <LoaderCircle className="generation-spinner" size={18} /> : <WandSparkles size={18} />}
            {busy ? "正在生成方案" : plans.length ? "重新生成 A/B/C 方案" : "生成 A/B/C 方案"}
          </button>

          <section className={`spokesperson-plan-list ${workflowStep === "plans" ? "" : "spokesperson-step-hidden"}`}>
            <header>
              <strong>AI 口播方案</strong>
              <small>选择一个方案后，在右侧编辑讲稿</small>
            </header>
            {plans.length ? (
              plans.map((plan) => (
                <article className={plan.id === selectedPlanId ? "active" : ""} key={plan.id}>
                  <button type="button" onClick={() => selectPlan(plan)}>
                    <span>{plan.label}</span>
                    <div>
                      <strong>{plan.title}</strong>
                      <p>{plan.angle}</p>
                    </div>
                  </button>
                  <div className="spokesperson-plan-tags">
                    {splitSummaryPoints(plan.sellingPointSummary).slice(0, 3).map((point) => (
                      <em key={point}>{point}</em>
                    ))}
                  </div>
                  {plan.storyArc ? <p className="spokesperson-plan-story">{plan.storyArc}</p> : null}
                  {plan.actionBeats?.length ? (
                    <ol className="spokesperson-plan-beats">
                      {plan.actionBeats.map((beat, beatIndex) => normalizeActionBeatText(beat)).filter(Boolean).map((beat, beatIndex) => (
                        <li key={`${plan.id}-beat-${beatIndex}`}>{beat}</li>
                      ))}
                    </ol>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="spokesperson-plan-empty">生成后会出现 A/B/C 三种讲稿方向。</p>
            )}
          </section>

        </section>

        <section className="spokesperson-script-result spokesperson-editor-column">
          <header>
            <div>
              <span>讲稿编辑 / 视频阶段</span>
              <h2>{result?.title || "等待选择方案"}</h2>
            </div>
            <div>
              <button type="button" onClick={saveDraft}>
                <Save size={15} />
                保存草稿
              </button>
              <button type="button" onClick={copyScript} disabled={!result}>
                <Clipboard size={15} />
                复制全部
              </button>
            </div>
          </header>

          {showCaseReferences ? (
            renderCaseReferences()
          ) : !result ? (
            <div className="spokesperson-result-empty">
              {productImages.length ? (
                <>
                  <div className="spokesperson-context-thumbs">
                    {productImages.slice(0, 4).map((image) => (
                      <button type="button" onClick={() => setPreviewAsset({ assetId: image.assetId || image.id, url: image.preview, name: image.name })} key={image.id}>
                        <img src={image.preview} alt={image.name} />
                      </button>
                    ))}
                  </div>
                  <strong>商品图已就绪</strong>
                  <p>左侧补一句描述，或直接点击生成 A/B/C 导演方案。</p>
                </>
              ) : (
                <>
                  <MicVocal size={34} />
                  <strong>这里将显示选中的 15 秒讲稿</strong>
                  <p>左侧生成 A/B/C 方案后，选择一个方向即可编辑。</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="spokesperson-script-meta">
                <span>{result.durationSeconds} 秒目标</span>
                <span>{result.tone}</span>
                <span>{result.segments.length} 个分镜</span>
                <span>{characterCount} 字</span>
                <span className={overTarget ? "warning" : ""}>预计 {estimatedSeconds} 秒</span>
              </div>

              {selectedPlan ? (
                <section className="spokesperson-internal-plan">
                  <strong>内置生成策略</strong>
                  <p>{selectedPlan.productDirection}</p>
                  <p>{selectedPlan.modelDirection}</p>
                  <small>复杂提示词不会展示给用户；提交视频时会作为隐藏参数进入请求。</small>
                </section>
              ) : null}

              {overTarget ? (
                <p className="spokesperson-script-warning">当前讲稿预计超过 15 秒，建议删减停顿句或点击重新生成更短方案。</p>
              ) : null}

              <div className="spokesperson-segments">
                {result.segments.map((segment, index) => (
                  <article key={segment.id}>
                    <span>{index + 1}</span>
                    <header>
                      <strong>{segment.stage}</strong>
                      <em>{segment.timeRange}</em>
                    </header>
                    <textarea value={segment.narration} onChange={(event) => updateSegment(segment.id, event.target.value)} maxLength={220} />
                    <p>
                      <Video size={14} />
                      {segment.visual}
                    </p>
                  </article>
                ))}
              </div>

              {result.alternativeOpeners.length > 0 && (
                <div className="spokesperson-openers">
                  <strong>备选开场</strong>
                  {result.alternativeOpeners.map((opener) => (
                    <button type="button" key={opener} onClick={() => useOpener(opener)}>
                      {opener}
                    </button>
                  ))}
                </div>
              )}

              <section className={`spokesperson-video-pack ${workflowStep === "assets" || workflowStep === "generate" ? "" : "spokesperson-step-hidden"}`}>
                <header>
                  <div>
                    <strong>{workflowStep === "generate" ? "提交生成" : "分阶段制作"}</strong>
                    <small>内部任务包会自动合并，不需要用户手动处理</small>
                  </div>
                  <span>
                    <Layers3 size={14} />
                    自动
                  </span>
                </header>
                {videoPack ? <p className="spokesperson-pack-ready">内部任务包已准备，会自动用于多视图、分镜和最终视频生成。</p> : null}
                {videoPack ? (
                  <div className="spokesperson-video-pack-body">
                    <div className="spokesperson-video-pack-summary">
                      <p>{videoPack.productMultiview.summary}</p>
                      <p>{videoPack.modelRecommendation.reason}</p>
                      <small>{videoPack.modelRecommendation.maskingAdvice}</small>
                    </div>
                    <div className="spokesperson-video-pack-grid">
                      <article>
                        <strong>商品多视图</strong>
                        {videoPack.productMultiview.views.map((view) => (
                          <span key={view.name}>{view.name}</span>
                        ))}
                      </article>
                      <article>
                        <strong>模特推荐</strong>
                        <span>{videoPack.modelRecommendation.label}</span>
                        <span>{videoPack.modelRecommendation.mode}</span>
                      </article>
                      <article>
                        <strong>分镜绑定</strong>
                        {videoPack.bindings.map((binding) => (
                          <span key={binding.segmentId}>{binding.timeRange}</span>
                        ))}
                      </article>
                    </div>
                    <div className="spokesperson-storyboard">
                      <div className="spokesperson-storyboard-heading">
                        <strong>12 格动作分镜</strong>
                        <span>{videoPack.storyboard.summary}</span>
                      </div>
                      <div className="spokesperson-storyboard-grid">
                        {videoPack.storyboard.frames.map((frame) => (
                          <article key={frame.index}>
                            <header>
                              <strong>#{String(frame.index).padStart(2, "0")}</strong>
                              <em>{frame.timeRange}</em>
                            </header>
                            {frame.scene ? <p><b>场景</b>{frame.scene}</p> : null}
                            {frame.intent ? <p><b>目的</b>{frame.intent}</p> : null}
                            <p><b>画面</b>{frame.visual}</p>
                            <p><b>镜头</b>{frame.camera}</p>
                            <p><b>口播</b>{frame.narration}</p>
                            <small>{frame.assetUse}</small>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="spokesperson-video-pack-empty">
                    <UserRound size={18} />
                    <p>点一下就会先生成任务包，再自动提交视频任务。</p>
                  </div>
                )}
                <section className="spokesperson-stage-panel">
                  <header>
                    <div>
                      <strong>分阶段素材</strong>
                      <small>每一步单独生成并保留结果，方便检查后再进入下一步</small>
                    </div>
                    <span>{Object.keys(stageAssets).length}/3 已完成</span>
                  </header>
                  {directorBrief.peopleMode !== "no_people" ? (
                  <section className="spokesperson-model-source">
                    <header>
                      <strong>模特来源</strong>
                      <small>{modelSource ? modelSource.name || "已选择模特图" : "可上传或从资产库选择，不选则自动生成"}</small>
                    </header>
                    <div className="spokesperson-model-source-tabs">
                      {([
                        ["auto", "自动生成"],
                        ["upload", "上传模特"],
                        ["library", "资产库"],
                      ] as Array<[ModelSourceMode, string]>).map(([mode, label]) => (
                        <button type="button" className={modelSourceMode === mode ? "active" : ""} onClick={() => chooseModelSourceMode(mode)} key={mode}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {modelSourceMode === "upload" ? (
                      <>
                        <input ref={modelFileInputRef} type="file" accept="image/*" hidden onChange={handleModelFile} />
                        <button type="button" className="spokesperson-model-upload" disabled={modelUploading} onClick={() => modelFileInputRef.current?.click()}>
                          {modelUploading ? <LoaderCircle className="generation-spinner" size={14} /> : <Upload size={14} />}
                          {modelUploading ? "上传中" : "选择模特图"}
                        </button>
                      </>
                    ) : null}
                    {modelSourceMode === "library" ? (
                      <div className="spokesperson-model-library">
                        {assetsLoading ? (
                          <p><LoaderCircle className="generation-spinner" size={14} />正在加载素材</p>
                        ) : assets.length ? (
                          assets.map((asset) => (
                            <button type="button" className={modelSource?.assetId === asset.id ? "active" : ""} onClick={() => selectModelAsset(asset)} key={asset.id}>
                              <img src={asset.url} alt={asset.originalName} />
                              <span>{asset.originalName}</span>
                            </button>
                          ))
                        ) : (
                          <p>暂无可用图片素材</p>
                        )}
                      </div>
                    ) : null}
                    {modelSource ? (
                      <div className="spokesperson-model-selected">
                        <button type="button" onClick={() => setPreviewAsset(modelSource)}>
                          <img src={modelSource.url} alt={modelSource.name || "模特源图"} />
                        </button>
                        <span>{modelSource.name || "模特源图"}</span>
                        <button type="button" onClick={() => setModelSource(null)}>移除</button>
                      </div>
                    ) : null}
                  </section>
                  ) : null}
                  <div className="spokesperson-stage-list">
                    {([
                      ["productMultiview", "1. 商品多视图", "先确认产品的正侧背、细节和结构。"],
                      [
                        "modelReference",
                        directorBrief.peopleMode === "no_people" ? "2. 场景导演参考" : "2. 模特参考",
                        directorBrief.peopleMode === "no_people" ? "生成商品场景、镜头路径和价值证明参考板。" : "生成隐私安全的完整人体和动作参考。",
                      ],
                      ["storyboard", "3. 12 格分镜图", "把口播、姿态、商品展示和镜头顺序合成一张参考图。"],
                    ] as Array<[SpokespersonStage, string, string]>).map(([stage, title, description]) => {
                      const task = stageTasks[stage];
                      const asset = stageAssets[stage];
                      const locked =
                        (stage === "modelReference" && !stageAssets.productMultiview) ||
                        (stage === "storyboard" && !stageAssets.modelReference);
                      return (
                        <article key={stage} className={asset ? "ready" : ""}>
                          <div>
                            <strong>{title}</strong>
                            <small>{description}</small>
                            {task?.status === "FAILED" ? <em>{task.errorCode || "生成失败"}</em> : null}
                          </div>
                          {asset ? (
                            <button type="button" className="spokesperson-stage-thumb" onClick={() => setPreviewAsset(asset)} aria-label={`预览${title}`}>
                              <img src={asset.url} alt={title} />
                            </button>
                          ) : (
                            <span className="spokesperson-stage-placeholder">待生成</span>
                          )}
                          <button type="button" onClick={() => void generateStage(stage)} disabled={Boolean(stageBusy) || locked || !selectedPlan}>
                            {stageBusy === stage ? <LoaderCircle className="generation-spinner" size={14} /> : <Sparkles size={14} />}
                            {stageBusy === stage ? "生成中" : asset ? "重新生成" : "生成本步"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
                {videoError ? (
                  <p className="creator-error" role="alert">
                    {videoError}
                  </p>
                ) : null}
                {submitBusy || videoPhase === "generating" ? (
                  <VideoGenerationProgress
                    phase={submitBusy && !videoTask ? "uploading" : "generating"}
                    taskStatus={videoTask?.status}
                    title={videoPack?.title || result?.title || "商品导演视频"}
                    durationSeconds={duration}
                  />
                ) : null}
                {videoTask?.status === "SUCCEEDED" && videoTask.outputs?.[0] && videoTask.outputs[0].mimeType?.startsWith("video/") ? (
                  <div className="spokesperson-video-preview">
                    <video src={videoTask.outputs[0].url} controls playsInline />
                    <div>
                      <strong>视频已生成</strong>
                      <p>任务结果会保存到资产库中。</p>
                      <a href={videoTask.outputs[0].url} target="_blank" rel="noreferrer">
                        全屏预览
                      </a>
                    </div>
                  </div>
                ) : null}
                {videoTask?.status === "SUCCEEDED" && videoTask.outputs?.[0] && !videoTask.outputs[0].mimeType?.startsWith("video/") ? (
                  <p className="creator-error" role="alert">
                    任务返回了非视频素材（{videoTask.outputs[0].mimeType || "未知类型"}），已阻止用视频播放器加载。请重新提交任务。
                  </p>
                ) : null}
                <div className="spokesperson-pack-actions">
                  <label className="spokesperson-audio-toggle">
                    <input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} />
                    <span>生成讲解声音</span>
                  </label>
                  <button type="button" onClick={() => void generateVideoPack()} disabled={packBusy || submitBusy || !selectedPlan}>
                    {packBusy ? <LoaderCircle className="generation-spinner" size={15} /> : <Layers3 size={15} />}
                    {packBusy ? "生成任务包中" : "仅生成任务包"}
                  </button>
                  <button type="button" onClick={() => void submitVideo()} disabled={submitBusy || packBusy || busy || Boolean(stageBusy) || !selectedPlan || !productImages.length || !stageAssets.storyboard}>
                    {submitBusy ? <LoaderCircle className="generation-spinner" size={15} /> : <Send size={15} />}
                    {submitBusy ? "提交中" : "生成并提交视频"}
                  </button>
                </div>
              </section>

              <div className="spokesperson-result-actions">
                <button type="button" onClick={regenerate} disabled={busy}>
                  <RefreshCw size={15} />
                  重新生成 A/B/C
                </button>
                <button
                  type="button"
                  onClick={() => document.querySelector(".spokesperson-video-pack")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  <Video size={15} />
                  查看任务包
                </button>
              </div>
            </>
          )}
          <footer>视频阶段会自动合并商品多视图、模特建议、12 宫格分镜和隐藏提示词。发布前请核对商品信息，避免绝对化或未经证实的宣传表述。</footer>
        </section>
      </form>
      {previewAsset ? (
        <div className="spokesperson-preview-modal" role="dialog" aria-modal="true" onClick={() => setPreviewAsset(null)}>
          <button type="button" aria-label="关闭预览" onClick={() => setPreviewAsset(null)}>
            ×
          </button>
          <img src={previewAsset.url} alt={previewAsset.name || "阶段素材预览"} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </main>
  );
}
