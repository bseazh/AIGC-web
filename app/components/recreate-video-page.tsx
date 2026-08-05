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
    cameraMovement?: string;
    people?: unknown;
    replaceableParts?: string[];
    riskNotes?: string[];
  }>;
  actionTimeline?: Array<{
    time?: number;
    pose?: string;
    hands?: string;
    feet?: string;
    bodyWeight?: string;
    camera?: string;
    transitionToNext?: string;
    replicationInstruction?: string;
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
  usageAuthorized: boolean;
  productInfo: string;
  special: string;
  polishedPrompt: PolishedRecreatePrompt | null;
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
  { key: "reference", number: 4, title: "内置复刻策略", subtitle: "自动整理镜头与替换关系" },
  { key: "generate", number: 5, title: "提交生成", subtitle: "开始任务输出" },
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
    usageAuthorized,
    productInfo,
    special,
    polishedPrompt,
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
        draft.polishedPrompt,
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
    setUsageAuthorized(Boolean(draft.usageAuthorized));
    setProductInfo(draft.productInfo || "");
    setSpecial(draft.special || "");
    setPolishedPrompt(draft.polishedPrompt || null);
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
        strategy: "如需要换模特，上传模特参考图；只参考原视频动作和站位，不复制原人脸。",
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
    if (slot.slotType === "person") return "建议上传模特图";
    if (slot.slotType === "scene") return "建议上传场景参考图或氛围图";
    if (slot.slotType === "text") return "建议填写品牌、卖点、价格，不建议复刻原字幕";
    if (slot.slotType === "style") return "通常无需上传，作为镜头节奏参考";
    if (slot.slotType === "product") return "建议上传商品图或主体参考图";
    const normalized = slot.target || "";
    if (/模特|人物|手|人脸|动作/.test(normalized)) return "建议上传模特图";
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
  const productReady = products.length > 0 || Boolean(productInfo.trim()) || Boolean(polishedPrompt?.finalPrompt);
  const referenceReady = productReady;
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
    phase,
    productInfo,
    products,
    polishedPrompt,
    ratio,
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

  const captureVideoFrameForCanvas = (videoUrl: string, time: number) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("当前浏览器无法截取关键帧"));
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
        reject(new Error("视频关键帧读取失败"));
      };
      video.onloadedmetadata = () => {
        const targetTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("视频关键帧定位超时"));
        }, 5000);
        video.onseeked = () => {
          window.clearTimeout(timeout);
          try {
            canvas.width = video.videoWidth || 720;
            canvas.height = video.videoHeight || 1280;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = new Image();
            image.onload = () => {
              cleanup();
              resolve(image);
            };
            image.onerror = () => {
              cleanup();
              reject(new Error("视频关键帧截图加载失败"));
            };
            image.src = canvas.toDataURL("image/jpeg", 0.86);
          } catch (error) {
            cleanup();
            reject(error);
          }
        };
        video.currentTime = targetTime;
      };
      video.src = videoUrl;
    });

  const drawKeyframePlaceholder = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string) => {
    context.save();
    context.fillStyle = "#edf4fa";
    context.fillRect(x, y, width, height);
    context.fillStyle = "#7a8fa4";
    context.font = "22px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x + width / 2, y + height / 2);
    context.restore();
  };

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
    setUsageAuthorized(false);
    setProductInfo("");
    setSpecial("");
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
      const body = await requestReferenceFrameAnalysis();
      applyReferenceFrameAnalysis(body);
      setNotice("AI 已识别关键帧，并生成基础复刻方案");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "关键帧识别失败");
    } finally {
      setFrameAnalysisBusy(false);
    }
  };

  const requestReferenceFrameAnalysis = async () => {
    if (!douyinAnalysis?.cacheId) throw new Error("请先获取对标视频");
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
            "替换模特",
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
    return body as { analysis?: RecreateFrameAnalysis; frames?: Array<{ time: number; url: string }> };
  };

  const applyReferenceFrameAnalysis = (body: { analysis?: RecreateFrameAnalysis; frames?: Array<{ time: number; url: string }> }) => {
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
      const analysisPrompt = body.analysis?.prompt;
      if (analysisPrompt) {
        setPolishedPrompt((current) => current || {
          summary: body.analysis?.summary || "已根据关键帧生成基础复刻方案",
          preserve: ["镜头节奏", "构图", "动作走势", "光线氛围"],
          replace: ["按复刻口令和上传素材做通配替换"],
          materialUse: ["能匹配上的素材优先使用，匹配不上的素材不强行使用"],
          avoid: ["原人物脸", "原商品", "原品牌", "Logo", "水印", "原字幕"],
          finalPrompt: analysisPrompt,
        });
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

  const tracePrivacyMultiView = (stage: string, details: Record<string, unknown> = {}) => {
    const payload = { stage, details };
    console.info("[recreate-multiview]", stage, details);
    fetch("/api/tasks/recreate-reference/?debug=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
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
    const drawMotionStructureKeyframe = (
      image: HTMLImageElement,
      x: number,
      y: number,
      cellWidth: number,
      cellHeight: number,
    ) => {
      const proxy = document.createElement("canvas");
      proxy.width = 144;
      proxy.height = 256;
      const proxyContext = proxy.getContext("2d");
      if (!proxyContext) return false;
      const proxyScale = Math.max(proxy.width / image.naturalWidth, proxy.height / image.naturalHeight);
      const proxyDrawWidth = image.naturalWidth * proxyScale;
      const proxyDrawHeight = image.naturalHeight * proxyScale;
      proxyContext.fillStyle = "#ffffff";
      proxyContext.fillRect(0, 0, proxy.width, proxy.height);
      proxyContext.drawImage(
        image,
        (proxy.width - proxyDrawWidth) / 2,
        (proxy.height - proxyDrawHeight) / 2,
        proxyDrawWidth,
        proxyDrawHeight,
      );
      const source = proxyContext.getImageData(0, 0, proxy.width, proxy.height);
      const output = proxyContext.createImageData(proxy.width, proxy.height);
      const gray = new Uint8ClampedArray(proxy.width * proxy.height);
      for (let index = 0; index < gray.length; index += 1) {
        const offset = index * 4;
        gray[index] = Math.round(source.data[offset] * 0.299 + source.data[offset + 1] * 0.587 + source.data[offset + 2] * 0.114);
      }
      const pixel = (px: number, py: number) => gray[Math.max(0, Math.min(proxy.height - 1, py)) * proxy.width + Math.max(0, Math.min(proxy.width - 1, px))];
      for (let py = 0; py < proxy.height; py += 1) {
        for (let px = 0; px < proxy.width; px += 1) {
          const gx =
            -pixel(px - 1, py - 1) + pixel(px + 1, py - 1) -
            2 * pixel(px - 1, py) + 2 * pixel(px + 1, py) -
            pixel(px - 1, py + 1) + pixel(px + 1, py + 1);
          const gy =
            -pixel(px - 1, py - 1) - 2 * pixel(px, py - 1) - pixel(px + 1, py - 1) +
            pixel(px - 1, py + 1) + 2 * pixel(px, py + 1) + pixel(px + 1, py + 1);
          const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));
          const line = magnitude > 34 ? 30 : 246;
          const offset = (py * proxy.width + px) * 4;
          output.data[offset] = line;
          output.data[offset + 1] = line;
          output.data[offset + 2] = line;
          output.data[offset + 3] = 255;
        }
      }
      proxyContext.putImageData(output, 0, 0);
      context.save();
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, 18);
      context.clip();
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, cellWidth, cellHeight);
      context.imageSmoothingEnabled = true;
      context.filter = "contrast(1.08)";
      context.drawImage(proxy, x, y, cellWidth, cellHeight);
      context.filter = "none";
      context.fillStyle = "rgba(255, 255, 255, 0.12)";
      context.fillRect(x, y, cellWidth, cellHeight);
      context.strokeStyle = "rgba(14, 165, 233, 0.34)";
      context.lineWidth = 1;
      for (let gridX = x + cellWidth / 3; gridX < x + cellWidth; gridX += cellWidth / 3) {
        context.beginPath();
        context.moveTo(gridX, y);
        context.lineTo(gridX, y + cellHeight);
        context.stroke();
      }
      for (let gridY = y + cellHeight / 4; gridY < y + cellHeight; gridY += cellHeight / 4) {
        context.beginPath();
        context.moveTo(x, gridY);
        context.lineTo(x + cellWidth, gridY);
        context.stroke();
      }
      context.restore();
      return true;
    };
    for (const [index, frame] of frames.entries()) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (cellWidth + gap);
      const y = padding + row * (cellHeight + labelHeight + gap);
      const image = await loadImageForCanvas(frame.url)
        .catch(() => sourceSelection?.preview ? captureVideoFrameForCanvas(sourceSelection.preview, frame.time) : null)
        .catch(() => null);
      if (image) {
        drawMotionStructureKeyframe(image, x, y, cellWidth, cellHeight);
      } else {
        drawKeyframePlaceholder(context, x, y, cellWidth, cellHeight, "关键帧暂不可用");
      }
      context.fillStyle = "rgba(15, 23, 42, 0.86)";
      context.fillRect(x, y + cellHeight - labelHeight, cellWidth, labelHeight);
      context.fillStyle = "#ffffff";
      context.fillText(`画面 ${index + 1} · ${frame.time.toFixed(1)}s`, x + 14, y + cellHeight - labelHeight / 2);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("十二宫格参考图导出失败");
    const file = new File([blob], "recreate-motion-structure-collage.jpg", { type: "image/jpeg" });
    const preview = URL.createObjectURL(file);
    try {
      return await upload({
        file,
        preview,
        name: "动作结构十二宫格参考图",
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
      ? `动作结构十二宫格参考图：第${collageImageIndex}张参考图是一张由已选关键画面转换成边缘轮廓线稿的动作结构板；请按从左到右、从上到下理解每个关键帧的人体姿态、四肢方向、重心变化、站位、景别和镜头节奏，不得把它当作人物脸、商品细节、品牌、Logo、水印或字幕参考。`
      : "十二宫格参考图：当前只有关键画面时间点，未能提交拼接图；请主要参考对标视频的镜头节奏和已确认时间点。";

  const builtInRecreatePrompt = (collageImageIndex: number | null) =>
    [
      "【系统内置复刻策略】",
      "先阅读 reference_video 和动作结构十二宫格参考图，提取原视频的镜头顺序、景别变化、主体站位、动作节奏、运镜方向、构图重心、光线氛围和剪辑节点；这些内容是本次复刻的结构骨架。",
      collageImageIndex
        ? `第${collageImageIndex}张参考图是已转换成边缘轮廓线稿的十二宫格关键帧拼图，必须按从左到右、从上到下的顺序理解镜头推进；重点复刻每格里四肢方向、身体倾斜、步伐、手势、重心和出镜位置，不表示可复制的人脸、商品、品牌或字幕。`
        : "如果十二宫格拼图不可用，则以 reference_video 和已确认关键帧时间点作为镜头结构依据。",
      "再阅读其余上传图片作为替换素材：人物/模特素材用于替换原视频人物或手部动作主体，商品素材用于替换原视频售卖商品，场景素材用于替换背景氛围，文字/Logo 素材只作为用户新内容参考。",
      "生成时保留原视频的动作参考、镜头节奏、构图、景别、人物/商品出现时机和展示逻辑；但必须重生成原创画面，不复制原人物脸、原商品、原品牌、Logo、水印、字幕或可识别真实身份。",
      "如果上传了 @虚拟模特参考 或人物多视图参考，必须用该新模特替换原视频中的真人主体：参考原视频动作、姿态、走位和出镜节奏，但脸型、发型、身形、服装关系以用户上传人物素材为准。",
      "如果上传了商品或服装素材，必须让新商品/服装出现在原视频对应展示位置和镜头段落里，保持新商品外观、颜色、材质、比例和关键细节准确。",
      "用户不需要写专业提示词；即使用户口令为空，也按以上内置策略自动完成镜头复刻和素材替换。",
    ].join("\n");

  const actionDirectorPrompt = (analysis: RecreateFrameAnalysis | null | undefined) => {
    const timeline = (analysis?.actionTimeline || []).filter((item) => typeof item?.time === "number");
    if (timeline.length) {
      return [
        "【逐帧动作导演脚本】",
        "必须按以下时间顺序连续复刻动作走势，不要生成无关走路、站立摆拍或随机展示镜头；每个关键动作之间要平滑过渡。",
        ...timeline.slice(0, 12).map((item, index) => [
          `动作 ${index + 1}｜${Number(item.time).toFixed(1)}s：`,
          item.pose ? `姿态：${item.pose}` : "",
          item.hands ? `手部：${item.hands}` : "",
          item.feet ? `脚步：${item.feet}` : "",
          item.bodyWeight ? `重心：${item.bodyWeight}` : "",
          item.camera ? `镜头：${item.camera}` : "",
          item.transitionToNext ? `衔接：${item.transitionToNext}` : "",
          item.replicationInstruction ? `执行：${item.replicationInstruction}` : "",
        ].filter(Boolean).join(" ")),
      ].join("\n");
    }
    if (analysis?.frames?.length) {
      return [
        "【逐帧动作导演脚本】",
        "根据关键帧分析按时间顺序复刻动作走势，重点保持主体站位、姿态、手脚方向、重心变化、景别和镜头节奏。",
        ...analysis.frames.slice(0, 12).map((frame, index) =>
          `动作 ${index + 1}｜${Number(frame.time || 0).toFixed(1)}s：${frame.shotType || "参考该帧景别"}；${frame.cameraMovement || "保持该帧镜头关系"}；${frame.scene || "按该帧主体姿态和构图重演"}。`,
        ),
      ].join("\n");
    }
    return selectedKeyframes.length
      ? [
          "【逐帧动作导演脚本】",
          "按已选关键帧时间点连续复刻动作：逐格读取动作结构十二宫格中的人体姿态、手脚方向、重心变化、站位和景别，生成时让新模特/新商品在相同时间节点完成对应动作，不要只生成普通走路或随机停顿。",
          `关键帧时间：${selectedKeyframes.map((frame) => `${frame.time.toFixed(1)}s`).join(" -> ")}。`,
        ].join("\n")
      : "";
  };

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
        const cellX = column / columns;
        const cellY = row / rows;
        regions.push({
          x: cellX + 0.35 / columns,
          y: cellY + 0.15 / rows,
          width: 0.3 / columns,
          height: 0.16 / rows,
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
    const regions = detectedRegions.length ? detectedRegions : canvas.width < canvas.height ? fallbackFaceRegions(canvas.width, canvas.height) : [];
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
    if (!compliantReferenceVideo) return assetId;
    setNotice("正在生成动作结构参考视频");
    const response = await fetch("/api/workflows/recreate-video-sanitize/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId, aspectRatio: ratio }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || "合规参考视频生成失败");
    setNotice("已生成动作结构参考视频，将用于提交给视频模型");
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

  const pollPrivacyViewTask = async (taskId: string, flowId?: string) => {
    const deadline = Date.now() + 10 * 60 * 1000;
    tracePrivacyMultiView("poll_started", { flowId, taskId });
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" });
      const task = await response.json().catch(() => null);
      if (!response.ok) throw new Error(task?.message || "多视图任务查询失败");
      if (task.status === "SUCCEEDED" && task.outputs?.[0]) {
        tracePrivacyMultiView("task_succeeded", { flowId, taskId, outputCount: Array.isArray(task.outputs) ? task.outputs.length : 0 });
        return task.outputs as Array<{ assetId: string; url: string; name?: string }>;
      }
      if (task.status === "FAILED" || task.status === "CANCELED") {
        tracePrivacyMultiView("task_failed", { flowId, taskId, status: task.status, errorCode: task.errorCode });
        throw new Error(task.errorCode || "多视图参考生成失败");
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    tracePrivacyMultiView("poll_timeout", { flowId, taskId });
    throw new Error("多视图参考仍在生成中，请稍后在任务中心查看");
  };

  const createMultiViewBoardAsset = async (outputs: Array<{ assetId: string; url: string; name?: string }>, name: string) => {
    const selected = outputs.slice(0, 8);
    if (selected.length === 1) {
      return { assetId: selected[0].assetId, url: selected[0].url, byteSize: 0 };
    }
    const images = await Promise.all(selected.map((output) => loadImageForCanvas(output.url)));
    const columns = selected.length <= 4 ? 2 : 4;
    const rows = Math.ceil(selected.length / columns);
    const cellWidth = 420;
    const cellHeight = 620;
    const labelHeight = 38;
    const gap = 10;
    const padding = 18;
    const width = columns * cellWidth + (columns - 1) * gap + padding * 2;
    const height = rows * (cellHeight + labelHeight) + (rows - 1) * gap + padding * 2;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("多视图参考板生成失败");
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, width, height);
    context.font = "22px sans-serif";
    context.textBaseline = "middle";
    const labels = ["正面", "左 45°", "右 45°", "背面", "左侧身", "右侧身", "上半身", "下半身"];
    images.forEach((image, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (cellWidth + gap);
      const y = padding + row * (cellHeight + labelHeight + gap);
      const scale = Math.min(cellWidth / image.naturalWidth, cellHeight / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const drawX = x + (cellWidth - drawWidth) / 2;
      const drawY = y + (cellHeight - drawHeight) / 2;
      context.fillStyle = "#ffffff";
      context.roundRect(x, y, cellWidth, cellHeight, 18);
      context.fill();
      context.save();
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, 18);
      context.clip();
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      context.restore();
      context.fillStyle = "rgba(15, 23, 42, 0.88)";
      context.fillRect(x, y + cellHeight, cellWidth, labelHeight);
      context.fillStyle = "#ffffff";
      context.fillText(labels[index] || `视图 ${index + 1}`, x + 14, y + cellHeight + labelHeight / 2);
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("多视图参考板导出失败");
    const file = new File([blob], "recreate-multiview-board.jpg", { type: "image/jpeg" });
    const preview = URL.createObjectURL(file);
    const assetId = await upload({ file, preview, name, byteSize: file.size });
    const url = await resolveAssetPreviewUrl(assetId, preview);
    if (url !== preview) URL.revokeObjectURL(preview);
    return { assetId, url, byteSize: file.size };
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
    const flowId = crypto.randomUUID();
    const source = products[index];
    tracePrivacyMultiView("clicked", {
      flowId,
      index,
      productCount: products.length,
      busyIndex: privacyViewBusyIndex,
      materialAnalysisBusyIndex,
      hasSource: Boolean(source),
      hasAssetId: Boolean(source?.assetId),
      hasFile: Boolean(source?.file),
      materialKind: source?.materialKind || "unset",
      sourceName: source?.name || "",
      byteSize: source?.byteSize || 0,
    });
    if (!source || privacyViewBusyIndex !== null) return;
    setError("");
    setPrivacyViewBusyIndex(index);
    setNotice("正在准备多视图参考素材");
    try {
      const assetId = await upload(source);
      const kind = source.materialKind || "unknown";
      const label = source.name.trim() || materialLabel(index);
      const isPerson = kind === "person" || label.includes("模特") || label.includes("人物") || label.includes("真人");
      tracePrivacyMultiView("asset_ready", { flowId, index, assetId, kind, label, isPerson });
      const outputName = isPerson
        ? "虚拟模特参考"
        : kind === "scene"
          ? "场景多视图参考"
          : kind === "text"
            ? "文字标识参考"
            : "商品多视图参考";
      const prompt = isPerson
        ? [
            "任务类型：模特/人物多视图参考，不是商品图生成。",
            "主体锁定规则：只要输入图里出现真人、模特、人体轮廓、头发、脸、手臂、腿或穿在人身上的服装，就必须把“完整人物/模特”作为唯一主主体；衣服、裙子、包、鞋只是人物身上的附着物。",
            "创建一张 16:9 真实摄影棚多机位试衣参考图，像同一位真人模特在白色摄影棚完成一次 fitting 拍摄后整理出的 contact sheet；必须是真人摄影质感，真实皮肤纹理、真实布料、自然站姿、相机透视和棚拍柔光，不能是动漫、插画、手绘、3D 渲染、游戏建模、瓷娃娃、塑料皮肤或概念设定图。",
            "先提取身份锚点：脸型外轮廓、脸长脸宽比例、下颌线、颧骨位置、额头高度、眼距、眼型大致走向、鼻梁长度、鼻头宽度、嘴型厚度、肤色与年龄感、身材比例、体态、发型轮廓和穿搭关系；不要继承原图背景、光线、拍摄角度或当下表情。",
            "请以输入人物脸部结构和五官相对位置为强参考，生成一位隐私安全的相似虚拟真人模特：脸型、五官比例、发型轮廓、身形比例和姿态气质要接近输入，不要换成通用网红脸、瓷娃娃脸、AI 模特脸、游戏角色脸或完全陌生的漂亮脸。",
            "即使输入图只有裙子、衣服或局部穿搭，也必须补全为完整虚拟真人模特：头部、肩颈、躯干、手臂、腿部、脚部都要出现。",
            "第一步必须先生成完整头部和完整脸部轮廓：脸型外轮廓、头发轮廓、额头、眼鼻口的大致位置关系需要存在，不能省略头部，不能把头部画成空白块、无脸人或裁掉。",
            "人物身份必须隐私安全，不要逐像素复制真实五官；但必须保留输入人物可用于参考的脸型轮廓、五官相对比例、年龄感、发型轮廓和头身比例，整体相似度优先于美化。",
            "布局像专业电商真人模特试衣拍摄的照片 contact sheet：中央一个真实棚拍全身正面站姿大图，旁边包含背面全身、侧面全身、3/4 角度全身、上半身近景、服装材质/裙摆细节和 2-3 张自然头肩近景。不要使用黑色剪影研究、角色设定轮廓稿、建模三视图或游戏资产展示。",
            "脸部/头部近景控制在 2-3 个即可：正面头肩近景、3/4 头肩近景、可选侧面头肩近景；这些近景必须像真实相机拍摄，有皮肤细节、发丝层次、轻微镜头景深和自然光影，不要磨皮过度，不要生成蜡像感。",
            "脸部近景必须互补：部分无遮挡用于保留脸型和五官比例，部分只做很轻的局部隐私遮挡；不要所有脸都遮同一个区域，不要用粗重马赛克或大面积白条破坏真实感。",
            "每个视角都必须是同一位相似虚拟真人模特，保持相同脸型轮廓、眼距鼻型嘴型比例、发型轮廓、身体比例、服装轮廓和姿态气质；每个视角都要清晰分离，不要重叠，不要像拼贴插画。",
            "每个主要视图都必须是“衣服穿在模特身上”的效果，不允许出现空心裙、衣架、平铺服装、单件裙子、商品白底图或只有服装没有人体。",
            "如果输出结果只有衣服、长裙、服装商品图、空白分格或没有人体，则方向错误，必须重新生成完整人物多视图。",
            "禁止输出单件服装多视图、商品展示图、裙子独立展示图、3D 模型渲染、AI 娃娃脸、过度对称五官、塑料皮肤、游戏角色、二次元、插画或设计稿。",
            "保留输入服装的款式、颜色、材质、长度、褶皱、版型和穿搭气质；脸部需要接近输入人物的结构比例，但经过隐私安全虚拟化处理。",
            "不要在生图阶段提前遮挡脸部；生成完成后由系统二次做极轻微模糊，并按不同脸部小图局部遮挡额头、眼睛、鼻口、下巴或脸颊中的某一小部分，五官比例仍可辨认但真实身份不清晰，保留脸型、发型和头部轮廓。",
            "背景为真实白色或浅灰摄影棚无缝纸，柔和棚拍阴影，画面干净但不要过度留白；整张图像是一张真实电商模特多机位参考图，适合作为后续 @虚拟模特参考 使用。",
          ].join("\n")
        : kind === "scene"
          ? [
              "任务类型：场景/背景多视图参考。",
              "基于输入场景图，生成一张电商视频复刻可用的场景多角度参考板，参考 environment concept board，不是商品主图。",
              "包含正面空间、左侧空间视角、右侧空间视角、纵深/俯视空间视角、近景材质细节、光线氛围小图、背景层次和可摆放主体区域。",
              "保留输入场景的色调、光线方向、空间关系、材质、关键道具和前中远景层次；所有视角必须属于同一个空间，只改变镜头位置、景别和关注点。",
              "不要生成清晰人物脸、品牌水印、字幕、箭头、UI 或不可控文字。",
              "输出浅灰或白色边框的整洁场景参考板，适合作为后续 @场景多视图参考 使用。",
            ].join("\n")
          : [
              "任务类型：商品/物体多视图参考。",
              "基于输入商品或物体图，生成一张电商复刻可用的商品多角度参考板，不是普通商品主图、不是带模特图、不是场景海报。",
              "包含主体正面、左 45 度、右 45 度、侧面、背面/反面、顶部或底部、材质细节、尺寸比例关系和可选使用方式小图。",
              "必须保留主体轮廓、颜色、材质、结构、比例、Logo/标识位置和关键卖点；所有视角必须是同一个商品，不要凭空改变品类、换款式或增加无关配件。",
              "如果输入是服装静物且用户选择了商品类型，则输出服装商品多视图；不要补成人物模特。",
              "不需要做人脸遮挡；若画面中意外出现真人脸，也必须弱化或遮挡，不保留可识别真实身份。",
              `输出适合作为后续 @${outputName} 使用，浅灰或白色背景，清晰整洁。`,
            ].join("\n");
      const taskScene = isPerson ? "人物多视图" : kind === "scene" ? "场景多视图" : "商品多视图";
      const taskStyle = "参考板";
      setNotice(isPerson ? "素材已准备，正在创建人物多视图任务" : "素材已准备，正在创建多视图任务");
      const response = await fetch("/api/tasks/recreate-reference/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          assetId,
          aspectRatio: isPerson ? "16:9" : "1:1",
          scene: taskScene,
          style: taskStyle,
          prompt,
        }),
      });
      const created = await response.json().catch(() => null);
      tracePrivacyMultiView("task_create_response", {
        flowId,
        status: response.status,
        ok: response.ok,
        taskId: created?.taskId || "",
        code: created?.code || "",
        message: created?.message || "",
        taskScene,
      });
      if (!response.ok) throw new Error(created?.message || "多视图参考任务创建失败");
      setNotice(isPerson ? "正在生成完整人物多角度参考图，完成后会自动遮挡五官" : "正在生成素材多视图参考图");
      const outputs = await pollPrivacyViewTask(created.taskId, flowId);
      const boardOutput = isPerson
        ? { assetId: outputs[0].assetId, url: outputs[0].url, byteSize: 0 }
        : await createMultiViewBoardAsset(outputs, outputName);
      if (isPerson) tracePrivacyMultiView("face_mask_started", { flowId, taskId: created.taskId, assetId: boardOutput.assetId });
      const finalOutput = isPerson
        ? await createFaceMaskedReferenceAsset({ url: boardOutput.url, name: outputName, assetId: boardOutput.assetId })
        : boardOutput;
      tracePrivacyMultiView("finished", {
        flowId,
        taskId: created.taskId,
        finalAssetId: finalOutput.assetId,
        isPerson,
      });
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
            materialSummary: isPerson ? "已先生成完整人物多角度参考，再二次遮挡五官区域并保留脸部轮廓" : "已生成素材多视图参考",
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
      tracePrivacyMultiView("failed", {
        flowId,
        index,
        message: caught instanceof Error ? caught.message : "多视图参考生成失败",
      });
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
      let submitFrameAnalysis = frameAnalysis;
      if (!submitFrameAnalysis && douyinAnalysis?.cacheId) {
        setNotice("正在分析关键帧动作连续性");
        const analysisBody = await requestReferenceFrameAnalysis();
        applyReferenceFrameAnalysis(analysisBody);
        submitFrameAnalysis = analysisBody.analysis || null;
      }
      const sourceReferenceVideoAssetId = await prepareReferenceVideoAsset(selectedClip || sourceItem!);
      const referenceVideoAssetId = await prepareCompliantReferenceVideoAsset(sourceReferenceVideoAssetId);
      const keyframeCollageAssetId = await prepareKeyframeCollageReference();
      const productAssetIds = await Promise.all(products.map(upload));
      const confirmedReferenceAssetId = referenceImage ? await upload(referenceImage) : null;
      const assetIds = [
        ...(keyframeCollageAssetId ? [keyframeCollageAssetId] : []),
        ...productAssetIds,
        referenceVideoAssetId,
        ...(confirmedReferenceAssetId ? [confirmedReferenceAssetId] : []),
      ];
      const collageImageIndex = keyframeCollageAssetId ? 1 : null;
      const prompt = [
        builtInRecreatePrompt(collageImageIndex),
        actionDirectorPrompt(submitFrameAnalysis),
        compliantReferenceVideo
          ? "对标视频已先转换为动作结构参考视频：去除原音频并转为边缘轮廓线稿，用于参考镜头节奏、运镜、构图、人体姿态和动作轮廓。"
          : "当前直接提交原始对标视频作为 reference_video。",
        selectedKeyframes.length
          ? `已确认关键画面时间点：${selectedKeyframes.map((frame) => `${frame.time.toFixed(1)}s`).join("、")}。请以这些画面作为复刻参考节点，保持原视频镜头节奏但重生成原创内容。`
          : "",
        keyframeCollagePrompt(collageImageIndex),
        products.length
          ? `替换素材池：用户上传了 ${products.length} 个通配替换素材，按素材池顺序分别标记为：${materialReferences.map((item, index) => `${item.label}=第${index + 1 + (collageImageIndex ? 1 : 0)}张参考图`).join("；")}。请自动识别素材类型，能匹配到人物、服装、商品、背景、Logo 或字幕的素材优先使用；如果用户口令明确引用某个图片标签，请优先按该引用执行；匹配不上的素材不要强行使用。`
          : "素材池：用户未上传素材，请按复刻口令生成原创内容。",
        productInfo.trim() ? `用户复刻口令：${productInfo.trim()}` : "",
        polishedPrompt?.finalPrompt ? `AI润色复刻方案：\n${polishedPrompt.finalPrompt}` : "",
        `补充要求：${special.trim()}`,
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
            {frameAnalysis.actionTimeline?.length ? <p>已生成内部动作连续性指引，会在提交时自动用于模型生成。</p> : null}
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
          下一步：查看内置策略
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
          <h2>内置复刻策略</h2>
        </div>
        <span>4 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        系统会自动把十二宫格和对标视频作为动作与镜头参考，再用素材池替换原人物、商品和场景；用户口令只是补充要求，不需要写专业提示词。
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
          <strong>内置策略状态</strong>
          <small>系统会在提交时自动注入动作、镜头和素材替换策略</small>
        </header>
        <div className="recreate-plan-tags">
          <span>{frameAnalysis?.actionTimeline?.length ? "动作：已拆解连续性" : "动作：提交前自动分析"}</span>
          <span>参考：动作结构十二宫格</span>
          <span>替换：{products.length ? `${products.length} 个素材自动通配` : "未上传素材，按内置策略原创生成"}</span>
          <span>合规：避开原脸 / 原商品 / Logo / 原字幕</span>
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
      <div className="recreate-source-footer">
        <button
          type="button"
          className="primary"
          onClick={() => setStep("generate")}
          disabled={!referenceReady}
        >
          下一步：提交生成
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
        轻量合规参考视频
        <input
          type="checkbox"
          checked={compliantReferenceVideo}
          onChange={(event) => {
            setCompliantReferenceVideo(event.target.checked);
            clearTaskState();
          }}
        />
        <i />
      </label>
      <p className="recreate-test-note">
        {compliantReferenceVideo
          ? "提交前会先生成去音频、边缘轮廓线稿化且满足模型最低分辨率的动作结构参考视频，保留动作节奏并降低真人可识别度。"
          : "当前会直接提交原始对标视频，含真人时可能被 Ark 拒绝。"}
      </p>
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
