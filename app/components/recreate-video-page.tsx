"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  Film,
  FolderOpen,
  ImagePlus,
  Link2,
  LoaderCircle,
  Save,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { VideoGenerationProgress } from "@/app/components/video-generation-progress";

type Account = { wallet: { availablePoints: number } };
type Item = {
  preview: string;
  name: string;
  byteSize: number;
  file?: File;
  assetId?: string;
  durationSeconds?: number;
  source?: "douyin";
  clipStartSeconds?: number;
  clipEndSeconds?: number;
  materialKind?: MaterialKind;
  materialSummary?: string;
  materialConfidence?: number;
  materialSuggestedAction?: string;
};
type MaterialKind = "person" | "product" | "scene" | "text" | "unknown";
type Asset = {
  id: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  url: string;
  durationSeconds?: number | null;
};
type Result = {
  status: string;
  outputs: Array<{ assetId: string; url: string }>;
  taskId?: string;
};
type PreviewMedia = { url: string; name: string; mimeType: string };
type FaceMaskRegion = { x: number; y: number; width: number; height: number; confidence?: number; view?: string };
type DouyinAnalysis = {
  title: string;
  durationSeconds: number;
  clipRequired: boolean;
  clipDurations?: number[];
  cacheId?: string;
  cachePreviewUrl?: string;
  cacheByteSize?: number;
  cacheExpiresAt?: string;
  referencePrompt?: string;
  keyframeSeconds?: number[];
};
type RecreateFrameAnalysis = {
  frames?: Array<{
    time?: number;
    scene?: string;
    shotType?: string;
    replaceableParts?: string[];
    riskNotes?: string[];
  }>;
  replacementPlan?: Array<{
    target?: string;
    slotType?: "product" | "person" | "scene" | "text" | "style" | string;
    materialKind?: string;
    replaceable?: boolean;
    priority?: number;
    confidence?: number;
    sourceFrameTimes?: number[];
    strategy?: string;
    promptInstruction?: string;
    detectionNote?: string;
  }>;
  risks?: string[];
  prompt?: string;
  providerError?: string;
  summary?: string;
};
type PolishedRecreatePrompt = {
  summary?: string;
  preserve?: string[];
  replace?: string[];
  materialUse?: string[];
  avoid?: string[];
  finalPrompt?: string;
  providerError?: string;
};
type SourceKind = "video" | "product" | "scene";
type WorkflowStep = "source" | "clip" | "product" | "reference" | "generate";
type SourceMode = "douyin" | "upload" | "library";
type KeyframeSelection = {
  time: number;
  url?: string;
  label?: string;
};
type Draft = {
  step: WorkflowStep;
  sourceMode: SourceMode;
  douyinInput: string;
  douyinAnalysis: DouyinAnalysis | null;
  douyinStart: number;
  douyinClipDuration: number;
  sourceItem: Pick<
    Item,
    | "preview"
    | "name"
    | "byteSize"
    | "assetId"
    | "durationSeconds"
    | "source"
    | "clipStartSeconds"
    | "clipEndSeconds"
  > | null;
  douyinClips: Array<
    Pick<
      Item,
      | "preview"
      | "name"
      | "byteSize"
      | "assetId"
      | "durationSeconds"
      | "source"
      | "clipStartSeconds"
      | "clipEndSeconds"
    >
  >;
  activeClipId: string | null;
  selectedKeyframes: KeyframeSelection[];
  products: Array<Pick<Item, "preview" | "name" | "byteSize" | "assetId" | "materialKind" | "materialSummary" | "materialConfidence" | "materialSuggestedAction">>;
  referenceImage: Pick<Item, "preview" | "name" | "byteSize" | "assetId"> | null;
  referenceConfirmed: boolean;
  usageAuthorized: boolean;
  productInfo: string;
  special: string;
  polishedPrompt: PolishedRecreatePrompt | null;
  modelOn: boolean;
  modelInfo: string;
  ratio: string;
  duration: string;
  resolution: string;
};
type ServerDraft = {
  id: string;
  title: string;
  workflowKey: string;
  payload: Partial<Draft>;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
};

const imageAccept = "image/jpeg,image/png,image/webp";
const draftStorageKey = "aigc-recreate-flow-draft";
const workflowSteps: Array<{
  key: WorkflowStep;
  number: number;
  title: string;
  subtitle: string;
}> = [
  { key: "source", number: 1, title: "添加对标视频", subtitle: "抖音获取或本地上传" },
  { key: "clip", number: 2, title: "十二宫格抽帧", subtitle: "锁定复刻节奏与画面" },
  { key: "product", number: 3, title: "复刻口令与素材", subtitle: "一句话说明怎么替换" },
  { key: "reference", number: 4, title: "确认生成方案", subtitle: "确认 AI 润色后的方案" },
  { key: "generate", number: 5, title: "生成复刻视频", subtitle: "开始任务输出" },
];

function cloneItem(item: Item | null | undefined): Item | null {
  if (!item) return null;
  const { file, ...rest } = item;
  return rest;
}

function restoreItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Item>;
  if (
    typeof item.preview !== "string" ||
    typeof item.name !== "string" ||
    typeof item.byteSize !== "number"
  )
    return null;
  if (!item.assetId && item.preview.startsWith("blob:")) return null;
  return {
    preview: item.preview,
    name: item.name,
    byteSize: item.byteSize,
    assetId: typeof item.assetId === "string" ? item.assetId : undefined,
    materialKind:
      item.materialKind === "person" ||
      item.materialKind === "product" ||
      item.materialKind === "scene" ||
      item.materialKind === "text" ||
      item.materialKind === "unknown"
        ? item.materialKind
        : undefined,
    materialSummary: typeof item.materialSummary === "string" ? item.materialSummary : undefined,
    materialConfidence: typeof item.materialConfidence === "number" ? item.materialConfidence : undefined,
    materialSuggestedAction: typeof item.materialSuggestedAction === "string" ? item.materialSuggestedAction : undefined,
    durationSeconds:
      typeof item.durationSeconds === "number" ? item.durationSeconds : undefined,
    source: item.source === "douyin" ? "douyin" : undefined,
    clipStartSeconds:
      typeof item.clipStartSeconds === "number"
        ? item.clipStartSeconds
        : undefined,
    clipEndSeconds:
      typeof item.clipEndSeconds === "number" ? item.clipEndSeconds : undefined,
  };
}

function formatBytes(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  const kb = byteSize / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function defaultKeyframes(durationSeconds?: number, offsetSeconds = 0): KeyframeSelection[] {
  const duration = Math.max(3, Number(durationSeconds) || 15);
  const usableEnd = Math.max(0.3, duration - 0.2);
  const frameCount = duration >= 12 ? 12 : duration >= 8 ? 9 : 8;
  const ratios = Array.from({ length: frameCount }, (_, index) => (index + 0.5) / frameCount);
  return ratios.map((ratio, index) => ({
    time: Math.round((offsetSeconds + Math.min(usableEnd, Math.max(0, duration * ratio))) * 10) / 10,
    label: `关键画面 ${index + 1}`,
  }));
}

const chineseNumbers = ["一", "二", "三", "四", "五", "六", "七", "八"];
const materialLabel = (index: number) => `图片${chineseNumbers[index] || index + 1}`;

export function RecreateVideoPage() {
  const router = useRouter();
  const refs = {
    video: useRef<HTMLInputElement>(null),
    product: useRef<HTMLInputElement>(null),
    scene: useRef<HTMLInputElement>(null),
  };

  const [account, setAccount] = useState<Account | null>(null);
  const [step, setStep] = useState<WorkflowStep>("source");
  const [sourceMode, setSourceMode] = useState<SourceMode>("douyin");
  const [videoSource, setVideoSource] = useState<"local" | "library" | "douyin">(
    "douyin",
  );
  const [libraryKind, setLibraryKind] = useState<SourceKind | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [sourceItem, setSourceItem] = useState<Item | null>(null);
  const [douyinClips, setClips] = useState<Item[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [selectedKeyframes, setSelectedKeyframes] = useState<KeyframeSelection[]>([]);
  const [products, setProducts] = useState<Item[]>([]);
  const [referenceImage, setReferenceImage] = useState<Item | null>(null);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [usageAuthorized, setUsageAuthorized] = useState(false);
  const [douyinInput, setDouyinInput] = useState("");
  const [douyinBusy, setDouyinBusy] = useState<"analyzing" | "importing" | null>(
    null,
  );
  const [frameExtractionBusy, setFrameExtractionBusy] = useState(false);
  const [frameAnalysisBusy, setFrameAnalysisBusy] = useState(false);
  const [frameAnalysis, setFrameAnalysis] = useState<RecreateFrameAnalysis | null>(null);
  const [frameAnalysisFrames, setFrameAnalysisFrames] = useState<Array<{ time: number; url: string }>>([]);
  const [douyinError, setDouyinError] = useState("");
  const [douyinCacheExpired, setDouyinCacheExpired] = useState(false);
  const [douyinAnalysis, setDouyinAnalysis] = useState<DouyinAnalysis | null>(
    null,
  );
  const [douyinStart, setDouyinStart] = useState(0);
  const [douyinClipDuration, setDouyinClipDuration] = useState(15);
  const [productInfo, setProductInfo] = useState("");
  const [special, setSpecial] = useState("");
  const [polishedPrompt, setPolishedPrompt] = useState<PolishedRecreatePrompt | null>(null);
  const [materialMentionOpen, setMaterialMentionOpen] = useState(false);
  const [materialMentionQuery, setMaterialMentionQuery] = useState("");
  const [materialAnalysisBusyIndex, setMaterialAnalysisBusyIndex] = useState<number | null>(null);
  const [privacyViewBusyIndex, setPrivacyViewBusyIndex] = useState<number | null>(null);
  const [faceMaskBusyIndex, setFaceMaskBusyIndex] = useState<number | null>(null);
  const [modelOn, setModelOn] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [mp4OnlyTest, setMp4OnlyTest] = useState(false);
  const [compliantReferenceVideo, setCompliantReferenceVideo] = useState(true);
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("15");
  const [resolution, setResolution] = useState("720p");
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "generating" | "succeeded" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [notice, setNotice] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("复刻视频项目");
  const [serverDrafts, setServerDrafts] = useState<ServerDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftSyncState, setDraftSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const restoredLocalDraftRef = useRef(false);
  const restoringServerDraftRef = useRef(false);
  const autoKeyframeSourceRef = useRef<string | null>(null);
  const visibleDrafts = useMemo(() => serverDrafts.slice(0, 1), [serverDrafts]);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  const draftValue = (): Draft => ({
    step,
    sourceMode,
    douyinInput,
    douyinAnalysis,
    douyinStart,
    douyinClipDuration,
    sourceItem: cloneItem(sourceItem),
    douyinClips: douyinClips.map((item) => cloneItem(item)).filter(Boolean) as Draft["douyinClips"],
    activeClipId,
    selectedKeyframes: selectedKeyframes.map((frame) => ({
      time: frame.time,
      label: frame.label,
      url: frame.url && !frame.url.startsWith("data:") ? frame.url : undefined,
    })),
    products: products.map((item) => cloneItem(item)).filter(Boolean) as Draft["products"],
    referenceImage: cloneItem(referenceImage),
    referenceConfirmed,
    usageAuthorized,
    productInfo,
    special,
    polishedPrompt,
    modelOn,
    modelInfo,
    ratio,
    duration,
    resolution,
  });

  const draftHasContent = (draft: Partial<Draft>) =>
    Boolean(
      draft.douyinInput ||
        draft.sourceItem ||
        draft.douyinClips?.length ||
        draft.products?.length ||
        draft.referenceImage ||
        draft.productInfo ||
        draft.special ||
        draft.polishedPrompt ||
        draft.modelInfo,
    );

  const applyDraft = (draft: Partial<Draft>) => {
    if (draft.step) setStep(draft.step);
    if (draft.sourceMode) setSourceMode(draft.sourceMode);
    setVideoSource(
      draft.sourceMode === "douyin"
        ? "douyin"
        : draft.sourceMode === "library"
          ? "library"
          : "local",
    );
    if (typeof draft.douyinInput === "string") setDouyinInput(draft.douyinInput);
    if (draft.douyinAnalysis) setDouyinAnalysis(draft.douyinAnalysis);
    if (typeof draft.douyinStart === "number") setDouyinStart(draft.douyinStart);
    if (typeof draft.douyinClipDuration === "number")
      setDouyinClipDuration(draft.douyinClipDuration);
    setSourceItem(restoreItem(draft.sourceItem));
    setClips((draft.douyinClips || []).map(restoreItem).filter(Boolean) as Item[]);
    setActiveClipId(draft.activeClipId || null);
    setSelectedKeyframes(
      (draft.selectedKeyframes || [])
        .filter((item) => typeof item?.time === "number")
        .map((item) => ({
          time: item.time,
          url: typeof item.url === "string" ? item.url : undefined,
          label: typeof item.label === "string" ? item.label : undefined,
        })),
    );
    setProducts((draft.products || []).map(restoreItem).filter(Boolean) as Item[]);
    setReferenceImage(restoreItem(draft.referenceImage));
    setReferenceConfirmed(Boolean(draft.referenceConfirmed));
    setUsageAuthorized(Boolean(draft.usageAuthorized));
    setProductInfo(draft.productInfo || "");
    setSpecial(draft.special || "");
    setPolishedPrompt(draft.polishedPrompt || null);
    setModelOn(Boolean(draft.modelOn));
    setModelInfo(draft.modelInfo || "");
    if (draft.ratio) setRatio(draft.ratio);
    if (draft.duration) setDuration(draft.duration);
    if (draft.resolution) setResolution(draft.resolution);
    clearTaskState();
  };

  const refreshDrafts = async (restoreLatest = false) => {
    setDraftsLoading(true);
    try {
      const response = await fetch("/api/workflow-drafts/?workflowKey=recreate-video", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error();
      const drafts = (body?.drafts || []) as ServerDraft[];
      setServerDrafts(drafts);
      if (restoreLatest && !restoredLocalDraftRef.current && drafts[0]) {
        restoringServerDraftRef.current = true;
        setDraftId(drafts[0].id);
        setDraftTitle(drafts[0].title);
        applyDraft(drafts[0].payload);
        window.setTimeout(() => {
          restoringServerDraftRef.current = false;
        }, 0);
      }
    } catch {
      setDraftSyncState("error");
    } finally {
      setDraftsLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem(draftStorageKey);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as Partial<Draft>;
      restoredLocalDraftRef.current = draftHasContent(draft);
      applyDraft(draft);
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, []);

  useEffect(() => {
    if (account) refreshDrafts(true);
  }, [account]);

  useEffect(() => {
    if (!previewMedia) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewMedia(null);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [previewMedia]);

  const sourceSelection = useMemo(
    () => (activeClipId ? douyinClips.find((item) => item.assetId === activeClipId) : null) || sourceItem,
    [activeClipId, douyinClips, sourceItem],
  );
  const selectedClip = sourceSelection?.assetId
    ? douyinClips.find((item) => item.assetId === sourceSelection.assetId) || null
    : sourceSelection;
  const materialReferences = useMemo(
    () =>
      products.map((product, index) => ({
        label: product.name.trim() || materialLabel(index),
        fallbackLabel: materialLabel(index),
        preview: product.preview,
      })),
    [products],
  );
  const privacyReferenceIndex = products.findIndex((product) => product.name.trim() === "虚拟模特参考");
  const privacyReference = privacyReferenceIndex >= 0 ? products[privacyReferenceIndex] : null;
  const portraitCandidateIndex = products.length ? Math.max(privacyReferenceIndex, 0) : -1;
  const portraitCandidate = portraitCandidateIndex >= 0 ? products[portraitCandidateIndex] : null;
  const materialKindLabel = (kind?: MaterialKind) => {
    if (kind === "person") return "模特/人物";
    if (kind === "product") return "商品/物体";
    if (kind === "scene") return "场景/背景";
    if (kind === "text") return "文字/Logo";
    return "未识别";
  };
  const previewImageButton = (url: string, name: string, className = "recreate-preview-image-button") => (
    <button
      type="button"
      className={className}
      onClick={() => setPreviewMedia({ url, name, mimeType: "image/*" })}
      aria-label={`放大预览${name}`}
    >
      <img src={url} alt={name} />
    </button>
  );
  const mentionMaterials = useMemo(() => {
    const query = materialMentionQuery.trim().replace(/^@/, "");
    if (!query) return materialReferences;
    return materialReferences.filter((item) => item.label.includes(query) || item.fallbackLabel.includes(query));
  }, [materialMentionQuery, materialReferences]);
  const replacementSlots = useMemo(() => {
    const plan = (frameAnalysis?.replacementPlan || []).filter(
      (item) => item.replaceable !== false && (item.target || item.strategy || item.promptInstruction),
    );
    if (plan.length) {
      return [...plan]
        .sort((a, b) => {
          const priorityA = Number.isFinite(a.priority) ? Number(a.priority) : 99;
          const priorityB = Number.isFinite(b.priority) ? Number(b.priority) : 99;
          if (priorityA !== priorityB) return priorityA - priorityB;
          return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
        })
        .slice(0, 5);
    }
    return [
      {
        target: "商品主体",
        slotType: "product",
        materialKind: "商品图或主体参考图",
        replaceable: true,
        priority: 1,
        confidence: 0.55,
        strategy: "上传要替换进去的新商品图，系统会参考对标视频里的展示位置、景别和出镜节奏重生成。",
        promptInstruction: "用用户上传的新商品替换对标视频中的主要售卖主体，保持新商品外观准确。",
        detectionNote: "未识别关键帧时，先按常见带货视频结构给出近似槽位。",
      },
      {
        target: "模特 / 手部 / 人物动作",
        slotType: "person",
        materialKind: "模特参考图、手部参考图或人物设定",
        replaceable: true,
        priority: 2,
        confidence: 0.45,
        strategy: "如需要换模特，上传模特参考图或在后续填写模特信息；只参考原视频动作和站位，不复制原人脸。",
        promptInstruction: "参考原视频人物动作、姿态和运镜，生成新的模特形象。",
        detectionNote: "未识别关键帧时，人物槽位为可选建议。",
      },
      {
        target: "背景 / 场景氛围",
        slotType: "scene",
        materialKind: "场景参考图或氛围图",
        replaceable: true,
        priority: 3,
        confidence: 0.4,
        strategy: "需要换场景时上传场景参考图；保留镜头节奏，但生成原创背景。",
        promptInstruction: "参考原视频构图和光线氛围，替换为用户指定场景。",
        detectionNote: "未识别关键帧时，场景槽位为可选建议。",
      },
    ];
  }, [frameAnalysis]);
  const slotTypeLabel = (slotType?: string) => {
    if (slotType === "product") return "商品";
    if (slotType === "person") return "人物";
    if (slotType === "scene") return "场景";
    if (slotType === "text") return "文案";
    if (slotType === "style") return "风格";
    return "近似";
  };
  const slotConfidenceLabel = (confidence?: number) => {
    if (typeof confidence !== "number" || Number.isNaN(confidence)) return "AI近似";
    if (confidence >= 0.75) return "高置信";
    if (confidence >= 0.5) return "中置信";
    return "低置信";
  };
  const slotUploadHint = (slot: { target?: string; slotType?: string; materialKind?: string }) => {
    if (slot.materialKind) return `建议上传：${slot.materialKind}`;
    if (slot.slotType === "person") return "建议上传模特图，或下一步填写模特信息";
    if (slot.slotType === "scene") return "建议上传场景参考图或氛围图";
    if (slot.slotType === "text") return "建议填写品牌、卖点、价格，不建议复刻原字幕";
    if (slot.slotType === "style") return "通常无需上传，作为镜头节奏参考";
    if (slot.slotType === "product") return "建议上传商品图或主体参考图";
    const normalized = slot.target || "";
    if (/模特|人物|手|人脸|动作/.test(normalized)) return "建议上传模特图，或下一步填写模特信息";
    if (/背景|场景|环境|空间/.test(normalized)) return "建议上传场景参考图或氛围图";
    if (/字幕|Logo|水印|品牌/.test(normalized)) return "不建议直接复刻；建议作为避让项处理";
    return "建议上传商品图或主体参考图";
  };
  const slotFramePreviews = (slot: { sourceFrameTimes?: number[] }) => {
    const frames = frameAnalysisFrames.length ? frameAnalysisFrames : selectedKeyframes.filter((item) => item.url);
    if (!frames.length) return [];
    const times = (slot.sourceFrameTimes || [])
      .map((time) => Number(time))
      .filter((time) => Number.isFinite(time));
    if (!times.length) return frames.slice(0, 2);
    const matched = times
      .map((time) =>
        frames
          .map((frame) => ({ ...frame, distance: Math.abs(frame.time - time) }))
          .sort((a, b) => a.distance - b.distance)[0],
      )
      .filter(Boolean);
    return Array.from(new Map(matched.map((frame) => [`${frame.time}-${frame.url}`, frame])).values()).slice(0, 3);
  };
  const keyframeCandidates = useMemo<KeyframeSelection[]>(() => {
    if (frameAnalysisFrames.length) {
      return frameAnalysisFrames.map((frame, index) => ({
        time: frame.time,
        url: frame.url,
        label: `AI关键画面 ${index + 1}`,
      }));
    }
    if (selectedKeyframes.length) return selectedKeyframes;
    return defaultKeyframes(sourceSelection?.durationSeconds);
  }, [frameAnalysisFrames, selectedKeyframes, sourceSelection?.durationSeconds]);
  const selectedKeyframeKeys = useMemo(
    () => new Set(selectedKeyframes.map((frame) => frame.time.toFixed(1))),
    [selectedKeyframes],
  );
  const selectableKeyframes = useMemo(() => keyframeCandidates.slice(0, 12), [keyframeCandidates]);
  const allCandidateKeyframesSelected =
    selectableKeyframes.length > 0 &&
    selectableKeyframes.every((frame) => selectedKeyframeKeys.has(frame.time.toFixed(1)));
  const toggleKeyframe = (frame: KeyframeSelection) => {
    setSelectedKeyframes((current) => {
      const key = frame.time.toFixed(1);
      if (current.some((item) => item.time.toFixed(1) === key))
        return current.filter((item) => item.time.toFixed(1) !== key);
      return [...current, frame]
        .sort((a, b) => a.time - b.time)
        .slice(0, 12);
    });
    clearTaskState();
  };
  const toggleAllKeyframes = () => {
    setSelectedKeyframes(
      allCandidateKeyframesSelected
        ? []
        : selectableKeyframes
            .map((frame, index) => ({
              ...frame,
              label: frame.label || `关键画面 ${index + 1}`,
            }))
            .sort((a, b) => a.time - b.time),
    );
    clearTaskState();
  };
  const useDefaultKeyframes = () => {
    setSelectedKeyframes(defaultKeyframes(sourceSelection?.durationSeconds));
    clearTaskState();
  };
  const returnToSourceForExpiredCache = () => {
    setDouyinCacheExpired(false);
    setDouyinError("");
    setFrameAnalysis(null);
    setFrameAnalysisFrames([]);
    setSelectedKeyframes([]);
    setDouyinAnalysis(null);
    setStep("source");
    setNotice("对标视频缓存已清除，请重新获取视频");
    window.setTimeout(() => setNotice(""), 2200);
  };
  const sourceReady = Boolean(sourceSelection);
  const clipReady =
    sourceReady &&
    selectedKeyframes.length >= 4;
  const productReady = mp4OnlyTest || products.length > 0 || Boolean(productInfo.trim()) || Boolean(polishedPrompt?.finalPrompt);
  const referenceReady = referenceConfirmed;
  const generateReady =
    sourceReady && clipReady && productReady && referenceReady && usageAuthorized;
  const completedCount = [sourceReady, clipReady, productReady, referenceReady, phase === "succeeded"].filter(
    Boolean,
  ).length;
  const unlockedIndex = sourceReady
    ? clipReady
      ? productReady
        ? referenceReady
          ? 4
          : 3
        : 2
      : 1
    : 0;
  const currentIndex = Math.min(
    Math.max(0, workflowSteps.findIndex((item) => item.key === step)),
    unlockedIndex,
  );
  const canGoPrevious = currentIndex > 0 && phase !== "uploading" && phase !== "generating";
  const goPreviousStep = () => {
    if (!canGoPrevious) return;
    setStep(workflowSteps[currentIndex - 1].key);
  };

  useEffect(() => {
    const next = workflowSteps[Math.max(0, unlockedIndex)].key;
    if (workflowSteps.findIndex((item) => item.key === step) > unlockedIndex)
      setStep(next);
  }, [step, unlockedIndex]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (phase === "succeeded") return;
      const draft = draftValue();
      localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      if (!account || !draftHasContent(draft) || phase !== "idle" || restoringServerDraftRef.current)
        return;
      setDraftSyncState("saving");
      fetch("/api/workflow-drafts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId,
          workflowKey: "recreate-video",
          title: draftTitle,
          payload: draft,
        }),
      })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (!response.ok || !body?.draft) throw new Error();
          setDraftId(body.draft.id);
          setDraftTitle(body.draft.title);
          setDraftSyncState("saved");
          setServerDrafts([body.draft]);
        })
        .catch(() => setDraftSyncState("error"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    account,
    activeClipId,
    draftId,
    draftTitle,
    douyinClips,
    douyinAnalysis,
    douyinClipDuration,
    douyinInput,
    douyinStart,
    duration,
    modelInfo,
    modelOn,
    phase,
    productInfo,
    products,
    polishedPrompt,
    ratio,
    referenceConfirmed,
    referenceImage,
    resolution,
    selectedKeyframes,
    sourceItem,
    sourceMode,
    special,
    step,
    usageAuthorized,
  ]);

  useEffect(() => {
    setVideoSource(
      sourceMode === "douyin"
        ? "douyin"
        : sourceMode === "library"
          ? "library"
          : "local",
    );
  }, [sourceMode]);

  const clearTaskState = () => {
    setError("");
    setResult(null);
    setPhase("idle");
  };

  const readVideoDuration = (file: File) =>
    new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      const objectUrl = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const seconds = video.duration;
        URL.revokeObjectURL(objectUrl);
        Number.isFinite(seconds) && seconds > 0
          ? resolve(seconds)
          : reject(new Error("无法读取视频时长"));
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("无法读取视频时长，请选择可正常播放的 MP4 文件"));
      };
      video.src = objectUrl;
    });

  const extractFramesInBrowser = (videoUrl: string, durationSeconds?: number) =>
    new Promise<KeyframeSelection[]>((resolve, reject) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("当前浏览器无法抽取视频画面"));
        return;
      }
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const cleanup = () => {
        video.removeAttribute("src");
        video.load();
      };
      video.onerror = () => {
        cleanup();
        reject(new Error("视频画面读取失败"));
      };
      video.onloadedmetadata = async () => {
        const duration = Math.min(15, Math.max(3, durationSeconds || video.duration || 15));
        const targets = defaultKeyframes(duration);
        const frames: KeyframeSelection[] = [];
        try {
          for (const target of targets) {
            await new Promise<void>((seekResolve, seekReject) => {
              const timeout = window.setTimeout(() => {
                video.onseeked = null;
                seekReject(new Error("视频定位超时"));
              }, 4000);
              video.onseeked = () => {
                window.clearTimeout(timeout);
                seekResolve();
              };
              video.currentTime = Math.min(Math.max(0, target.time), Math.max(0, video.duration - 0.05));
            });
            canvas.width = video.videoWidth || 720;
            canvas.height = video.videoHeight || 1280;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push({
              ...target,
              url: canvas.toDataURL("image/jpeg", 0.82),
            });
          }
          cleanup();
          resolve(frames);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      video.src = videoUrl;
    });

  const openLibrary = async (kind: SourceKind) => {
    setLibraryKind(kind);
    setAssetsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setAssets(
        (body.assets || []).filter((asset: Asset) =>
          kind === "video"
            ? asset.mimeType === "video/mp4"
            : asset.mimeType.startsWith("image/"),
        ),
      );
    } catch {
      setError("素材库加载失败，请稍后再试");
    } finally {
      setAssetsLoading(false);
    }
  };

  const saveDraft = async () => {
    const draft = draftValue();
    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    if (!draftHasContent(draft)) {
      setNotice("当前还没有可保存的项目内容");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    try {
      setDraftSyncState("saving");
      const response = await fetch("/api/workflow-drafts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId,
          workflowKey: "recreate-video",
          title: draftTitle,
          payload: draft,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.draft) throw new Error();
      setDraftId(body.draft.id);
      setDraftTitle(body.draft.title);
      setDraftSyncState("saved");
      setServerDrafts([body.draft]);
      setNotice("项目已保存到账户");
    } catch {
      setDraftSyncState("error");
      setNotice("服务器项目保存失败，已先保留到当前浏览器");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const continueDraft = (draft: ServerDraft) => {
    restoringServerDraftRef.current = true;
    setDraftId(draft.id);
    setDraftTitle(draft.title);
    applyDraft(draft.payload);
    setNotice("已恢复项目，可继续生成");
    window.setTimeout(() => {
      restoringServerDraftRef.current = false;
      setNotice("");
    }, 800);
  };

  const deleteDraft = async (targetId: string) => {
    try {
      const response = await fetch(`/api/workflow-drafts/${targetId}/`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setServerDrafts((current) => current.filter((draft) => draft.id !== targetId));
      if (draftId === targetId) startNewDraft();
      setNotice("项目已删除");
    } catch {
      setNotice("项目删除失败，请稍后再试");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const startNewDraft = () => {
    setDraftId(null);
    setDraftTitle("复刻视频项目");
    setSourceItem(null);
    setClips([]);
    setProducts([]);
    setReferenceImage(null);
    setReferenceConfirmed(false);
    setUsageAuthorized(false);
    setProductInfo("");
    setSpecial("");
    setModelInfo("");
    setModelOn(false);
    setVideoSource("douyin");
    setSourceMode("douyin");
    setDouyinInput("");
    setDouyinError("");
    setDouyinAnalysis(null);
    setSelectedKeyframes([]);
    setDouyinStart(0);
    setDouyinClipDuration(15);
    setActiveClipId(null);
    localStorage.removeItem(draftStorageKey);
    clearTaskState();
    setStep("source");
  };

  const selectAsset = (asset: Asset) => {
    if (libraryKind === "video") {
      if (asset.durationSeconds && (asset.durationSeconds < 3 || asset.durationSeconds > 15))
        return setError("该视频需在 3–15 秒内，请重新上传后使用");
      const selected: Item = {
        assetId: asset.id,
        preview: asset.url,
        name: asset.originalName,
        byteSize: asset.byteSize,
        durationSeconds: asset.durationSeconds || undefined,
      };
      setSourceMode("library");
      setVideoSource("library");
      setSourceItem(selected);
      setClips([selected]);
      setActiveClipId(selected.assetId || null);
      setSelectedKeyframes(defaultKeyframes(selected.durationSeconds));
      setDouyinAnalysis(null);
      setDouyinInput("");
      clearTaskState();
      setStep("clip");
    } else if (libraryKind === "product") {
      setProducts((current) =>
        current.some((item) => item.assetId === asset.id)
          ? current.filter((item) => item.assetId !== asset.id)
          : current.length < 8
            ? [
                ...current,
                {
                  assetId: asset.id,
                  preview: asset.url,
                  name: materialLabel(current.length),
                  byteSize: asset.byteSize,
                },
              ]
            : current,
      );
      clearTaskState();
    } else if (libraryKind === "scene") {
      const selected: Item = {
        assetId: asset.id,
        preview: asset.url,
        name: asset.originalName,
        byteSize: asset.byteSize,
      };
      setReferenceImage(selected);
      setReferenceConfirmed(false);
      clearTaskState();
      setStep("reference");
    }
    setLibraryKind(null);
  };

  const choose = async (kind: SourceKind, files?: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    if (kind === "video") {
      const file = list[0];
      if (file.type !== "video/mp4")
        return setError("对标视频仅支持 MP4 格式");
      if (file.size > 100 * 1024 * 1024)
        return setError("对标视频不能超过 100MB");
      try {
        const durationSeconds = await readVideoDuration(file);
        if (durationSeconds < 3 || durationSeconds > 15)
          return setError(
            `该视频 ${durationSeconds.toFixed(1)} 秒，当前仅支持 3–15 秒。超出部分请先截取后再上传。`,
          );
        const selected = {
          file,
          preview: URL.createObjectURL(file),
          name: file.name,
          byteSize: file.size,
          durationSeconds,
        };
      setSourceMode("upload");
      setVideoSource("local");
      setSourceItem(selected);
      setClips([selected]);
      setActiveClipId(null);
        setSelectedKeyframes(defaultKeyframes(durationSeconds));
        setDouyinAnalysis(null);
        setDouyinInput("");
        clearTaskState();
        setStep("clip");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "无法读取视频时长");
      }
    } else {
      const valid = list
        .filter(
          (file) =>
            ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
            file.size <= 10 * 1024 * 1024,
        )
        .map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          name: file.name,
          byteSize: file.size,
        }));
      if (!valid.length)
        return setError("请上传 10MB 以内的 JPG、PNG 或 WebP 图片");
      if (kind === "scene") {
        setReferenceImage(valid[0]);
        setReferenceConfirmed(false);
        setStep("reference");
      } else {
        setProducts((current) =>
          [...current, ...valid.map((item, index) => ({ ...item, name: materialLabel(current.length + index) }))].slice(0, 8),
        );
      }
      clearTaskState();
    }
  };

  const analyzeDouyin = async () => {
    if (!douyinInput.trim() || douyinBusy) return;
    setError("");
    setDouyinError("");
    setDouyinCacheExpired(false);
    setDouyinBusy("analyzing");
    try {
      const response = await fetch("/api/imports/douyin/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: douyinInput, action: "analyze" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "ANALYZED")
        throw new Error(body?.message || "抖音链接解析失败");
      setDouyinAnalysis({
        title: body.title,
        durationSeconds: body.durationSeconds,
        clipRequired: body.clipRequired === true,
        clipDurations: body.clipDurations || [5, 10, 15],
        cacheId: body.cacheId,
        cachePreviewUrl: body.cachePreviewUrl,
        cacheByteSize: body.cacheByteSize,
        cacheExpiresAt: body.cacheExpiresAt,
        referencePrompt: body.referencePrompt,
        keyframeSeconds: body.keyframeSeconds,
      });
      if (body.cachePreviewUrl) {
        setSourceMode("douyin");
        setVideoSource("douyin");
        setSourceItem({
          preview: body.cachePreviewUrl,
          name: body.title || "抖音对标视频",
          byteSize: body.cacheByteSize || 0,
          durationSeconds: body.durationSeconds,
          source: "douyin",
          clipStartSeconds: 0,
          clipEndSeconds: Math.min(15, body.durationSeconds),
        });
        setClips([]);
        setActiveClipId(null);
        setSelectedKeyframes(defaultKeyframes(body.durationSeconds));
      }
      setFrameAnalysis(null);
      setFrameAnalysisFrames([]);
      setDouyinStart(0);
      setDouyinClipDuration(
        body.durationSeconds >= 15 ? 15 : body.durationSeconds >= 10 ? 10 : 5,
      );
    } catch (caught) {
      setDouyinError(
        caught instanceof Error ? caught.message : "抖音链接解析失败",
      );
    } finally {
      setDouyinBusy(null);
    }
  };

  const importDouyin = async () => {
    if (!douyinAnalysis || douyinBusy) return;
    if (douyinClips.length >= 10) {
      setDouyinError("已保留 10 个片段，请先移除一个片段再继续截取");
      return;
    }
    setError("");
    setDouyinError("");
    setDouyinCacheExpired(false);
    setDouyinBusy("importing");
    try {
      const response = await fetch("/api/imports/douyin/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: douyinInput,
          action: "import",
          cacheId: douyinAnalysis.cacheId,
          ...(douyinAnalysis.clipRequired
            ? {
                startSeconds: douyinStart,
                clipDurationSeconds: douyinClipDuration,
              }
            : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY")
        throw new Error(body?.message || "抖音视频导入失败");
      const importedClip: Item = {
        assetId: body.assetId,
        preview: body.url,
        name: body.name,
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds,
        source: "douyin",
        clipStartSeconds: body.clipStartSeconds,
        clipEndSeconds: body.clipEndSeconds,
      };
      setSourceMode("douyin");
      setVideoSource("douyin");
      setSourceItem(importedClip);
      setClips((current) =>
        current.some((item) => item.assetId === importedClip.assetId)
          ? current
          : [...current, importedClip].slice(0, 10),
      );
      setActiveClipId(importedClip.assetId || null);
      setSelectedKeyframes(
        defaultKeyframes(
          body.durationSeconds,
          typeof body.clipStartSeconds === "number" ? body.clipStartSeconds : 0,
        ),
      );
      clearTaskState();
      setStep("clip");
      setNotice("片段已保存到素材库");
      window.setTimeout(() => setNotice(""), 1800);
    } catch (caught) {
      setDouyinError(
        caught instanceof Error ? caught.message : "抖音视频导入失败",
      );
    } finally {
      setDouyinBusy(null);
    }
  };

  const analyzeReplaceableFrames = async () => {
    if (!douyinAnalysis?.cacheId || frameAnalysisBusy) return;
    setFrameAnalysisBusy(true);
    setDouyinError("");
    setDouyinCacheExpired(false);
    try {
      const response = await fetch("/api/workflows/recreate-video-analysis/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheId: douyinAnalysis.cacheId,
          startSeconds:
            typeof sourceSelection?.clipStartSeconds === "number"
              ? sourceSelection.clipStartSeconds
              : douyinStart,
          durationSeconds: sourceSelection?.durationSeconds || douyinAnalysis.durationSeconds || douyinClipDuration,
          replacementGoals: [
            "替换商品",
            modelOn ? "替换模特" : "",
            "替换背景/场景参考",
          ].filter(Boolean),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.code === "CACHE_EXPIRED" || response.status === 410) {
          setDouyinCacheExpired(true);
          setFrameAnalysis(null);
          setFrameAnalysisFrames([]);
        }
        throw new Error(body?.message || body?.code || "关键帧识别失败");
      }
      setFrameAnalysis(body.analysis || null);
      const extractedFrames = (body.frames || []).map((frame: { time: number; url: string }) => ({
          time: frame.time,
          url: frame.url,
        }));
      setFrameAnalysisFrames(extractedFrames);
      if (!selectedKeyframes.length)
        setSelectedKeyframes(
          extractedFrames.slice(0, 12).map((frame: { time: number; url: string }, index: number) => ({
            ...frame,
            label: `AI关键画面 ${index + 1}`,
          })),
        );
      if (body.analysis?.prompt) {
        setPolishedPrompt((current) => current || {
          summary: body.analysis?.summary || "已根据关键帧生成基础复刻方案",
          preserve: ["镜头节奏", "构图", "动作走势", "光线氛围"],
          replace: ["按复刻口令和上传素材做通配替换"],
          materialUse: ["能匹配上的素材优先使用，匹配不上的素材不强行使用"],
          avoid: ["原人物脸", "原商品", "原品牌", "Logo", "水印", "原字幕"],
          finalPrompt: body.analysis.prompt,
        });
      }
      setNotice("AI 已识别关键帧，并生成基础复刻方案");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "关键帧识别失败");
    } finally {
      setFrameAnalysisBusy(false);
    }
  };

  const polishRecreateCommand = async () => {
    if (frameAnalysisBusy) return;
    const fallbackPrompt = [
      "参考对标视频的十二宫格关键画面，保留镜头节奏、构图、动作走势和光线氛围。",
      productInfo.trim()
        ? `用户复刻口令：${productInfo.trim()}`
        : "用户未填写具体口令，请使用上传素材做通配替换。",
      products.length
        ? `用户已上传 ${products.length} 个素材：${materialReferences.map((item) => item.label).join("、")}。这些标签可在复刻口令中直接引用；能匹配到人物、服装、商品、背景或字幕的素材优先使用，匹配不上的素材不要强行使用。`
        : "用户暂未上传素材，可按复刻口令生成原创画面。",
      "生成原创短视频，不复制原人物脸、原商品、原品牌、Logo、水印或原字幕。",
    ].join("\n");
    if (!douyinAnalysis?.cacheId) {
      setPolishedPrompt({
        summary: "已整理成本地基础复刻方案",
        preserve: ["镜头节奏", "构图", "动作走势", "光线氛围"],
        replace: [productInfo.trim() || "按上传素材做通配替换"],
        materialUse: [products.length ? "优先使用能匹配上的上传素材" : "未上传素材时按口令生成"],
        avoid: ["原人物脸", "原商品", "原品牌", "Logo", "水印", "原字幕"],
        finalPrompt: fallbackPrompt,
      });
      setNotice("已整理复刻口令；抖音缓存视频可使用 AI 深度润色");
      window.setTimeout(() => setNotice(""), 2200);
      clearTaskState();
      return;
    }
    setFrameAnalysisBusy(true);
    setDouyinError("");
    setDouyinCacheExpired(false);
    try {
      const response = await fetch("/api/workflows/recreate-video-analysis/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "polish",
          cacheId: douyinAnalysis.cacheId,
          userCommand: productInfo,
          materialCount: products.length,
          materialLabels: materialReferences.map((item) => item.label),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (body?.code === "CACHE_EXPIRED" || response.status === 410) {
          setDouyinCacheExpired(true);
          setFrameAnalysis(null);
          setFrameAnalysisFrames([]);
        }
        throw new Error(body?.message || body?.code || "复刻口令润色失败");
      }
      setPolishedPrompt(body.polished || null);
      setNotice("AI 已润色复刻口令，生成方案可确认");
      window.setTimeout(() => setNotice(""), 2200);
      clearTaskState();
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "复刻口令润色失败");
    } finally {
      setFrameAnalysisBusy(false);
    }
  };

  const quickExtractKeyframes = async () => {
    if (!sourceSelection || frameExtractionBusy) return;
    setFrameExtractionBusy(true);
    setDouyinError("");
    setDouyinCacheExpired(false);
    try {
      if (sourceSelection.source === "douyin" && douyinAnalysis?.cacheId) {
        const response = await fetch("/api/workflows/recreate-video-analysis/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cacheId: douyinAnalysis.cacheId,
            mode: "frames",
            startSeconds:
              typeof sourceSelection.clipStartSeconds === "number"
                ? sourceSelection.clipStartSeconds
                : douyinStart,
            durationSeconds: sourceSelection.durationSeconds || douyinAnalysis?.durationSeconds || douyinClipDuration,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          if (body?.code === "CACHE_EXPIRED" || response.status === 410) {
            setDouyinCacheExpired(true);
            setFrameAnalysis(null);
            setFrameAnalysisFrames([]);
          }
          throw new Error(body?.message || body?.code || "快速抽帧失败");
        }
        const frames = (body.frames || []).map((frame: { time: number; url: string }, index: number) => ({
          time: frame.time,
          url: frame.url,
          label: `关键画面 ${index + 1}`,
        }));
        setFrameAnalysisFrames(frames);
        setSelectedKeyframes(frames.slice(0, 12));
        setNotice("已快速抽取十二宫格关键画面；可继续写复刻口令");
      } else {
        const frames = await extractFramesInBrowser(sourceSelection.preview, sourceSelection.durationSeconds);
        setFrameAnalysisFrames(
          frames
            .filter((frame): frame is KeyframeSelection & { url: string } => Boolean(frame.url))
            .map((frame) => ({ time: frame.time, url: frame.url })),
        );
        setSelectedKeyframes(frames.slice(0, 12));
        setNotice("已在浏览器本地快速抽取十二宫格关键画面");
      }
      window.setTimeout(() => setNotice(""), 2400);
      clearTaskState();
    } catch (caught) {
      const fallbackFrames = defaultKeyframes(sourceSelection.durationSeconds);
      setSelectedKeyframes(fallbackFrames);
      setFrameAnalysisFrames([]);
      setNotice("无法直接抽取截图，已先使用默认时间点；可继续操作或换一个视频");
      setDouyinError(caught instanceof Error ? caught.message : "快速抽帧失败");
      window.setTimeout(() => setNotice(""), 2600);
    } finally {
      setFrameExtractionBusy(false);
    }
  };

  useEffect(() => {
    const sourceKey =
      sourceSelection?.assetId || sourceSelection?.preview || sourceSelection?.name || "";
    const hasOnlyTimePoints =
      selectedKeyframes.length > 0 && selectedKeyframes.every((frame) => !frame.url);
    if (
      step !== "clip" ||
      !sourceSelection ||
      !sourceKey ||
      frameExtractionBusy ||
      frameAnalysisFrames.length ||
      !hasOnlyTimePoints ||
      autoKeyframeSourceRef.current === sourceKey
    )
      return;
    autoKeyframeSourceRef.current = sourceKey;
    const timer = window.setTimeout(() => {
      void quickExtractKeyframes();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    step,
    sourceSelection?.assetId,
    sourceSelection?.preview,
    sourceSelection?.name,
    selectedKeyframes.length,
    frameAnalysisFrames.length,
    frameExtractionBusy,
  ]);

  const keyframeFallbackVisual = (label: string) =>
    sourceSelection?.preview ? (
      <span className="recreate-keyframe-video-fallback">
        <video src={sourceSelection.preview} muted playsInline preload="metadata" />
        <i>{label}</i>
      </span>
    ) : (
      <span className="recreate-keyframe-placeholder">
        <Film size={20} />
        <small>{label}</small>
      </span>
    );

  const moveClip = (index: number, direction: -1 | 1) =>
    setClips((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeClip = (assetId?: string) => {
    if (!assetId) return;
    setClips((current) => current.filter((item) => item.assetId !== assetId));
    if (activeClipId === assetId) setActiveClipId(null);
    if (sourceItem?.assetId === assetId) setSourceItem(null);
    clearTaskState();
  };

  const removeProduct = (index: number) =>
    setProducts((current) => {
      const item = current[index];
      if (item?.file) URL.revokeObjectURL(item.preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  const renameProduct = (index: number, name: string) => {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, name: name.slice(0, 18) }
          : item,
      ),
    );
    setPolishedPrompt(null);
    clearTaskState();
  };
  const normalizeProductName = (index: number) => {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, name: item.name.trim() || materialLabel(index) }
          : item,
      ),
    );
  };
  const analyzeMaterial = async (index: number) => {
    const source = products[index];
    if (!source || materialAnalysisBusyIndex !== null) return;
    setError("");
    setMaterialAnalysisBusyIndex(index);
    try {
      const assetId = await upload(source);
      setProducts((current) =>
        current.map((item, itemIndex) => (itemIndex === index ? { ...item, assetId } : item)),
      );
      const response = await fetch("/api/workflows/recreate-material-analysis/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "素材识别失败");
      const kind = ["person", "product", "scene", "text", "unknown"].includes(body?.kind) ? body.kind as MaterialKind : "unknown";
      setProducts((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                assetId,
                materialKind: kind,
                materialSummary: typeof body?.summary === "string" ? body.summary : "",
                materialConfidence: Number(body?.confidence) || 0,
                materialSuggestedAction: typeof body?.suggestedAction === "string" ? body.suggestedAction : "",
              }
            : item,
        ),
      );
      setNotice(`已识别为：${materialKindLabel(kind)}`);
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "素材识别失败");
    } finally {
      setMaterialAnalysisBusyIndex(null);
    }
  };
  const setMaterialKind = (index: number, kind: MaterialKind) => {
    setProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              materialKind: kind,
              materialSummary:
                kind === "person"
                  ? "已手动标为模特/人物，请生成隐私化完整人体多视图"
                  : kind === "product"
                    ? "已手动标为商品/物体，请生成商品多视图"
                    : kind === "scene"
                      ? "已手动标为场景/背景"
                      : kind === "text"
                        ? "已手动标为文字/Logo"
                        : "已手动标为未识别素材",
              materialConfidence: 1,
            }
          : item,
      ),
    );
    setPolishedPrompt(null);
    clearTaskState();
  };
  const insertMaterialReference = (label: string) => {
    setProductInfo((current) => {
      const beforeCursor = current;
      const match = beforeCursor.match(/(^|\s)@[\u4e00-\u9fa5\w-]*$/);
      if (match) {
        const start = beforeCursor.length - match[0].length;
        const prefix = beforeCursor.slice(0, start);
        const leading = match[1] || "";
        return `${prefix}${leading}@${label} `.slice(0, 800);
      }
      const suffix = current.trim() ? ` @${label}` : `@${label}`;
      return `${current}${suffix} `.slice(0, 800);
    });
    setMaterialMentionOpen(false);
    setMaterialMentionQuery("");
    setPolishedPrompt(null);
    clearTaskState();
  };
  const handleCommandInput = (value: string) => {
    setProductInfo(value);
    setPolishedPrompt(null);
    clearTaskState();
    const match = value.match(/(^|\s)@([\u4e00-\u9fa5\w-]*)$/);
    setMaterialMentionOpen(Boolean(match && materialReferences.length));
    setMaterialMentionQuery(match?.[2] || "");
  };

  const upload = async (item: Item) => {
    if (item.assetId) return item.assetId;
    if (!item.file) throw new Error("素材未找到");
    const response = await fetch("/api/uploads/presign/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: item.file.name,
        mimeType: item.file.type,
        byteSize: item.file.size,
      }),
    });
    const presign = await response.json();
    if (!response.ok) throw new Error(presign.message || "上传失败");
    if (
      !(
        await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": item.file.type },
          body: item.file,
        })
      ).ok
    )
      throw new Error("上传失败");
    const confirmed = await fetch("/api/uploads/confirm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: presign.assetId,
        ...(item.file.type === "video/mp4"
          ? { videoDurationSeconds: item.durationSeconds }
          : {}),
      }),
    });
    if (!confirmed.ok) {
      const body = await confirmed.json().catch(() => null);
      throw new Error(body?.message || "素材校验失败");
    }
    return presign.assetId as string;
  };

  const resolveAssetPreviewUrl = async (assetId: string, fallbackUrl: string) => {
    const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return fallbackUrl;
    const body = await response.json().catch(() => null);
    const asset = Array.isArray(body?.assets)
      ? body.assets.find((item: Asset) => item.id === assetId)
      : null;
    return typeof asset?.url === "string" ? asset.url : fallbackUrl;
  };

  const loadImageForCanvas = async (url: string) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    const objectUrl = await fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("关键帧图片读取失败");
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => url);
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => {
        if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
        reject(new Error("关键帧图片加载失败"));
      };
      image.src = objectUrl;
    });
  };

  const createKeyframeCollageAsset = async () => {
    const frames = selectedKeyframes.filter((frame): frame is KeyframeSelection & { url: string } => Boolean(frame.url)).slice(0, 12);
    if (frames.length < 4) return null;
    const columns = frames.length <= 8 ? 4 : 4;
    const rows = Math.ceil(frames.length / columns);
    const cellWidth = 360;
    const cellHeight = 640;
    const labelHeight = 42;
    const gap = 8;
    const padding = 16;
    const width = columns * cellWidth + (columns - 1) * gap + padding * 2;
    const height = rows * (cellHeight + labelHeight) + (rows - 1) * gap + padding * 2;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("十二宫格参考图生成失败");
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, width, height);
    context.font = "24px sans-serif";
    context.textBaseline = "middle";
    context.textAlign = "left";
    for (const [index, frame] of frames.entries()) {
      const image = await loadImageForCanvas(frame.url);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (cellWidth + gap);
      const y = padding + row * (cellHeight + labelHeight + gap);
      const scale = Math.max(cellWidth / image.naturalWidth, cellHeight / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const drawX = x + (cellWidth - drawWidth) / 2;
      const drawY = y + (cellHeight - drawHeight) / 2;
      context.save();
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, 18);
      context.clip();
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      context.restore();
      context.fillStyle = "rgba(15, 23, 42, 0.86)";
      context.fillRect(x, y + cellHeight - labelHeight, cellWidth, labelHeight);
      context.fillStyle = "#ffffff";
      context.fillText(`画面 ${index + 1} · ${frame.time.toFixed(1)}s`, x + 14, y + cellHeight - labelHeight / 2);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("十二宫格参考图导出失败");
    const file = new File([blob], "recreate-keyframe-collage.jpg", { type: "image/jpeg" });
    const preview = URL.createObjectURL(file);
    try {
      return await upload({
        file,
        preview,
        name: "十二宫格参考图",
        byteSize: file.size,
      });
    } finally {
      URL.revokeObjectURL(preview);
    }
  };

  const prepareKeyframeCollageReference = async () => {
    const hasVisualKeyframes = selectedKeyframes.some((frame) => frame.url);
    if (!hasVisualKeyframes) return null;
    return createKeyframeCollageAsset();
  };

  const keyframeCollagePrompt = (collageImageIndex: number | null) =>
    collageImageIndex
      ? `十二宫格参考图：第${collageImageIndex}张参考图是一张由已选关键画面拼接而成的十二宫格参考板，请结合这张图理解镜头顺序、主体位置、景别变化、动作走势和画面氛围；它只用于结构参考，不得复制原人物脸、原商品、原品牌、Logo、水印或原字幕。`
      : "十二宫格参考图：当前只有关键画面时间点，未能提交拼接图；请主要参考对标视频的镜头节奏和已确认时间点。";

  const analyzeFaceMaskRegions = async (assetId?: string) => {
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
    const paddingX = width * 0.18;
    const paddingY = height * 0.16;
    const maskX = Math.max(0, x - paddingX);
    const maskY = Math.max(0, y - paddingY);
    const maskWidth = width + paddingX * 2;
    const maskHeight = height + paddingY * 2;
    const block = Math.max(5, Math.min(maskWidth, maskHeight) / 6);
    for (let yy = maskY; yy < maskY + maskHeight; yy += block) {
      for (let xx = maskX; xx < maskX + maskWidth; xx += block) {
        const tone = 170 + ((Math.floor(xx / block) + Math.floor(yy / block) + variant) % 4) * 18;
        context.fillStyle = `rgba(${tone}, ${Math.min(255, tone + 5)}, ${Math.min(255, tone + 14)}, 0.7)`;
        context.fillRect(xx, yy, block + 1, block + 1);
      }
    }
    if (variant % 4 === 0) {
      context.fillStyle = "rgba(12, 18, 28, 0.78)";
      context.fillRect(maskX, maskY + maskHeight * 0.32, maskWidth, maskHeight * 0.32);
      context.fillStyle = "rgba(238, 242, 247, 0.4)";
      context.fillRect(maskX, maskY, maskWidth, maskHeight);
      return;
    }
    if (variant % 4 === 1) {
      context.fillStyle = "rgba(238, 242, 247, 0.72)";
      context.fillRect(maskX, maskY, maskWidth, maskHeight);
      context.strokeStyle = "rgba(12, 18, 28, 0.36)";
      context.lineWidth = Math.max(1, maskWidth / 34);
      for (let offset = -maskHeight; offset < maskWidth; offset += Math.max(8, maskWidth / 7)) {
        context.beginPath();
        context.moveTo(maskX + offset, maskY + maskHeight);
        context.lineTo(maskX + offset + maskHeight, maskY);
        context.stroke();
      }
      return;
    }
    if (variant % 4 === 2) {
      for (let yy = maskY; yy < maskY + maskHeight; yy += block) {
        for (let xx = maskX; xx < maskX + maskWidth; xx += block) {
          const tone = 185 + ((Math.floor(xx / block) + Math.floor(yy / block)) % 3) * 18;
          context.fillStyle = `rgba(${tone}, ${tone + 4}, ${Math.min(255, tone + 12)}, 0.86)`;
          context.fillRect(xx, yy, block + 1, block + 1);
        }
      }
      return;
    }
    context.fillStyle = "rgba(255, 255, 255, 0.58)";
    context.fillRect(maskX, maskY, maskWidth, maskHeight);
    context.strokeStyle = "rgba(10, 18, 30, 0.5)";
    context.lineWidth = Math.max(2, maskWidth / 28);
    context.strokeRect(maskX, maskY, maskWidth, maskHeight);
    context.fillStyle = "rgba(10, 18, 30, 0.18)";
    context.fillRect(maskX, maskY + maskHeight * 0.42, maskWidth, maskHeight * 0.16);
  };

  const fallbackFaceRegions = (width: number, height: number) => {
    const landscape = width >= height;
    const columns = landscape ? 4 : 2;
    const rows = landscape ? 2 : 4;
    const regions: FaceMaskRegion[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cellX = column / columns;
        const cellY = row / rows;
        regions.push({
          x: cellX + 0.32 / columns,
          y: cellY + 0.13 / rows,
          width: 0.36 / columns,
          height: 0.22 / rows,
          confidence: 0.2,
          view: "fallback",
        });
      }
    }
    return regions;
  };

  const createFaceMaskedReferenceAsset = async (source: { url: string; name?: string; assetId?: string }) => {
    const image = await loadImageForCanvas(source.url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("脸部遮盖处理失败");
    context.drawImage(image, 0, 0);
    const detectedRegions = await analyzeFaceMaskRegions(source.assetId);
    const regions = detectedRegions.length ? detectedRegions : fallbackFaceRegions(canvas.width, canvas.height);
    regions.forEach((region: FaceMaskRegion, index: number) =>
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
    if (!blob) throw new Error("脸部遮盖图导出失败");
    const file = new File([blob], "privacy-masked-multiview.jpg", { type: "image/jpeg" });
    const preview = URL.createObjectURL(file);
    const assetId = await upload({
      file,
      preview,
      name: source.name || "虚拟模特参考",
      byteSize: file.size,
    });
    const url = await resolveAssetPreviewUrl(assetId, preview);
    if (url !== preview) URL.revokeObjectURL(preview);
    return { assetId, url, byteSize: file.size };
  };

  const prepareReferenceVideoAsset = async (item: Item) => {
    if (item.assetId) return item.assetId;
    if (item.source === "douyin" && douyinAnalysis?.cacheId) {
      const response = await fetch("/api/imports/douyin/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: douyinInput,
          action: "import",
          cacheId: douyinAnalysis.cacheId,
          ...(douyinAnalysis.durationSeconds > 15
            ? { startSeconds: 0, clipDurationSeconds: 15 }
            : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY")
        throw new Error(body?.message || "参考视频准备失败");
      const importedClip: Item = {
        assetId: body.assetId,
        preview: body.url,
        name: body.name,
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds,
        source: "douyin",
        clipStartSeconds: body.clipStartSeconds,
        clipEndSeconds: body.clipEndSeconds,
      };
      setSourceItem(importedClip);
      setClips((current) =>
        current.some((clip) => clip.assetId === importedClip.assetId)
          ? current
          : [importedClip, ...current].slice(0, 10),
      );
      setActiveClipId(importedClip.assetId || null);
      return body.assetId as string;
    }
    return upload(item);
  };

  const prepareCompliantReferenceVideoAsset = async (assetId: string) => {
    if (!compliantReferenceVideo || mp4OnlyTest) return assetId;
    setNotice("正在生成轻量合规参考视频");
    const response = await fetch("/api/workflows/recreate-video-sanitize/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || "合规参考视频生成失败");
    setNotice("已生成轻量合规参考视频，将用于提交给视频模型");
    window.setTimeout(() => setNotice(""), 2600);
    return body.assetId as string;
  };

  const poll = async (taskId: string) => {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${taskId}/`, {
        cache: "no-store",
      });
      const task = await response.json();
      if (!response.ok) throw new Error(task.message || "任务查询失败");
      setResult(task);
      if (task.status === "SUCCEEDED") {
        setPhase("succeeded");
        return;
      }
      if (["FAILED", "REJECTED", "CANCELED"].includes(task.status))
        throw new Error(task.errorCode || "视频生成失败，积分已退回");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("视频仍在生成中，请稍后在任务中心查看");
  };

  const pollPrivacyViewTask = async (taskId: string) => {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" });
      const task = await response.json().catch(() => null);
      if (!response.ok) throw new Error(task?.message || "多视图任务查询失败");
      if (task.status === "SUCCEEDED" && task.outputs?.[0]) return task.outputs[0] as { assetId: string; url: string; name?: string };
      if (task.status === "FAILED" || task.status === "CANCELED")
        throw new Error(task.errorCode || "多视图参考生成失败");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("多视图参考仍在生成中，请稍后在任务中心查看");
  };

  const strengthenFaceMask = async (index: number) => {
    const source = products[index];
    if (!source || faceMaskBusyIndex !== null) return;
    setError("");
    setFaceMaskBusyIndex(index);
    try {
      const sourceAssetId = source.assetId || await upload(source);
      const masked = await createFaceMaskedReferenceAsset({ url: source.preview, name: source.name || "虚拟模特参考", assetId: sourceAssetId });
      setProducts((current) =>
        current.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          if (item.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview);
          return {
            ...item,
            assetId: masked.assetId,
            preview: masked.url,
            byteSize: masked.byteSize,
            materialKind: "person",
            materialSummary: "已强化脸部遮盖，可作为人物 reference 提交",
          };
        }),
      );
      setNotice("已强化脸部遮盖");
      window.setTimeout(() => setNotice(""), 2200);
      clearTaskState();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "脸部遮盖强化失败");
    } finally {
      setFaceMaskBusyIndex(null);
    }
  };

  const createPrivacyMultiView = async (index: number) => {
    const source = products[index];
    if (!source || privacyViewBusyIndex !== null) return;
    setError("");
    setPrivacyViewBusyIndex(index);
    try {
      const assetId = await upload(source);
      const kind = source.materialKind || "unknown";
      const label = source.name.trim() || materialLabel(index);
      const isPerson = kind === "person" || label.includes("模特") || label.includes("人物") || label.includes("真人");
      const outputName = isPerson
        ? "虚拟模特参考"
        : kind === "scene"
          ? "场景多视图参考"
          : kind === "text"
            ? "文字标识参考"
            : "商品多视图参考";
      const prompt = isPerson
        ? [
            "基于输入人像参考图，生成一张隐私化虚拟模特多角度参考图。",
            "必须输出完整人物/模特主体，而不是单独的裙子、衣服、商品平铺图或服装白底图。",
            "画面是一张干净的人物多视图参考板，包含完整站姿正面、完整站姿左45度、完整站姿右45度、完整侧身、完整背面、上半身穿搭细节、下半身姿态细节、局部动作细节。",
            "每个主要视图都要保留人体头部、肩颈、躯干、手臂、腿部和整体身形比例；服装只是穿在虚拟模特身上的一部分，不得把人物裁掉只留下衣服。",
            "保留服装款式、颜色、材质、发型轮廓、身形比例、姿态气质和整体穿搭氛围。",
            "所有出现脸部的位置都必须做隐私化处理：弱化真实五官，不保留可识别真人身份；不同视图综合使用半透明网格、柔化、额头/眼周遮挡、鼻梁/中庭遮挡、下半脸遮挡等方式。",
            "不要复制原人物脸部身份，不要生成清晰真实人脸；重点输出可用于原创视频生成的虚拟模特参考。",
            "禁止输出单件服装多视图、商品展示图、裙子独立展示图。",
            "浅灰或白色背景，参考图清晰整洁，适合作为后续 @虚拟模特参考 使用。",
          ].join("\n")
        : [
            "基于输入素材图，生成一张电商复刻可用的多视图参考图。",
            "画面是一张干净的参考板，包含主体正面、左45度、右45度、侧面、背面/反面、顶部或底部、材质细节、使用场景或比例关系。",
            "如果是商品或服装静物，必须保留主体轮廓、颜色、材质、结构、Logo位置和关键卖点，不要凭空改变品类。",
            "如果是场景图，输出不同角度的空间/氛围参考，保留光线、色调、背景层次和可复刻的场景元素。",
            "如果是文字或Logo参考，只保留版式位置和视觉风格，不生成侵权品牌或不可控乱码。",
            "不需要做人脸遮挡；若画面中意外出现真人脸，也必须弱化或遮挡，不保留可识别真实身份。",
            `输出适合作为后续 @${outputName} 使用，浅灰或白色背景，清晰整洁。`,
          ].join("\n");
      const response = await fetch("/api/tasks/scene/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          assetId,
          aspectRatio: "1:1",
          scene: "自然居家",
          style: "清新自然",
          prompt,
        }),
      });
      const created = await response.json().catch(() => null);
      if (!response.ok) throw new Error(created?.message || "多视图参考任务创建失败");
      setNotice(isPerson ? "正在生成隐私化多角度参考图" : "正在生成素材多视图参考图");
      const output = await pollPrivacyViewTask(created.taskId);
      const finalOutput = isPerson
        ? await createFaceMaskedReferenceAsset({ url: output.url, name: outputName, assetId: output.assetId })
        : { assetId: output.assetId, url: output.url, byteSize: 0 };
      setProducts((current) =>
        current.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          if (item.file) URL.revokeObjectURL(item.preview);
          return {
            assetId: finalOutput.assetId,
            preview: finalOutput.url,
            name: outputName,
            byteSize: finalOutput.byteSize,
            materialKind: isPerson ? "person" : kind,
            materialSummary: isPerson ? "已生成隐私化人物多角度参考，并强化脸部遮盖" : "已生成素材多视图参考",
            materialConfidence: source.materialConfidence,
          };
        }),
      );
      setProductInfo((current) =>
        current.includes(`@${outputName}`)
          ? current
          : `${current.trim() ? `${current.trim()} ` : ""}${isPerson ? "人物形象" : "素材主体"}参考 @${outputName}，${isPerson ? "保留服装、身形和姿态气质，不复制真实人脸身份。" : "保留主体结构、颜色、材质和关键细节。"}`.slice(0, 800),
      );
      setPolishedPrompt(null);
      clearTaskState();
      setNotice(`已生成 @${outputName}，并替换原素材`);
      window.setTimeout(() => setNotice(""), 2600);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "多视图参考生成失败");
    } finally {
      setPrivacyViewBusyIndex(null);
    }
  };

  const goToVideoMix = () => {
    const assetIds = douyinClips
      .map((item) => item.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    if (assetIds.length)
      sessionStorage.setItem("aigc-video-mix-asset-ids", JSON.stringify(assetIds));
    else sessionStorage.removeItem("aigc-video-mix-asset-ids");
    router.push("/create/video-mix");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!generateReady || phase !== "idle") return;
    setError("");
    setResult(null);
    setPhase("uploading");
    try {
      const sourceReferenceVideoAssetId = await prepareReferenceVideoAsset(selectedClip || sourceItem!);
      const referenceVideoAssetId = await prepareCompliantReferenceVideoAsset(sourceReferenceVideoAssetId);
      const productAssetIds = mp4OnlyTest ? [] : await Promise.all(products.map(upload));
      const keyframeCollageAssetId = mp4OnlyTest ? null : await prepareKeyframeCollageReference();
      const confirmedReferenceAssetId = !mp4OnlyTest && referenceImage ? await upload(referenceImage) : null;
      const assetIds = mp4OnlyTest
        ? [referenceVideoAssetId]
        : [
            ...productAssetIds,
            ...(keyframeCollageAssetId ? [keyframeCollageAssetId] : []),
            referenceVideoAssetId,
            ...(confirmedReferenceAssetId ? [confirmedReferenceAssetId] : []),
          ];
      const collageImageIndex = !mp4OnlyTest && keyframeCollageAssetId ? products.length + 1 : null;
      const prompt = [
        mp4OnlyTest
          ? "当前为仅 MP4 对标视频测试模式：本次只提交对标视频，不提交十二宫格参考图、素材池图片或额外参考图，用于验证 Ark 是否接受该 MP4 reference_video。"
          : compliantReferenceVideo
            ? "对标视频已先转换为轻量合规结构参考视频：去除原音频、降低清晰度、模糊真人细节并叠加网格，仅用于参考镜头节奏、运镜、构图和动作轮廓。"
            : "当前直接提交原始对标视频作为 reference_video。",
        selectedKeyframes.length
          ? `已确认关键画面时间点：${selectedKeyframes.map((frame) => `${frame.time.toFixed(1)}s`).join("、")}。请以这些画面作为复刻参考节点，保持原视频镜头节奏但重生成原创内容。`
          : "",
        mp4OnlyTest ? "" : keyframeCollagePrompt(collageImageIndex),
        !mp4OnlyTest && products.length
          ? `素材池：用户上传了 ${products.length} 个通配素材，按输入顺序分别标记为：${materialReferences.map((item, index) => `${item.label}=第${index + 1}张参考图`).join("；")}。请自动识别素材类型，能匹配到人物、服装、商品、背景、Logo 或字幕的素材优先使用；如果用户口令明确引用某个图片标签，请优先按该引用执行；匹配不上的素材不要强行使用。`
          : mp4OnlyTest
            ? ""
            : "素材池：用户未上传素材，请按复刻口令生成原创内容。",
        productInfo.trim() ? `用户复刻口令：${productInfo.trim()}` : "",
        polishedPrompt?.finalPrompt ? `AI润色复刻方案：\n${polishedPrompt.finalPrompt}` : "",
        `补充要求：${special.trim()}`,
        modelOn && modelInfo.trim()
          ? `自定义模特信息：${modelInfo.trim()}`
          : "",
      ]
        .filter((line) => !line.endsWith("："))
        .join("\n");
      const response = await fetch("/api/tasks/recreate-video/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          draftId,
          assetIds,
          prompt,
          aspectRatio: ratio,
          duration: Number(duration),
          resolution,
          scene: "镜头节奏复刻",
          style: "自然带货",
          usageAuthorized: true,
        }),
      });
      const created = await response.json();
      if (!response.ok)
        throw new Error(created.message || created.code || "创建任务失败");
      setPhase("generating");
      setStep("generate");
      if (draftId) setServerDrafts((current) => current.filter((draft) => draft.id !== draftId));
      await poll(created.taskId);
      localStorage.removeItem(draftStorageKey);
      setDraftId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
      setPhase("failed");
    }
  };

  const activeStep = workflowSteps[currentIndex] || workflowSteps[0];
  const sourceMaxStart = douyinAnalysis
    ? Math.max(0, douyinAnalysis.durationSeconds - douyinClipDuration)
    : 0;
  const durationSeconds = Number(duration);

  const stepButton = (item: (typeof workflowSteps)[number], index: number) => {
    const completed =
      (item.key === "source" && sourceReady) ||
      (item.key === "clip" && clipReady) ||
      (item.key === "product" && productReady) ||
      (item.key === "reference" && referenceReady) ||
      (item.key === "generate" && phase === "succeeded");
    const unlocked = index <= unlockedIndex;
    return (
      <button
        type="button"
        className={`recreate-step-item ${index === currentIndex ? "active" : ""} ${completed ? "done" : ""}`}
        disabled={!unlocked}
        onClick={() => setStep(item.key)}
      >
        <span>{completed ? <Check size={12} /> : item.number}</span>
        <div>
          <strong>{item.title}</strong>
          <small>{item.subtitle}</small>
        </div>
      </button>
    );
  };

  const sourcePanel = (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>添加对标视频</h2>
        </div>
        <span>1 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        视频来源可通过链接解析，也可以直接上传或从素材库挑选。
      </p>
      <div className="recreate-tabs" role="tablist" aria-label="视频来源">
        <button
          type="button"
          className={videoSource === "douyin" ? "active" : ""}
          onClick={() => {
            setVideoSource("douyin");
            setSourceMode("douyin");
            setLibraryKind(null);
          }}
        >
          链接获取
          <small>粘贴抖音分享链接</small>
        </button>
        <button
          type="button"
          className={videoSource === "local" ? "active" : ""}
          onClick={() => {
            setVideoSource("local");
            setSourceMode("upload");
            setLibraryKind(null);
          }}
        >
          上传视频
          <small>本地上传或资产库</small>
        </button>
      </div>
      {videoSource === "douyin" ? (
        <div className="recreate-source-block recreate-douyin-layout">
          <div className="recreate-douyin-left">
            <label className="recreate-field">
              粘贴抖音作品分享链接
              <textarea
                value={douyinInput}
                onChange={(event) => {
                  setDouyinInput(event.target.value);
                  setDouyinError("");
                  setDouyinAnalysis(null);
                  setFrameAnalysis(null);
                  setFrameAnalysisFrames([]);
                }}
                placeholder="粘贴抖音分享链接或完整分享文案"
              />
            </label>
            <div className="recreate-inline-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDouyinInput(
                    "复制打开抖音，看看【编导小咪的作品】不儿，ai我让你买个西瓜这么难吗？ # AI创作浪潮",
                  );
                }}
              >
                示例
              </button>
              <button
                type="button"
                onClick={analyzeDouyin}
                disabled={!douyinInput.trim() || Boolean(douyinBusy)}
              >
                {douyinBusy === "analyzing" ? (
                  <LoaderCircle className="generation-spinner" size={17} />
                ) : (
                  <Link2 size={17} />
                )}
                {douyinBusy === "analyzing" ? "正在读取视频信息" : "获取视频"}
              </button>
            </div>
            {!douyinAnalysis && (
              <p className="recreate-hint">
                支持完整分享文案；解析后右侧会临时缓存并预览原视频，系统会自动抽取十二宫格参考画面。
              </p>
            )}
            {douyinAnalysis && (
              <div className="recreate-clip-editor">
                <header>
                  <div>
                    <strong>{douyinAnalysis.title}</strong>
                    <small>视频总时长 {douyinAnalysis.durationSeconds.toFixed(1)} 秒</small>
                  </div>
                  <span>已缓存</span>
                </header>
                {douyinAnalysis.keyframeSeconds?.length ? (
                  <div className="recreate-reference-plan">
                    <strong>十二宫格参考策略</strong>
                    <small>
                      系统会自动查看这些关键时间点：
                      {douyinAnalysis.keyframeSeconds.map((second) => `${second.toFixed(1)}s`).join(" / ")}
                    </small>
                    {douyinAnalysis.referencePrompt && <p>{douyinAnalysis.referencePrompt}</p>}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setStep("clip")}
                  disabled={!sourceSelection}
                >
                  <Film size={17} />
                  生成十二宫格参考
                </button>
                <p>
                  不需要手动截取；长视频会按整体内容抽取十二宫格。最终生成仍建议控制在 15 秒以内，稳定性更高。
                </p>
              </div>
            )}
          </div>
          <aside className="recreate-douyin-preview">
            {douyinAnalysis?.cachePreviewUrl ? (
              <div className="recreate-source-cache">
                <video src={douyinAnalysis.cachePreviewUrl} controls playsInline preload="metadata" />
                <div>
                  <strong>原视频临时预览</strong>
                  <small>
                    已缓存到云端临时区
                    {douyinAnalysis.cacheByteSize
                      ? ` · ${formatBytes(douyinAnalysis.cacheByteSize)}`
                      : ""}
                  </small>
                  <small>
                    {douyinAnalysis.cacheExpiresAt
                      ? `缓存将在 ${new Date(douyinAnalysis.cacheExpiresAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} 后自动清理`
                      : "缓存保留约 1 小时"}
                  </small>
                </div>
              </div>
            ) : (
              <div className="recreate-preview-empty">
                <Video size={30} />
                <strong>等待原视频预览</strong>
                <small>粘贴链接并获取视频后，会在这里以竖屏方式展示。</small>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="recreate-source-block">
          <div className="recreate-source-tabs">
            <button
              type="button"
              className={sourceMode === "upload" ? "active" : ""}
              onClick={() => {
                setSourceMode("upload");
                setLibraryKind(null);
                refs.video.current?.click();
              }}
            >
              <Upload size={16} />
              本地上传
            </button>
            <button
              type="button"
              className={sourceMode === "library" ? "active" : ""}
              onClick={() => {
                setSourceMode("library");
                openLibrary("video");
              }}
            >
              <FolderOpen size={16} />
              资产库
            </button>
          </div>
          {libraryKind === "video" ? (
            <div className="recreate-library">
              {assetsLoading ? (
                <p>正在加载素材库</p>
              ) : assets.length ? (
                assets.map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => selectAsset(asset)}
                  >
                    <span className="recreate-library-media">
                      <Video size={23} />
                    </span>
                    <small>{asset.originalName}</small>
                  </button>
                ))
              ) : (
                <p>暂无可用视频素材</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className={`recreate-drop ${sourceSelection ? "has-file" : ""}`}
              onClick={() => refs.video.current?.click()}
            >
              <span>
                <Video size={27} />
              </span>
              <strong>上传对标视频</strong>
              <small>支持 MP4，最大 100MB，视频时长 3–15 秒</small>
              <small>
                {sourceSelection
                  ? `${sourceSelection.name} · ${formatBytes(sourceSelection.byteSize)}`
                  : "已上传 0 / 1 个"}
              </small>
              <input
                ref={refs.video}
                type="file"
                accept="video/mp4"
                onChange={(event) => choose("video", event.target.files)}
              />
            </button>
          )}
          {sourceSelection && (
            <div className="recreate-selected-source">
              <video
                src={sourceSelection.preview}
                controls
                playsInline
                preload="metadata"
              />
              <div>
                <strong>{sourceSelection.name}</strong>
                <small>
                  {sourceSelection.durationSeconds
                    ? `${sourceSelection.durationSeconds.toFixed(1)} 秒`
                    : "已保存到素材库"}
                </small>
              </div>
            </div>
          )}
        </div>
      )}
      {douyinError && (
        <div className="creator-error recreate-actionable-error" role="alert">
          <span>{douyinError}</span>
          {douyinCacheExpired ? (
            <button type="button" onClick={returnToSourceForExpiredCache}>
              <ArrowLeft size={14} />
              返回第一步重新获取
            </button>
          ) : null}
        </div>
      )}
      <div className="recreate-source-footer">
        <button
          type="button"
          className="primary"
          onClick={() => setStep("clip")}
          disabled={!sourceReady}
        >
          下一步：选择关键画面
        </button>
      </div>
    </section>
  );

  const clipPanel = (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>选择关键画面</h2>
        </div>
        <span>2 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        先把片段抽成十二宫格。至少保留 4 帧，后续会参考这些画面的节奏、构图和动作走势，再结合复刻口令做通配替换。
      </p>
      <section className="recreate-keyframe-picker">
        <header>
          <div>
            <strong>关键画面选择</strong>
            <small>
              已选 {selectedKeyframes.length}/12 · 至少 4 帧
              {frameAnalysisFrames.length
                ? " · 已有截图"
                : frameExtractionBusy
                  ? " · 正在快速抽帧"
                  : " · 当前为时间点近似"}
            </small>
          </div>
          <div>
            <button type="button" onClick={quickExtractKeyframes} disabled={frameExtractionBusy}>
              {frameExtractionBusy ? (
                <LoaderCircle className="generation-spinner" size={14} />
              ) : (
                <Film size={14} />
              )}
              {frameExtractionBusy ? "正在快速抽帧" : "快速抽取关键画面"}
            </button>
            {douyinAnalysis?.cacheId ? (
              <button type="button" onClick={analyzeReplaceableFrames} disabled={frameAnalysisBusy}>
                {frameAnalysisBusy ? (
                  <LoaderCircle className="generation-spinner" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {frameAnalysisBusy ? "正在分析" : frameAnalysis ? "重新分析参考" : "分析十二宫格"}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              onClick={toggleAllKeyframes}
              disabled={!selectableKeyframes.length}
            >
              <Check size={14} />
              {allCandidateKeyframesSelected ? "取消全选" : "全选画面"}
            </button>
            <button type="button" className="secondary" onClick={useDefaultKeyframes}>
              使用默认十二宫格
            </button>
          </div>
        </header>
        <div className="recreate-keyframe-grid recreate-frame-collage">
          {selectableKeyframes.map((frame, index) => {
            const selected = selectedKeyframeKeys.has(frame.time.toFixed(1));
            return (
              <button
                type="button"
                className={selected ? "active" : ""}
                key={`${frame.time}-${frame.url || index}`}
                onClick={() => toggleKeyframe(frame)}
              >
                {frame.url ? (
                  <img src={frame.url} alt={`${frame.time.toFixed(1)}秒关键画面`} />
                ) : (
                  keyframeFallbackVisual("待抽帧")
                )}
                <strong>{frame.label || `关键画面 ${index + 1}`}</strong>
                <small>{frame.time.toFixed(1)}s</small>
                <em>{selected ? "已选择" : "点击选择"}</em>
              </button>
            );
          })}
        </div>
        {selectedKeyframes.length < 4 ? (
          <p className="recreate-keyframe-warning">
            还需选择 {4 - selectedKeyframes.length} 帧，才能进入复刻口令与素材。
          </p>
        ) : (
          <p className="recreate-keyframe-ready">
            已确认关键画面：{selectedKeyframes.map((frame) => `${frame.time.toFixed(1)}s`).join(" / ")}
          </p>
        )}
      </section>
        <div className="recreate-source-block">
          <p className="recreate-hint">当前对标视频已可直接进入下一步。</p>
          <div className="recreate-selected-source large">
            {sourceSelection && (
              <>
                <video
                  src={sourceSelection.preview}
                  controls
                  playsInline
                  preload="metadata"
                />
                <div>
                  <strong>{sourceSelection.name}</strong>
                  <small>
                    {sourceSelection.durationSeconds
                      ? `${sourceSelection.durationSeconds.toFixed(1)} 秒`
                      : "已选中"}
                  </small>
                </div>
              </>
            )}
          </div>
        </div>
      {douyinClips.length > 0 && (
        <section className="recreate-clip-collection">
          <header>
            <div>
              <strong>已截取片段</strong>
              <small>按此顺序带入智能混剪 · {douyinClips.length}/10</small>
            </div>
            <button type="button" onClick={goToVideoMix}>
              <Film size={14} />
              带入混剪
            </button>
          </header>
          <div>
            {douyinClips.map((clip, index) => (
              <article
                className={activeClipId === clip.assetId ? "active" : ""}
                key={clip.assetId || `${clip.name}-${index}`}
              >
                <button
                  type="button"
                  className="recreate-clip-preview"
                  onClick={() => {
                    setActiveClipId(clip.assetId || null);
                    setSourceItem(clip);
                  }}
                  aria-label={`选择片段 ${index + 1}`}
                >
                  <video src={clip.preview} muted playsInline preload="metadata" />
                  <span>{index + 1}</span>
                </button>
                <button
                  type="button"
                  className="recreate-clip-name"
                  onClick={() => {
                    setActiveClipId(clip.assetId || null);
                    setSourceItem(clip);
                  }}
                >
                  <strong>{clip.name}</strong>
                  <small>
                    {typeof clip.clipStartSeconds === "number" &&
                    typeof clip.clipEndSeconds === "number"
                      ? `${clip.clipStartSeconds.toFixed(1)}–${clip.clipEndSeconds.toFixed(1)} 秒`
                      : `${clip.durationSeconds?.toFixed(1)} 秒`}
                    {activeClipId === clip.assetId ? " · 当前复刻片段" : ""}
                  </small>
                </button>
                <div className="recreate-clip-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveClip(index, -1)}
                    aria-label="片段上移"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={index === douyinClips.length - 1}
                    onClick={() => moveClip(index, 1)}
                    aria-label="片段下移"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeClip(clip.assetId)}
                    aria-label="从片段列表移除"
                  >
                    <X size={13} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="recreate-source-footer">
        <button
          type="button"
          className="primary"
          onClick={() => setStep("product")}
          disabled={!clipReady}
        >
          下一步：复刻口令与素材
        </button>
      </div>
    </section>
  );

  const assetLibrary = libraryKind ? (
    <div className="recreate-library">
      {assetsLoading ? (
        <p>正在加载素材库</p>
      ) : assets.length ? (
        assets.map((asset) => (
          <button type="button" key={asset.id} onClick={() => selectAsset(asset)}>
            {libraryKind === "video" ? (
              <span className="recreate-library-media">
                <Video size={23} />
              </span>
            ) : (
              <img src={asset.url} alt="" />
            )}
            <small>{asset.originalName}</small>
          </button>
        ))
      ) : (
        <p>暂无可用素材</p>
      )}
    </div>
  ) : null;

  const productPanel = (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>复刻口令与素材</h2>
        </div>
        <span>3 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        不用逐个指定“换哪一块”。先看十二宫格参考画面，再写一句复刻口令并上传素材池；系统会自动把能匹配上的人物、服装、商品、背景或字幕写进生成方案，匹配不上的素材不强行使用。
      </p>
      <section className="recreate-replacement-guide">
        <header>
          <div>
            <strong>十二宫格画面理解</strong>
            <small>
              {frameAnalysis
                ? "已根据关键帧识别人物、场景、动作和可替换元素"
                : douyinAnalysis?.cacheId
                  ? "可先让 AI 理解画面，再润色复刻口令"
                  : "本地视频可先使用十二宫格作为视觉参考"}
            </small>
          </div>
          {douyinAnalysis?.cacheId ? (
            <button type="button" onClick={analyzeReplaceableFrames} disabled={frameAnalysisBusy}>
              {frameAnalysisBusy ? (
                <LoaderCircle className="generation-spinner" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              {frameAnalysisBusy ? "正在处理" : frameAnalysis ? "重新分析参考" : "分析十二宫格"}
            </button>
          ) : null}
        </header>
        {(frameAnalysisFrames.length || selectedKeyframes.length) ? (
          <div className="recreate-replacement-frames recreate-frame-collage compact">
            {(frameAnalysisFrames.length ? frameAnalysisFrames : selectedKeyframes).slice(0, 12).map((frame, index) => (
              <figure key={`${frame.time}-${frame.url || index}`}>
                {frame.url ? (
                  previewImageButton(frame.url, `${frame.time.toFixed(1)}秒关键帧`)
                ) : (
                  keyframeFallbackVisual("待抽帧")
                )}
                <figcaption>{frame.time.toFixed(1)}s</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {frameAnalysis ? (
          <div className="recreate-command-insight">
            {frameAnalysis.summary ? <p>{frameAnalysis.summary}</p> : null}
            <div>
              {replacementSlots.slice(0, 5).map((slot, index) => (
                <span key={`${slot.target || "元素"}-${index}`}>
                  {slotTypeLabel(slot.slotType)}：{slot.target || slot.strategy || "可通配替换"}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {frameAnalysis?.risks?.length ? (
          <p className="recreate-replacement-risk">
            注意：{frameAnalysis.risks.slice(0, 2).join("；")}
          </p>
        ) : null}
      </section>
      <section className="recreate-command-card">
        <header>
          <div>
            <strong>写一句复刻口令</strong>
            <small>你可以说得很随意，AI 会帮你润色成生成提示词。</small>
          </div>
          <button type="button" onClick={polishRecreateCommand} disabled={frameAnalysisBusy}>
            {frameAnalysisBusy ? (
              <LoaderCircle className="generation-spinner" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {frameAnalysisBusy ? "正在润色" : "AI润色口令"}
          </button>
        </header>
        {materialReferences.length ? (
          <div className="recreate-material-tags" aria-label="素材标签">
            {materialReferences.map((material, index) => (
              <button
                type="button"
                key={`${material.label}-${index}`}
                onClick={() => insertMaterialReference(material.label)}
              >
                <span>{material.label}</span>
                <img src={material.preview} alt={`${material.label}预览`} />
              </button>
            ))}
            <small>在口令里输入 @ 可召唤素材；点击标签也可插入，悬停可预览。</small>
          </div>
        ) : null}
        <textarea
          value={productInfo}
          onChange={(event) => handleCommandInput(event.target.value)}
          onBlur={() => window.setTimeout(() => setMaterialMentionOpen(false), 140)}
          onFocus={() => {
            const match = productInfo.match(/(^|\s)@([\u4e00-\u9fa5\w-]*)$/);
            setMaterialMentionOpen(Boolean(match && materialReferences.length));
            setMaterialMentionQuery(match?.[2] || "");
          }}
          maxLength={800}
          placeholder="例如：动作和镜头节奏参考原视频，把人物服装替换为图片一，背景参考图片二，字幕改成夏季显瘦穿搭。"
        />
        {materialMentionOpen && mentionMaterials.length ? (
          <div className="recreate-mention-menu">
            {mentionMaterials.map((material, index) => (
              <button
                type="button"
                key={`${material.label}-mention-${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMaterialReference(material.label)}
              >
                <img src={material.preview} alt={`${material.label}预览`} />
                <span>@{material.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {polishedPrompt?.finalPrompt ? (
          <div className="recreate-polished-prompt">
            <strong>AI 已整理成生成方案</strong>
            {polishedPrompt.summary ? <p>{polishedPrompt.summary}</p> : null}
            <div>
              {(polishedPrompt.preserve || []).slice(0, 4).map((item) => <span key={`保留-${item}`}>保留：{item}</span>)}
              {(polishedPrompt.replace || []).slice(0, 4).map((item) => <span key={`替换-${item}`}>替换：{item}</span>)}
              {(polishedPrompt.avoid || []).slice(0, 4).map((item) => <span key={`避开-${item}`}>避开：{item}</span>)}
            </div>
            <textarea readOnly value={polishedPrompt.finalPrompt} aria-label="AI润色后的复刻提示词" />
            {polishedPrompt.providerError ? <small>{polishedPrompt.providerError}</small> : null}
          </div>
        ) : null}
      </section>
      <div className="recreate-source-tabs three">
        <button
          type="button"
          className={!libraryKind && !products.length ? "active" : ""}
          onClick={() => {
            setLibraryKind(null);
            refs.product.current?.click();
          }}
        >
          <Upload size={16} />
          本地上传
        </button>
        <button
          type="button"
          className={libraryKind === "product" ? "active" : ""}
          onClick={() => openLibrary("product")}
        >
          <FolderOpen size={16} />
          资产库
        </button>
      </div>
      {libraryKind === "product" ? (
        assetLibrary
      ) : (
        <button
          type="button"
          className="recreate-drop"
          onClick={() => refs.product.current?.click()}
        >
          <span>
            <ImagePlus size={27} />
          </span>
          <strong>上传素材池</strong>
          <small>支持人物、服装、商品、背景、Logo 或文案参考图，AI 会自动通配使用</small>
          <small>已上传 {products.length}/8 个</small>
        </button>
      )}
      <section className={`recreate-portrait-reference ${portraitCandidate?.materialKind ? "ready" : ""}`}>
        <header>
          <div>
            <strong>素材智能处理</strong>
            <small>先识别素材类型：真人走隐私化遮挡多视图，商品/场景走普通多视图参考。</small>
          </div>
          <span>{portraitCandidate?.materialKind ? materialKindLabel(portraitCandidate.materialKind) : products.length ? "待识别" : "待上传"}</span>
        </header>
        {portraitCandidate ? (
          <div className="recreate-portrait-reference-body">
            {previewImageButton(portraitCandidate.preview, portraitCandidate.name || "待处理素材预览")}
            <div>
              <strong>{privacyReference ? "@虚拟模特参考" : `当前候选：@${portraitCandidate.name.trim() || materialLabel(portraitCandidateIndex)}`}</strong>
              <p>
                {portraitCandidate.materialSummary ||
                (privacyReference
                  ? "这张图已经替换原真人素材，会作为人物 reference 提交给模型。"
                  : "先识别它是人物、商品、场景还是文字素材，再生成更适合复刻的多视图 reference。")}
              </p>
              <div className="recreate-portrait-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => analyzeMaterial(portraitCandidateIndex)}
                  disabled={materialAnalysisBusyIndex !== null || privacyViewBusyIndex !== null}
                >
                  {materialAnalysisBusyIndex === portraitCandidateIndex ? (
                    <LoaderCircle className="generation-spinner" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {materialAnalysisBusyIndex === portraitCandidateIndex ? "正在识别素材" : "智能识别素材"}
                </button>
                <label className="recreate-kind-select">
                  主动标识
                  <select
                    value={portraitCandidate.materialKind && ["person", "product", "scene"].includes(portraitCandidate.materialKind) ? portraitCandidate.materialKind : ""}
                    onChange={(event) => setMaterialKind(portraitCandidateIndex, event.target.value as MaterialKind)}
                    disabled={privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                  >
                    <option value="">请选择类型</option>
                    <option value="person">模特/人物</option>
                    <option value="product">商品/物体</option>
                    <option value="scene">场景/背景</option>
                  </select>
                </label>
              <button
                type="button"
                className="privacy-view"
                onClick={() => createPrivacyMultiView(portraitCandidateIndex)}
                disabled={privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
              >
                {privacyViewBusyIndex === portraitCandidateIndex ? (
                  <LoaderCircle className="generation-spinner" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                  {privacyViewBusyIndex === portraitCandidateIndex
                  ? "正在生成多视图参考"
                  : portraitCandidate.materialKind === "person"
                    ? "生成隐私化人物多视图"
                    : portraitCandidate.materialKind === "scene"
                      ? "生成场景多视图"
                      : portraitCandidate.materialKind && portraitCandidate.materialKind !== "unknown"
                        ? "生成商品多视图"
                      : "生成通用多视图参考"}
              </button>
              {portraitCandidate.materialKind === "person" ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => strengthenFaceMask(portraitCandidateIndex)}
                  disabled={faceMaskBusyIndex !== null || privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                >
                  {faceMaskBusyIndex === portraitCandidateIndex ? (
                    <LoaderCircle className="generation-spinner" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {faceMaskBusyIndex === portraitCandidateIndex ? "正在强化遮盖" : "强化脸部遮盖"}
                </button>
              ) : null}
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="recreate-portrait-empty" onClick={() => refs.product.current?.click()}>
            <ImagePlus size={18} />
            先上传真人/模特图片
          </button>
        )}
      </section>
      {products.length > 0 && (
        <div className="recreate-selected-images">
          {products.map((product, index) => (
            <article key={`${product.assetId || product.preview}-${index}`}>
              {previewImageButton(product.preview, product.name || `素材 ${index + 1}`)}
              <label>
                <small>引用标签：@{product.name.trim() || materialLabel(index)}</small>
                {product.materialKind ? <small>识别：{materialKindLabel(product.materialKind)}</small> : null}
                <input
                  value={product.name}
                  onChange={(event) => renameProduct(index, event.target.value)}
                  onBlur={() => normalizeProductName(index)}
                  maxLength={18}
                  aria-label={`重命名${materialLabel(index)}`}
                  placeholder={materialLabel(index)}
                />
                <label className="recreate-material-kind-select">
                  类型
                  <select
                    value={product.materialKind && ["person", "product", "scene"].includes(product.materialKind) ? product.materialKind : ""}
                    onChange={(event) => setMaterialKind(index, event.target.value as MaterialKind)}
                    disabled={privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                  >
                    <option value="">请选择</option>
                    <option value="person">模特</option>
                    <option value="product">商品</option>
                    <option value="scene">场景</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="privacy-view"
                  onClick={() => createPrivacyMultiView(index)}
                  disabled={privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                >
                  {privacyViewBusyIndex === index ? (
                    <LoaderCircle className="generation-spinner" size={12} />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {privacyViewBusyIndex === index
                    ? "生成中"
                    : product.materialKind === "person"
                      ? "人物多视图"
                      : product.materialKind === "scene"
                        ? "场景多视图"
                      : "素材多视图"}
                </button>
                {product.materialKind === "person" ? (
                  <button
                    type="button"
                    className="privacy-view"
                    onClick={() => strengthenFaceMask(index)}
                    disabled={faceMaskBusyIndex !== null || privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                  >
                    {faceMaskBusyIndex === index ? (
                      <LoaderCircle className="generation-spinner" size={12} />
                    ) : (
                      <Sparkles size={12} />
                    )}
                    {faceMaskBusyIndex === index ? "遮盖中" : "强化遮盖"}
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => {
                  removeProduct(index);
                  clearTaskState();
                }}
                aria-label="移除替换素材"
              >
                <X size={14} />
              </button>
              <span>{index + 1}</span>
            </article>
          ))}
        </div>
      )}
      <div className="recreate-source-footer">
        <button
          type="button"
          className="primary"
          onClick={() => setStep("reference")}
          disabled={!productReady}
        >
          下一步：确认生成方案
        </button>
      </div>
      <input
        ref={refs.product}
        type="file"
        accept={imageAccept}
        multiple
        onChange={(event) => choose("product", event.target.files)}
        hidden
      />
    </section>
  );

  const referencePanel = (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div className="recreate-frame-collage">
          <strong>当前步骤</strong>
          <h2>确认生成方案</h2>
        </div>
        <span>4 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        最后确认系统会怎么复刻：十二宫格作为镜头参考，素材池作为通配替换来源，复刻口令会被整理成最终生成提示词。
      </p>
      <section className="recreate-reference-keyframes">
        <header>
          <strong>十二宫格参考画面</strong>
          <small>{selectedKeyframes.length} 帧会作为最终成片的镜头节奏和构图参考</small>
        </header>
        <div>
          {selectedKeyframes.map((frame, index) => (
            <figure key={`${frame.time}-${frame.url || index}`}>
              {frame.url ? (
                previewImageButton(frame.url, `${frame.time.toFixed(1)}秒参考画面`)
              ) : (
                keyframeFallbackVisual("待抽帧")
              )}
              <figcaption>{frame.time.toFixed(1)}s</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="recreate-plan-preview">
        <header>
          <strong>复刻方案摘要</strong>
          <small>{polishedPrompt?.finalPrompt ? "已使用 AI 润色方案" : "未润色时会使用基础通配方案"}</small>
        </header>
        <div className="recreate-plan-tags">
          <span>保留：镜头节奏</span>
          <span>保留：构图与动作走势</span>
          <span>素材：{products.length ? `${products.length} 个素材自动通配` : "未上传素材，按口令生成"}</span>
          <span>避开：水印 / 原字幕 / 原品牌</span>
        </div>
        {materialReferences.length ? (
          <div className="recreate-material-tags" aria-label="最终素材标签">
            {materialReferences.map((material, index) => (
              <button type="button" key={`${material.label}-confirm-${index}`}>
                <span>{material.label}</span>
                <img src={material.preview} alt={`${material.label}预览`} />
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          readOnly
          value={
            polishedPrompt?.finalPrompt ||
            [
              "参考对标视频的十二宫格关键画面，保留镜头节奏、构图、动作走势和光线氛围。",
              productInfo.trim()
                ? `复刻口令：${productInfo.trim()}`
                : "按上传素材做通配替换；能匹配到人物、服装、商品、背景或字幕的素材优先使用。",
              materialReferences.length
                ? `素材标签：${materialReferences.map((item, index) => `${item.label}=第${index + 1}张参考图`).join("；")}。`
                : "",
              "匹配不上的素材不要强行使用。生成原创短视频，不复制原人物脸、原商品、原品牌、Logo、水印或原字幕。",
            ].filter(Boolean).join("\n")
          }
          aria-label="最终复刻生成方案"
        />
      </section>
      {products.length > 0 ? (
        <div className="recreate-selected-images">
          {products.map((product, index) => (
            <article key={`${product.assetId || product.name}-confirm-${index}`}>
              {previewImageButton(product.preview, product.name || `素材 ${index + 1}`)}
              <span>{index + 1}</span>
            </article>
          ))}
        </div>
      ) : null}
      <button type="button" className="recreate-inline-secondary" onClick={polishRecreateCommand} disabled={frameAnalysisBusy}>
        {frameAnalysisBusy ? <LoaderCircle className="generation-spinner" size={15} /> : <Sparkles size={15} />}
        {polishedPrompt?.finalPrompt ? "重新润色复刻口令" : "AI润色复刻口令"}
      </button>
      <label className="recreate-consent">
        <input
          type="checkbox"
          checked={referenceConfirmed}
          onChange={(event) => {
            setReferenceConfirmed(event.target.checked);
            clearTaskState();
          }}
        />
        我确认使用当前十二宫格、素材池和复刻口令生成原创视频
      </label>
      <div className="recreate-source-footer">
        <button
          type="button"
          className="primary"
          onClick={() => setStep("generate")}
          disabled={!referenceReady}
        >
          下一步：生成复刻视频
        </button>
      </div>
    </section>
  );

  const generatePanel = (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>生成复刻视频</h2>
        </div>
        <span>5 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        这里会把当前复刻链路提交到任务中心，并显示加载进度和预计时间。
      </p>
      <div className="recreate-meta-grid">
        <label>
          视频比例
          <span className="recreate-select">
            <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
              <option value="9:16">竖屏（9:16）</option>
              <option value="16:9">横屏（16:9）</option>
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
        <label>
          视频时长
          <span className="recreate-select">
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="5">5 秒</option>
              <option value="10">10 秒</option>
              <option value="15">15 秒</option>
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
        <label>
          视频分辨率
          <span className="recreate-select">
            <select
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            >
              <option>480p</option>
              <option>720p</option>
              <option>1080p</option>
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
      </div>
      <label className="recreate-consent">
        <input
          type="checkbox"
          checked={usageAuthorized}
          onChange={(event) => {
            setUsageAuthorized(event.target.checked);
            clearTaskState();
          }}
        />
        我确认拥有对标视频、素材池及复刻口令中相关内容的合法使用授权
      </label>
      <label className="recreate-toggle">
        仅 MP4 测试模式
        <input
          type="checkbox"
          checked={mp4OnlyTest}
          onChange={(event) => {
            setMp4OnlyTest(event.target.checked);
            clearTaskState();
          }}
        />
        <i />
      </label>
      {mp4OnlyTest ? (
        <p className="recreate-test-note">
          只提交对标 MP4 给 Ark，不提交十二宫格、素材池和多视图图。用于排查当前报错是否由 MP4 本身触发。
        </p>
      ) : null}
      <label className="recreate-toggle">
        轻量合规参考视频
        <input
          type="checkbox"
          checked={compliantReferenceVideo}
          onChange={(event) => {
            setCompliantReferenceVideo(event.target.checked);
            clearTaskState();
          }}
          disabled={mp4OnlyTest}
        />
        <i />
      </label>
      <p className="recreate-test-note">
        {compliantReferenceVideo && !mp4OnlyTest
          ? "提交前会先生成低清、模糊、去音频、带网格的结构参考视频，尽量保留动作节奏并降低真人可识别度。"
          : mp4OnlyTest
            ? "MP4 测试模式会跳过合规处理，用于验证原视频是否被 Ark 接受。"
            : "当前会直接提交原始对标视频，含真人时可能被 Ark 拒绝。"}
      </p>
      <label className="recreate-toggle">
        自定义模特信息
        <input
          type="checkbox"
          checked={modelOn}
          onChange={(event) => {
            setModelOn(event.target.checked);
            clearTaskState();
          }}
        />
        <i />
      </label>
      {modelOn && (
        <label className="recreate-field">
          模特信息（可选）
          <textarea
            value={modelInfo}
            onChange={(event) => setModelInfo(event.target.value)}
            maxLength={300}
            placeholder="例如：女性，25 岁，自然亲和，居家穿搭"
          />
        </label>
      )}
      <label className="recreate-field">
        复刻口令（可选）
        <textarea
          value={productInfo}
          onChange={(event) => handleCommandInput(event.target.value)}
          onBlur={() => window.setTimeout(() => setMaterialMentionOpen(false), 140)}
          maxLength={800}
          placeholder="例如：动作和节奏参考原视频，把服装换成 @图片一，背景保持干净明亮。"
        />
        {materialMentionOpen && mentionMaterials.length ? (
          <div className="recreate-mention-menu">
            {mentionMaterials.map((material, index) => (
              <button
                type="button"
                key={`${material.label}-generate-mention-${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMaterialReference(material.label)}
              >
                <img src={material.preview} alt={`${material.label}预览`} />
                <span>@{material.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </label>
      <label className="recreate-field">
        补充要求（可选）
        <textarea
          value={special}
          onChange={(event) => setSpecial(event.target.value)}
          maxLength={600}
          placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影"
        />
      </label>
      <p className="recreate-credit">
        <Sparkles size={16} />
        预计积分：
        {generateReady ? "40 积分" : "待补全前置步骤"}
      </p>
      {phase === "uploading" || phase === "generating" ? (
        <VideoGenerationProgress
          phase={phase}
          taskStatus={result?.status}
          title="复刻带货视频"
          durationSeconds={durationSeconds}
        />
      ) : null}
      {error && (
        <p className="creator-error" role="alert">
          {error}
        </p>
      )}
      {phase === "succeeded" && result?.outputs[0] && (
        <div className="recreate-result">
          <video src={result.outputs[0].url} controls playsInline />
          <a href={`/api/assets/${result.outputs[0].assetId}/download/`}>
            <Download size={16} />
            下载视频
          </a>
          <button type="button" onClick={goToVideoMix}>
            <Film size={16} />
            前往智能混剪
          </button>
        </div>
      )}
      <div className="recreate-actions">
        <button
          className="secondary"
          type="button"
          onClick={goPreviousStep}
          disabled={!canGoPrevious}
        >
          <ArrowLeft size={16} />
          上一步
        </button>
        <button className="primary" type="submit" disabled={!generateReady || phase !== "idle"}>
          {phase === "uploading" || phase === "generating" ? (
            <LoaderCircle className="generation-spinner" size={18} />
          ) : (
            <Film size={18} />
          )}
          {phase === "uploading" || phase === "generating" ? "任务处理中" : "生成复刻视频"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={startNewDraft}
        >
          重置
        </button>
      </div>
    </section>
  );

  if (!account)
    return (
      <main className="workspace-loading">
        <Sparkles size={22} />
        <p>正在载入复刻工作台</p>
      </main>
    );

  return (
    <main className="recreate-flow-shell">
      <header className="recreate-flow-header">
        <button type="button" onClick={() => router.push("/create/product-video")}>
          <ArrowLeft size={19} />
          返回一站式视频带货
        </button>
        <div className="recreate-flow-header-actions">
          <button type="button" onClick={saveDraft}>
            <Save size={16} />
            保存项目
          </button>
          <Link href="/tasks">
            <Film size={16} />
            同步任务中心
          </Link>
        </div>
      </header>
      <form className="recreate-flow-card" onSubmit={submit}>
        <section className="recreate-flow-sidebar">
          <div className="recreate-flow-brand">
            <span>REFERENCE REPLICA</span>
            <strong>爆款视频换品复刻</strong>
            <p>我有对标视频：换商品、换模特，保留爆款节奏</p>
          </div>
          <button type="button" className="recreate-tutorial">
            <div>
              <strong>开始前建议观看</strong>
              <small>快速上手教学</small>
            </div>
            <span>立即观看</span>
          </button>
          <section className="recreate-draft-box">
            <div className="recreate-draft-box-head">
              <div>
                <strong>当前项目</strong>
                <small>
                  {draftSyncState === "saving"
                    ? "正在自动保存"
                    : draftSyncState === "saved"
                      ? "已同步到账户"
                      : draftSyncState === "error"
                        ? "同步失败，本地已兜底"
                        : "跨设备恢复"}
                </small>
              </div>
              <button type="button" onClick={() => refreshDrafts(false)} disabled={draftsLoading}>
                {draftsLoading ? "读取中" : "刷新"}
              </button>
            </div>
            <label className="recreate-draft-title">
              项目名称
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                maxLength={80}
                placeholder="给这次复刻项目起个名字"
              />
            </label>
            <button type="button" className="recreate-new-draft" onClick={startNewDraft}>
              重置当前项目
            </button>
            <div className="recreate-draft-list">
              {visibleDrafts.length ? (
                visibleDrafts.map((draft) => (
                  <article className={draft.id === draftId ? "active" : ""} key={draft.id}>
                    <button type="button" onClick={() => continueDraft(draft)}>
                      <strong>{draft.title}</strong>
                      <small>
                        最近编辑 {new Date(draft.updatedAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </button>
                    <button type="button" aria-label="删除项目" onClick={() => deleteDraft(draft.id)}>
                      <X size={13} />
                    </button>
                  </article>
                ))
              ) : (
                <p>{draftsLoading ? "正在读取项目…" : "暂无服务器项目"}</p>
              )}
            </div>
          </section>
          <div className="recreate-flow-summary">
            <strong>制作流程</strong>
            <span>{completedCount}/5</span>
          </div>
          <div className="recreate-step-list">{workflowSteps.map((item, index) => stepButton(item, index))}</div>
        </section>
        <section className="recreate-flow-main">
          <header className="recreate-stage-header">
            <div>
              <span>CURRENT STAGE</span>
              <strong>{activeStep.title}</strong>
              <small>{activeStep.subtitle}</small>
            </div>
            <span>离开时可保存</span>
          </header>
          <div className="recreate-flow-toolbar">
            <div>
              <strong>{activeStep.number} / 5</strong>
              <small>{activeStep.title}</small>
            </div>
            <div className="recreate-flow-toolbar-actions">
              <button type="button" onClick={goPreviousStep} disabled={!canGoPrevious}>
                <ArrowLeft size={14} />
                上一步
              </button>
              <span>当前步骤会自动保存到项目</span>
            </div>
          </div>
          {step === "source" && sourcePanel}
          {step === "clip" && clipPanel}
          {step === "product" && productPanel}
          {step === "reference" && referencePanel}
          {step === "generate" && generatePanel}
          {notice && <p className="creator-success">{notice}</p>}
          {douyinError && step !== "source" && (
            <div className="creator-error recreate-actionable-error" role="alert">
              <span>{douyinError}</span>
              {douyinCacheExpired ? (
                <button type="button" onClick={returnToSourceForExpiredCache}>
                  <ArrowLeft size={14} />
                  返回第一步重新获取
                </button>
              ) : null}
            </div>
          )}
        </section>
      </form>
      {previewMedia ? (
        <div
          className="asset-preview-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setPreviewMedia(null)}
        >
          <section className="asset-preview-modal" role="dialog" aria-modal="true" aria-label={`预览${previewMedia.name}`}>
            <button
              className="asset-preview-close"
              type="button"
              aria-label="关闭预览"
              title="关闭"
              onClick={() => setPreviewMedia(null)}
            >
              <X size={21} />
            </button>
            <div className="asset-preview-stage">
              <img src={previewMedia.url} alt={previewMedia.name} />
            </div>
            <footer>
              <div>
                <strong>{previewMedia.name}</strong>
                <small>复刻素材预览</small>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
