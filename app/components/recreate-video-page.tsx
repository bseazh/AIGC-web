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
};
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
    replaceable?: boolean;
    strategy?: string;
    promptInstruction?: string;
  }>;
  risks?: string[];
  prompt?: string;
  providerError?: string;
  summary?: string;
};
type SourceKind = "video" | "product" | "scene";
type WorkflowStep = "source" | "clip" | "product" | "reference" | "generate";
type SourceMode = "douyin" | "upload" | "library";
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
  products: Array<Pick<Item, "preview" | "name" | "byteSize" | "assetId">>;
  referenceImage: Pick<Item, "preview" | "name" | "byteSize" | "assetId"> | null;
  referenceConfirmed: boolean;
  usageAuthorized: boolean;
  productInfo: string;
  special: string;
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
  { key: "clip", number: 2, title: "选择关键画面", subtitle: "拆分并锁定复刻片段" },
  { key: "product", number: 3, title: "批量替换商品", subtitle: "选择商品图" },
  { key: "reference", number: 4, title: "确认复刻参考图", subtitle: "确认最终参考图" },
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
  const [products, setProducts] = useState<Item[]>([]);
  const [referenceImage, setReferenceImage] = useState<Item | null>(null);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [usageAuthorized, setUsageAuthorized] = useState(false);
  const [douyinInput, setDouyinInput] = useState("");
  const [douyinBusy, setDouyinBusy] = useState<"analyzing" | "importing" | null>(
    null,
  );
  const [frameAnalysisBusy, setFrameAnalysisBusy] = useState(false);
  const [frameAnalysis, setFrameAnalysis] = useState<RecreateFrameAnalysis | null>(null);
  const [frameAnalysisFrames, setFrameAnalysisFrames] = useState<Array<{ time: number; url: string }>>([]);
  const [douyinError, setDouyinError] = useState("");
  const [douyinAnalysis, setDouyinAnalysis] = useState<DouyinAnalysis | null>(
    null,
  );
  const [douyinStart, setDouyinStart] = useState(0);
  const [douyinClipDuration, setDouyinClipDuration] = useState(15);
  const [productInfo, setProductInfo] = useState("");
  const [special, setSpecial] = useState("");
  const [modelOn, setModelOn] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("15");
  const [resolution, setResolution] = useState("720p");
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "generating" | "succeeded" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("复刻视频草稿");
  const [serverDrafts, setServerDrafts] = useState<ServerDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftSyncState, setDraftSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const restoredLocalDraftRef = useRef(false);
  const restoringServerDraftRef = useRef(false);

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
    products: products.map((item) => cloneItem(item)).filter(Boolean) as Draft["products"],
    referenceImage: cloneItem(referenceImage),
    referenceConfirmed,
    usageAuthorized,
    productInfo,
    special,
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
    setProducts((draft.products || []).map(restoreItem).filter(Boolean) as Item[]);
    setReferenceImage(restoreItem(draft.referenceImage));
    setReferenceConfirmed(Boolean(draft.referenceConfirmed));
    setUsageAuthorized(Boolean(draft.usageAuthorized));
    setProductInfo(draft.productInfo || "");
    setSpecial(draft.special || "");
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

  const sourceSelection = useMemo(
    () => (activeClipId ? douyinClips.find((item) => item.assetId === activeClipId) : null) || sourceItem,
    [activeClipId, douyinClips, sourceItem],
  );
  const selectedClip = sourceSelection?.assetId
    ? douyinClips.find((item) => item.assetId === sourceSelection.assetId) || null
    : sourceSelection;
  const sourceReady = Boolean(sourceSelection);
  const clipReady = sourceReady && (sourceMode !== "douyin" || douyinClips.length > 0 || !douyinAnalysis?.clipRequired);
  const productReady = products.length > 0;
  const referenceReady = Boolean(referenceImage && referenceConfirmed);
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
    workflowSteps.findIndex((item) => item.key === step),
    unlockedIndex,
  );

  useEffect(() => {
    const next = workflowSteps[Math.max(0, unlockedIndex)].key;
    if (step === "source" && sourceReady) setStep("clip");
    if (step === "clip" && clipReady && unlockedIndex >= 2) setStep("product");
    if (step === "product" && productReady && unlockedIndex >= 3)
      setStep("reference");
    if (step === "reference" && referenceReady && unlockedIndex >= 4)
      setStep("generate");
    if (workflowSteps.findIndex((item) => item.key === step) > unlockedIndex)
      setStep(next);
  }, [clipReady, productReady, referenceReady, sourceReady, step, unlockedIndex]);

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
          setServerDrafts((current) => [
            body.draft,
            ...current.filter((item) => item.id !== body.draft.id),
          ]);
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
    ratio,
    referenceConfirmed,
    referenceImage,
    resolution,
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
      setNotice("当前还没有可保存的草稿内容");
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
      setServerDrafts((current) => [
        body.draft,
        ...current.filter((item) => item.id !== body.draft.id),
      ]);
      setNotice("草稿已保存到账户");
    } catch {
      setDraftSyncState("error");
      setNotice("服务器草稿保存失败，已先保留到当前浏览器");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const continueDraft = (draft: ServerDraft) => {
    restoringServerDraftRef.current = true;
    setDraftId(draft.id);
    setDraftTitle(draft.title);
    applyDraft(draft.payload);
    setNotice("已恢复草稿，可继续生成");
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
      setNotice("草稿已删除");
    } catch {
      setNotice("草稿删除失败，请稍后再试");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const startNewDraft = () => {
    setDraftId(null);
    setDraftTitle("复刻视频草稿");
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
      setDouyinAnalysis(null);
      setDouyinInput("");
      clearTaskState();
      setStep("clip");
    } else if (libraryKind === "product") {
      const selected: Item = {
        assetId: asset.id,
        preview: asset.url,
        name: asset.originalName,
        byteSize: asset.byteSize,
      };
      setProducts((current) =>
        current.some((item) => item.assetId === asset.id)
          ? current.filter((item) => item.assetId !== asset.id)
          : current.length < 5
            ? [...current, selected]
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
        setProducts((current) => [...current, ...valid].slice(0, 5));
      }
      clearTaskState();
    }
  };

  const analyzeDouyin = async () => {
    if (!douyinInput.trim() || douyinBusy) return;
    setError("");
    setDouyinError("");
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
    try {
      const response = await fetch("/api/workflows/recreate-video-analysis/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheId: douyinAnalysis.cacheId,
          replacementGoals: [
            "替换商品",
            modelOn ? "替换模特" : "",
            "替换背景/场景参考",
          ].filter(Boolean),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || body?.code || "关键帧识别失败");
      setFrameAnalysis(body.analysis || null);
      setFrameAnalysisFrames(
        (body.frames || []).map((frame: { time: number; url: string }) => ({
          time: frame.time,
          url: frame.url,
        })),
      );
      if (body.analysis?.prompt) {
        setSpecial((current) =>
          current.trim()
            ? `${current.trim()}\n\nAI关键帧识别提示词：\n${body.analysis.prompt}`
            : body.analysis.prompt,
        );
      }
      setNotice("AI 已识别关键帧，并写入视频特殊要求");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "关键帧识别失败");
    } finally {
      setFrameAnalysisBusy(false);
    }
  };

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
      const assetIds = [
        ...(await Promise.all(products.map(upload))),
        await upload(selectedClip || sourceItem!),
        ...(referenceImage ? [await upload(referenceImage)] : []),
      ];
      const prompt = [
        `产品信息：${productInfo.trim()}`,
        `视频特殊要求：${special.trim()}`,
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
                支持完整分享文案；解析后右侧会临时缓存并预览原视频，可再选择 5、10 或 15 秒片段。
              </p>
            )}
            {douyinAnalysis && (
              <div className="recreate-clip-editor">
                <header>
                  <div>
                    <strong>{douyinAnalysis.title}</strong>
                    <small>视频总时长 {douyinAnalysis.durationSeconds.toFixed(1)} 秒</small>
                  </div>
                  <span>{douyinAnalysis.clipRequired ? "选择片段" : "完整视频"}</span>
                </header>
                {douyinAnalysis.keyframeSeconds?.length ? (
                  <div className="recreate-reference-plan">
                    <strong>多帧参考建议</strong>
                    <small>
                      建议二次查看这些关键帧：
                      {douyinAnalysis.keyframeSeconds.map((second) => `${second.toFixed(1)}s`).join(" / ")}
                    </small>
                    {douyinAnalysis.referencePrompt && <p>{douyinAnalysis.referencePrompt}</p>}
                  </div>
                ) : null}
                {douyinAnalysis.cacheId && (
                  <div className="recreate-frame-analysis">
                    <button type="button" onClick={analyzeReplaceableFrames} disabled={frameAnalysisBusy}>
                      {frameAnalysisBusy ? (
                        <LoaderCircle className="generation-spinner" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {frameAnalysisBusy ? "正在识别关键帧" : "AI识别可替换内容"}
                    </button>
                    {frameAnalysisFrames.length ? (
                      <div className="recreate-frame-strip">
                        {frameAnalysisFrames.map((frame) => (
                          <figure key={`${frame.time}-${frame.url}`}>
                            <img src={frame.url} alt={`${frame.time.toFixed(1)}秒关键帧`} />
                            <figcaption>{frame.time.toFixed(1)}s</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : null}
                    {frameAnalysis && (
                      <div className="recreate-analysis-result">
                        {frameAnalysis.summary && <p>{frameAnalysis.summary}</p>}
                        {frameAnalysis.replacementPlan?.length ? (
                          <ul>
                            {frameAnalysis.replacementPlan.slice(0, 4).map((item, index) => (
                              <li key={`${item.target || "替换项"}-${index}`}>
                                <strong>{item.target || "可替换项"}</strong>
                                <span>{item.strategy || item.promptInstruction || "建议作为结构参考重生成"}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {frameAnalysis.prompt && (
                          <textarea readOnly value={frameAnalysis.prompt} aria-label="AI生成复刻提示词" />
                        )}
                        {frameAnalysis.providerError && <small>{frameAnalysis.providerError}</small>}
                      </div>
                    )}
                  </div>
                )}
                {douyinAnalysis.clipRequired ? (
                  <>
                    <div className="recreate-range">
                      <span>开始时间</span>
                      <strong>
                        {douyinStart.toFixed(1)}s –{" "}
                        {(douyinStart + douyinClipDuration).toFixed(1)}s
                      </strong>
                      <input
                        type="range"
                        min={0}
                        max={sourceMaxStart}
                        step={0.1}
                        value={Math.min(douyinStart, sourceMaxStart)}
                        aria-label="片段开始时间"
                        onChange={(event) =>
                          setDouyinStart(Number(event.target.value))
                        }
                      />
                      <small>
                        <span>0s</span>
                        <span>{sourceMaxStart.toFixed(1)}s</span>
                      </small>
                    </div>
                    <div className="recreate-length">
                      <span>片段长度</span>
                      <div>
                        {[5, 10, 15].map((seconds) => (
                          <button
                            type="button"
                            key={seconds}
                            className={douyinClipDuration === seconds ? "active" : ""}
                            onClick={() => {
                              setDouyinClipDuration(seconds);
                              setDouyinStart((current) =>
                                Math.min(
                                  current,
                                  Math.max(0, douyinAnalysis.durationSeconds - seconds),
                                ),
                              );
                            }}
                          >
                            {seconds} 秒
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p>该视频不超过 15 秒，将直接导入完整内容。</p>
                )}
                <button
                  type="button"
                  onClick={importDouyin}
                  disabled={Boolean(douyinBusy)}
                >
                  {douyinBusy === "importing" ? (
                    <LoaderCircle className="generation-spinner" size={17} />
                  ) : (
                    <Download size={17} />
                  )}
                  {douyinBusy === "importing"
                    ? "正在截取并保存"
                    : douyinAnalysis.clipRequired
                      ? "截取并导入"
                      : "导入完整视频"}
                </button>
                <p>
                  片段会保存到素材库；可重复选择其他片段，再进入后面的复刻和混剪。
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
        <p className="creator-error" role="alert">
          {douyinError}
        </p>
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
        这里保留当前复刻用的片段，也可以继续截取其他片段，后面再带去智能混剪。
      </p>
      {douyinAnalysis?.clipRequired && videoSource === "douyin" ? (
        <div className="recreate-clip-editor">
          <header>
            <div>
              <strong>{douyinAnalysis.title}</strong>
              <small>
                视频总时长 {douyinAnalysis.durationSeconds.toFixed(1)} 秒
              </small>
            </div>
            <span>片段抽取</span>
          </header>
          {douyinAnalysis.cachePreviewUrl && (
            <div className="recreate-source-cache">
              <video src={douyinAnalysis.cachePreviewUrl} controls playsInline preload="metadata" />
              <div>
                <strong>原视频缓存预览</strong>
                <small>先浏览原片，再按下方时间轴截取 15 秒以内片段</small>
                <small>
                  {douyinAnalysis.cacheExpiresAt
                    ? `缓存 1 小时有效，约 ${new Date(douyinAnalysis.cacheExpiresAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} 自动清理`
                    : "缓存 1 小时后自动清理"}
                </small>
              </div>
            </div>
          )}
          {douyinAnalysis.referencePrompt && (
            <div className="recreate-reference-plan">
              <strong>reference 参考提示词</strong>
              <small>
                关键帧：
                {(douyinAnalysis.keyframeSeconds || [])
                  .map((second) => `${second.toFixed(1)}s`)
                  .join(" / ") || "按片段均匀抽取"}
              </small>
              <p>{douyinAnalysis.referencePrompt}</p>
            </div>
          )}
          <div className="recreate-range">
            <span>开始时间</span>
            <strong>
              {douyinStart.toFixed(1)}s –{" "}
              {(douyinStart + douyinClipDuration).toFixed(1)}s
            </strong>
            <input
              type="range"
              min={0}
              max={sourceMaxStart}
              step={0.1}
              value={Math.min(douyinStart, sourceMaxStart)}
              aria-label="片段开始时间"
              onChange={(event) => setDouyinStart(Number(event.target.value))}
            />
            <small>
              <span>0s</span>
              <span>{sourceMaxStart.toFixed(1)}s</span>
            </small>
          </div>
          <div className="recreate-length">
            <span>片段长度</span>
            <div>
              {[5, 10, 15].map((seconds) => (
                <button
                  type="button"
                  key={seconds}
                  className={douyinClipDuration === seconds ? "active" : ""}
                  onClick={() => {
                    setDouyinClipDuration(seconds);
                    setDouyinStart((current) =>
                      Math.min(current, Math.max(0, douyinAnalysis.durationSeconds - seconds)),
                    );
                  }}
                >
                  {seconds} 秒
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={importDouyin} disabled={Boolean(douyinBusy)}>
            {douyinBusy === "importing" ? (
              <LoaderCircle className="generation-spinner" size={17} />
            ) : (
              <Download size={17} />
            )}
            {douyinBusy === "importing" ? "正在截取并保存" : "再截一段"}
          </button>
        </div>
      ) : (
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
      )}
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
          下一步：批量替换商品
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
          <h2>批量替换商品</h2>
        </div>
        <span>3 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        选择商品图后，系统会把它们放到当前复刻链路里，作为最终任务的主体素材。
      </p>
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
          <strong>上传商品图片</strong>
          <small>支持 JPG / PNG / WebP，单张不超过 10MB</small>
          <small>已上传 {products.length}/5 个</small>
        </button>
      )}
      {products.length > 0 && (
        <div className="recreate-selected-images">
          {products.map((product, index) => (
            <article key={`${product.assetId || product.name}-${index}`}>
              <img src={product.preview} alt="商品图片预览" />
              <button
                type="button"
                onClick={() => {
                  removeProduct(index);
                  clearTaskState();
                }}
                aria-label="移除商品图"
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
          下一步：确认复刻参考图
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
        <div>
          <strong>当前步骤</strong>
          <h2>确认复刻参考图</h2>
        </div>
        <span>4 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        选一张能代表最终复刻效果的图，确认后就进入生成阶段。
      </p>
      <div className="recreate-source-tabs">
        <button
          type="button"
          className="active"
          onClick={() => refs.scene.current?.click()}
        >
          <Upload size={16} />
          上传参考图
        </button>
        <button
          type="button"
          onClick={() => openLibrary("scene")}
          className={libraryKind === "scene" ? "active" : ""}
        >
          <FolderOpen size={16} />
          资产库
        </button>
      </div>
      {libraryKind === "scene" ? (
        assetLibrary
      ) : (
        <button
          type="button"
          className={`recreate-drop ${referenceImage ? "has-file" : ""}`}
          onClick={() => refs.scene.current?.click()}
        >
          <span>
            <ImagePlus size={27} />
          </span>
          <strong>确认复刻参考图</strong>
          <small>上传一张最终确认图，或从素材库选择</small>
          <small>{referenceImage ? "已选择 1 个" : "已上传 0 / 1 个"}</small>
          <input
            ref={refs.scene}
            type="file"
            accept={imageAccept}
            onChange={(event) => choose("scene", event.target.files)}
          />
        </button>
      )}
      {referenceImage && (
        <div className="recreate-reference-preview">
          <img src={referenceImage.preview} alt="参考图预览" />
          <div>
            <strong>{referenceImage.name}</strong>
            <small>{formatBytes(referenceImage.byteSize)}</small>
          </div>
        </div>
      )}
      <label className="recreate-consent">
        <input
          type="checkbox"
          checked={referenceConfirmed}
          onChange={(event) => {
            setReferenceConfirmed(event.target.checked);
            clearTaskState();
          }}
        />
        我确认当前图片作为本次复刻参考图
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
        我确认拥有对标视频、商品图及其他上传素材的合法使用授权
      </label>
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
        产品信息（可选）
        <textarea
          value={productInfo}
          onChange={(event) => setProductInfo(event.target.value)}
          maxLength={600}
          placeholder="例如：产品名称、核心卖点、材质、目标人群"
        />
      </label>
      <label className="recreate-field">
        视频特殊要求（可选）
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
            保存草稿
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
                <strong>账号草稿</strong>
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
              草稿标题
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                maxLength={80}
                placeholder="给这次复刻起个名字"
              />
            </label>
            <button type="button" className="recreate-new-draft" onClick={startNewDraft}>
              新建空白草稿
            </button>
            <div className="recreate-draft-list">
              {serverDrafts.length ? (
                serverDrafts.map((draft) => (
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
                    <button type="button" aria-label="删除草稿" onClick={() => deleteDraft(draft.id)}>
                      <X size={13} />
                    </button>
                  </article>
                ))
              ) : (
                <p>{draftsLoading ? "正在读取草稿…" : "暂无服务器草稿"}</p>
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
            <span>当前步骤会自动保留草稿</span>
          </div>
          {step === "source" && sourcePanel}
          {step === "clip" && clipPanel}
          {step === "product" && productPanel}
          {step === "reference" && referencePanel}
          {step === "generate" && generatePanel}
          {notice && <p className="creator-success">{notice}</p>}
          {douyinError && step !== "source" && (
            <p className="creator-error" role="alert">
              {douyinError}
            </p>
          )}
        </section>
      </form>
    </main>
  );
}
