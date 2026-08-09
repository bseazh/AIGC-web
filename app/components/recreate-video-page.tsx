"use client";

import {
  ArrowLeft,
  Film,
  Pencil,
  Sparkles,
  Video,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  actionDirectorPrompt,
  builtInRecreatePrompt,
  cloneItem,
  createRecreateVideoTask,
  defaultKeyframes,
  deleteRecreateDraft,
  draftHasContent,
  draftStorageKey,
  getRecreateDraft,
  getRecreateWorkflowState,
  getTaskStatus,
  GeneratePanel,
  isUuid,
  keyframeCollagePrompt,
  listRecreateDrafts,
  loadImageForCanvas,
  MaterialsPanel,
  materialLabel,
  renameRecreateDraft,
  RecreatePreviewModal,
  RecreateProjectGate,
  RecreateWorkspaceSidebar,
  resolveAssetPreviewUrl,
  restoreItem,
  saveRecreateDraft,
  SourcePanel,
  storedDraftValue,
  uploadRecreateItem,
  useRecreateMaterials,
  useRecreateSource,
  useRecreateTask,
  useRecreateKeyframes,
  workflowSteps,
  type Account,
  type Asset,
  type Draft,
  type FaceMaskRegion,
  type Item,
  type KeyframeSelection,
  type MaterialKind,
  type PreviewMedia,
  type ServerDraft,
  type SourceKind,
  type StoredDraft,
  type WorkflowStep,
} from "@/app/features/recreate-video";

export function RecreateVideoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdParam = searchParams?.get("projectId") || null;
  const refs = {
    video: useRef<HTMLInputElement>(null),
    product: useRef<HTMLInputElement>(null),
    scene: useRef<HTMLInputElement>(null),
  };

  const [account, setAccount] = useState<Account | null>(null);
  const [step, setStep] = useState<WorkflowStep>("source");
  const [usageAuthorized, setUsageAuthorized] = useState(false);
  const [compliantReferenceVideo, setCompliantReferenceVideo] = useState(true);
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("15");
  const [resolution, setResolution] = useState("720p");
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null);
  const [notice, setNotice] = useState("");
  const {
    clearTaskState,
    error,
    phase,
    poll,
    restoreProjectTask,
    result,
    setError,
    setPhase,
    setResult,
  } = useRecreateTask({ setStep, setNotice });
  const {
    faceMaskBusyIndex,
    handleCommandInput,
    insertMaterialReference,
    materialAnalysisBusyIndex,
    materialKindLabel,
    materialMentionOpen,
    materialReferences,
    mentionMaterials,
    normalizeProductName,
    polishedPrompt,
    portraitCandidate,
    portraitCandidateIndex,
    privacyReference,
    privacyViewBusyIndex,
    productInfo,
    productReady,
    products,
    referenceImage,
    referenceReady,
    removeProduct,
    renameProduct,
    resetMaterials,
    setFaceMaskBusyIndex,
    setMaterialAnalysisBusyIndex,
    setMaterialKind,
    setMaterialMentionOpen,
    setMaterialMentionQuery,
    setPolishedPrompt,
    setPrivacyViewBusyIndex,
    setProductInfo,
    setProducts,
    setReferenceImage,
    setSpecial,
    special,
  } = useRecreateMaterials({ clearTaskState });
  const [projectSeed, setProjectSeed] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [serverDrafts, setServerDrafts] = useState<ServerDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftSyncState, setDraftSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const restoredLocalDraftRef = useRef(false);
  const restoringServerDraftRef = useRef(false);
  const visibleDrafts = useMemo(() => serverDrafts.slice(0, 8), [serverDrafts]);
  const mergeServerDraft = (draft: ServerDraft) => {
    setServerDrafts((current) =>
      [draft, ...current.filter((item) => item.id !== draft.id)]
        .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime())
        .slice(0, 20),
    );
  };

  const {
    activeClipId,
    analyzeDouyin: analyzeDouyinSource,
    assets,
    assetsLoading,
    chooseVideo,
    douyinAnalysis,
    douyinBusy,
    douyinCacheExpired,
    douyinClipDuration,
    douyinClips,
    douyinError,
    douyinInput,
    douyinStart,
    libraryKind,
    moveClip,
    openLibrary,
    prepareCompliantReferenceVideoAsset,
    prepareReferenceVideoAsset,
    removeClip,
    resetSource,
    returnToSourceForExpiredCache: returnToSourceForExpiredCacheBase,
    selectedClip,
    selectVideoAsset,
    setActiveClipId,
    setClips,
    setDouyinAnalysis,
    setDouyinCacheExpired,
    setDouyinClipDuration,
    setDouyinError,
    setDouyinInput,
    setDouyinStart,
    setLibraryKind,
    setSourceItem,
    setSourceMode,
    setVideoSource,
    sourceItem,
    sourceMode,
    sourceSelection,
    videoSource,
  } = useRecreateSource({
    clearTaskState,
    compliantReferenceVideo,
    ratio,
    setError,
    setNotice,
    setStep,
  });
  const {
    allCandidateKeyframesSelected,
    analyzeReplaceableFrames,
    applyReferenceFrameAnalysis,
    frameAnalysis,
    frameAnalysisBusy,
    frameAnalysisFrames,
    frameExtractionBusy,
    prepareKeyframeCollageReference,
    quickExtractKeyframes,
    requestReferenceFrameAnalysis,
    resetKeyframes,
    selectableKeyframes,
    selectedKeyframeKeys,
    selectedKeyframes,
    setFrameAnalysis,
    setFrameAnalysisBusy,
    setFrameAnalysisFrames,
    setSelectedKeyframes,
    toggleAllKeyframes,
    toggleKeyframe,
    useDefaultKeyframes,
  } = useRecreateKeyframes({
    clearTaskState,
    douyinAnalysis,
    douyinClipDuration,
    douyinStart,
    setDouyinCacheExpired,
    setDouyinError,
    setNotice,
    setPolishedPrompt,
    sourceSelection,
    step,
  });

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  const draftValue = (): Draft => ({
    projectSeed,
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

  const applyDraft = (draft: Partial<Draft>) => {
    if (typeof draft.projectSeed === "string") setProjectSeed(draft.projectSeed);
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
      const drafts = await listRecreateDrafts();
      setServerDrafts(drafts);
      if (restoreLatest && !restoredLocalDraftRef.current && drafts[0]) {
        restoringServerDraftRef.current = true;
        setDraftId(drafts[0].id);
        setDraftTitle(drafts[0].title);
        applyDraft(drafts[0].payload);
        restoreProjectTask(drafts[0].taskId);
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
    if (isUuid(projectIdParam)) {
      restoringServerDraftRef.current = true;
      getRecreateDraft(projectIdParam)
        .then((serverDraft) => {
          if (!serverDraft) return;
          setDraftId(serverDraft.id);
          setDraftTitle(serverDraft.title);
          localStorage.setItem(draftStorageKey, JSON.stringify({ ...serverDraft.payload, __serverDraftId: serverDraft.id, __serverDraftTitle: serverDraft.title }));
          applyDraft(serverDraft.payload);
          restoreProjectTask(serverDraft.taskId);
          restoredLocalDraftRef.current = true;
        })
        .catch(() => undefined)
        .finally(() => {
          window.setTimeout(() => {
            restoringServerDraftRef.current = false;
          }, 0);
        });
      return;
    }
    const stored = localStorage.getItem(draftStorageKey);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as StoredDraft;
      if (!isUuid(draft.__serverDraftId)) {
        localStorage.removeItem(draftStorageKey);
        return;
      }
      setDraftId(draft.__serverDraftId);
      if (typeof draft.__serverDraftTitle === "string" && draft.__serverDraftTitle.trim())
        setDraftTitle(draft.__serverDraftTitle.slice(0, 80));
      restoredLocalDraftRef.current = draftHasContent(draft);
      applyDraft(draft);
      if (isUuid(draft.__serverDraftId)) {
        getRecreateDraft(draft.__serverDraftId)
          .then((serverDraft) => {
            if (serverDraft) restoreProjectTask(serverDraft.taskId);
          })
          .catch(() => undefined);
      }
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
  const returnToSourceForExpiredCache = () => {
    resetKeyframes();
    returnToSourceForExpiredCacheBase();
  };
  const sourceReady = Boolean(sourceSelection);
  const clipReady =
    sourceReady &&
    selectedKeyframes.length >= 4;
  const generateReady =
    sourceReady && clipReady && productReady && referenceReady && usageAuthorized;
  const { activeStep, completedCount, currentIndex, unlockedIndex } = getRecreateWorkflowState({
    clipReady,
    phaseSucceeded: phase === "succeeded",
    productReady,
    referenceReady,
    sourceReady,
    step,
  });
  const canGoPrevious = currentIndex > 0 && phase !== "uploading" && phase !== "generating";
  const goPreviousStep = () => {
    if (!canGoPrevious) return;
    setStep(workflowSteps[currentIndex - 1].key);
  };

  useEffect(() => {
    if (step === "clip") {
      setStep("product");
      return;
    }
    if (step === "reference") {
      setStep("generate");
      return;
    }
    const next = workflowSteps[Math.max(0, unlockedIndex)].key;
    if (workflowSteps.findIndex((item) => item.key === step) > unlockedIndex)
      setStep(next);
  }, [step, unlockedIndex]);

  const prepareSourceReferenceAndContinue = async () => {
    if (!sourceReady || frameExtractionBusy) return;
    const hasRealKeyframeImages = frameAnalysisFrames.length > 0 || selectedKeyframes.some((frame) => Boolean(frame.url));
    if (!hasRealKeyframeImages) await quickExtractKeyframes();
    setStep("product");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (phase === "succeeded") return;
      const draft = draftValue();
      localStorage.setItem(draftStorageKey, JSON.stringify(storedDraftValue(draft, draftId, draftTitle)));
      if (!account || !draftId || !draftHasContent(draft) || phase !== "idle" || restoringServerDraftRef.current)
        return;
      setDraftSyncState("saving");
      saveRecreateDraft({ id: draftId, title: draftTitle, payload: draft })
        .then((savedDraft) => {
          setDraftId(savedDraft.id);
          setDraftTitle(savedDraft.title);
          localStorage.setItem(draftStorageKey, JSON.stringify({ ...draft, __serverDraftId: savedDraft.id, __serverDraftTitle: savedDraft.title }));
          setDraftSyncState("saved");
          mergeServerDraft(savedDraft);
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
    projectSeed,
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

  const createProject = async () => {
    const title = draftTitle.trim();
    if (!title) {
      setNotice("请先填写项目名称");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    const seed = projectSeed || crypto.randomUUID();
    const draft = { ...draftValue(), projectSeed: seed };
    try {
      setDraftSyncState("saving");
      const savedDraft = await saveRecreateDraft({ id: null, title, payload: draft });
      setProjectSeed(seed);
      setDraftId(savedDraft.id);
      setDraftTitle(savedDraft.title);
      localStorage.setItem(draftStorageKey, JSON.stringify({ ...draft, __serverDraftId: savedDraft.id, __serverDraftTitle: savedDraft.title }));
      setDraftSyncState("saved");
      mergeServerDraft(savedDraft);
      setNotice("项目已创建，可以开始复刻");
    } catch {
      setDraftSyncState("error");
      setNotice("项目创建失败，请稍后再试");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const continueDraft = (draft: ServerDraft) => {
    restoringServerDraftRef.current = true;
    setDraftId(draft.id);
    setDraftTitle(draft.title);
    localStorage.setItem(draftStorageKey, JSON.stringify({ ...draft.payload, __serverDraftId: draft.id, __serverDraftTitle: draft.title }));
    applyDraft(draft.payload);
    restoreProjectTask(draft.taskId);
    setNotice("已恢复项目，可继续生成");
    window.setTimeout(() => {
      restoringServerDraftRef.current = false;
      setNotice("");
    }, 800);
  };

  const deleteDraft = async (targetId: string) => {
    try {
      await deleteRecreateDraft(targetId);
      setServerDrafts((current) => current.filter((draft) => draft.id !== targetId));
      if (draftId === targetId) startNewDraft();
      setNotice("项目已删除");
    } catch {
      setNotice("项目删除失败，请稍后再试");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const renameCurrentProject = async () => {
    if (!draftId) return;
    const nextTitle = window.prompt("重命名项目", draftTitle)?.trim();
    if (!nextTitle || nextTitle === draftTitle) return;
    if (serverDrafts.some((draft) => draft.id !== draftId && draft.title.trim().toLowerCase() === nextTitle.toLowerCase())) {
      setNotice("同名项目已存在，请换一个项目名称");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    try {
      setDraftSyncState("saving");
      const renamed = await renameRecreateDraft(draftId, nextTitle);
      setDraftTitle(renamed.title);
      setDraftSyncState("saved");
      setServerDrafts((items) => items.map((item) => (item.id === renamed.id ? renamed : item)));
      localStorage.setItem(draftStorageKey, JSON.stringify(storedDraftValue(draftValue(), renamed.id, renamed.title)));
      setNotice("项目已重命名");
    } catch (caught) {
      setDraftSyncState("error");
      setNotice(caught instanceof Error ? caught.message : "项目重命名失败");
    }
    window.setTimeout(() => setNotice(""), 1800);
  };

  const startNewDraft = () => {
    localStorage.removeItem(draftStorageKey);
    setDraftId(null);
    setDraftTitle("");
    setProjectSeed("");
    setUsageAuthorized(false);
    resetMaterials();
    resetSource();
    resetKeyframes();
    localStorage.removeItem(draftStorageKey);
    clearTaskState();
    setStep("source");
  };

  const selectAsset = (asset: Asset) => {
    if (libraryKind === "video") {
      const selected = selectVideoAsset(asset);
      if (selected) {
        resetKeyframes();
        setSelectedKeyframes(defaultKeyframes(selected.durationSeconds));
      }
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
      const selected = await chooseVideo(files);
      if (selected) {
        resetKeyframes();
        setSelectedKeyframes(defaultKeyframes(selected.durationSeconds));
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
    const selected = await analyzeDouyinSource();
    if (selected) {
      resetKeyframes();
      setSelectedKeyframes(defaultKeyframes(selected.durationSeconds));
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
  const upload = uploadRecreateItem;

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
      temporaryDerived: true,
    });
    const url = await resolveAssetPreviewUrl(assetId, preview);
    if (url !== preview) URL.revokeObjectURL(preview);
    return { assetId, url, byteSize: file.size };
  };

  const pollPrivacyViewTask = async (taskId: string, flowId?: string) => {
    const deadline = Date.now() + 10 * 60 * 1000;
    tracePrivacyMultiView("poll_started", { flowId, taskId });
    while (Date.now() < deadline) {
      const task = await getTaskStatus(taskId).catch((error) => {
        throw new Error(error instanceof Error ? error.message : "多视图任务查询失败");
      });
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
    const assetId = await upload({ file, preview, name, byteSize: file.size, temporaryDerived: true });
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
            generatedAsset: true,
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
    if (!draftId) {
      setError("请先创建项目，再提交生成任务");
      setNotice("创建项目后，刷新或重新登录都能恢复进度");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
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
        referenceVideoAssetId,
        ...(keyframeCollageAssetId ? [keyframeCollageAssetId] : []),
        ...productAssetIds,
        ...(confirmedReferenceAssetId ? [confirmedReferenceAssetId] : []),
      ];
      const collageImageIndex = keyframeCollageAssetId ? 1 : null;
      const prompt = [
        builtInRecreatePrompt(collageImageIndex),
        actionDirectorPrompt(submitFrameAnalysis, selectedKeyframes),
        compliantReferenceVideo
          ? "对标视频已先转换为动作结构参考视频：去除原音频并转为边缘轮廓线稿，用于参考镜头节奏、运镜、构图、人体姿态和动作轮廓。"
          : "当前直接提交原始对标视频作为 reference_video。",
        `动作复刻优先级：请先读取第一段 reference_video，完整提取从开始到结束的动作走势；如果生成时长 ${duration} 秒短于原视频或所选片段，请按比例压缩完整舞蹈/手势/走位段落，不要改成站立走秀、慢速摆拍或随机转身。`,
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
      const created = await createRecreateVideoTask({
        draftId,
        assetIds,
        prompt,
        aspectRatio: ratio,
        duration: Number(duration),
        resolution,
      });
      const savedDraft = { ...draftValue(), step: "generate" as WorkflowStep };
      localStorage.setItem(draftStorageKey, JSON.stringify({ ...savedDraft, __serverDraftId: draftId, __serverDraftTitle: draftTitle }));
      setPhase("generating");
      setStep("generate");
      await poll(created.taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
      setPhase("failed");
    }
  };

  const sourceMaxStart = douyinAnalysis
    ? Math.max(0, douyinAnalysis.durationSeconds - douyinClipDuration)
    : 0;
  const durationSeconds = Number(duration);

  const sourcePanel = (
    <SourcePanel
      analyzeDouyin={analyzeDouyin}
      assets={assets}
      assetsLoading={assetsLoading}
      chooseVideo={(files) => choose("video", files)}
      douyinAnalysis={douyinAnalysis}
      douyinBusy={douyinBusy}
      douyinCacheExpired={douyinCacheExpired}
      douyinError={douyinError}
      douyinInput={douyinInput}
      libraryKind={libraryKind}
      onNext={prepareSourceReferenceAndContinue}
      openVideoLibrary={() => openLibrary("video")}
      returnToSourceForExpiredCache={returnToSourceForExpiredCache}
      selectAsset={selectAsset}
      setDouyinAnalysis={setDouyinAnalysis}
      setDouyinError={setDouyinError}
      setDouyinInput={setDouyinInput}
      setFrameAnalysis={setFrameAnalysis}
      setFrameAnalysisFrames={setFrameAnalysisFrames}
      setLibraryKind={setLibraryKind}
      setSourceMode={setSourceMode}
      setVideoSource={setVideoSource}
      sourceMode={sourceMode}
      sourceReady={sourceReady}
      sourceSelection={sourceSelection}
      videoInputRef={refs.video}
      videoSource={videoSource}
    />
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
    <MaterialsPanel
      analyzeMaterial={analyzeMaterial}
      analyzeReplaceableFrames={analyzeReplaceableFrames}
      assetLibrary={assetLibrary}
      chooseProduct={(files) => choose("product", files)}
      clearTaskState={clearTaskState}
      createPrivacyMultiView={createPrivacyMultiView}
      douyinHasCache={Boolean(douyinAnalysis?.cacheId)}
      faceMaskBusyIndex={faceMaskBusyIndex}
      frameAnalysis={frameAnalysis}
      frameAnalysisBusy={frameAnalysisBusy}
      frameAnalysisFrames={frameAnalysisFrames}
      handleCommandInput={handleCommandInput}
      insertMaterialReference={insertMaterialReference}
      keyframeFallbackVisual={keyframeFallbackVisual}
      libraryKind={libraryKind}
      materialAnalysisBusyIndex={materialAnalysisBusyIndex}
      materialKindLabel={materialKindLabel}
      materialMentionOpen={materialMentionOpen}
      materialReferences={materialReferences}
      mentionMaterials={mentionMaterials}
      normalizeProductName={normalizeProductName}
      onNext={() => setStep("generate")}
      openProductLibrary={() => openLibrary("product")}
      polishRecreateCommand={polishRecreateCommand}
      polishedPrompt={polishedPrompt}
      portraitCandidate={portraitCandidate}
      portraitCandidateIndex={portraitCandidateIndex}
      previewImageButton={previewImageButton}
      privacyReference={privacyReference}
      privacyViewBusyIndex={privacyViewBusyIndex}
      productInfo={productInfo}
      productInputRef={refs.product}
      productReady={productReady}
      products={products}
      removeProduct={removeProduct}
      renameProduct={renameProduct}
      replacementSlots={replacementSlots}
      selectedKeyframes={selectedKeyframes}
      setLibraryKind={setLibraryKind}
      setMaterialKind={setMaterialKind}
      setMaterialMentionOpen={setMaterialMentionOpen}
      setMaterialMentionQuery={setMaterialMentionQuery}
      slotTypeLabel={slotTypeLabel}
      strengthenFaceMask={strengthenFaceMask}
    />
  );

  const generatePanel = (
    <GeneratePanel
      canGoPrevious={canGoPrevious}
      clearTaskState={clearTaskState}
      compliantReferenceVideo={compliantReferenceVideo}
      duration={duration}
      durationSeconds={durationSeconds}
      error={error}
      generateReady={generateReady}
      goToVideoMix={goToVideoMix}
      handleCommandInput={handleCommandInput}
      insertMaterialReference={insertMaterialReference}
      materialMentionOpen={materialMentionOpen}
      mentionMaterials={mentionMaterials}
      onGoPrevious={goPreviousStep}
      onReset={startNewDraft}
      phase={phase}
      productInfo={productInfo}
      ratio={ratio}
      resolution={resolution}
      result={result}
      setCompliantReferenceVideo={setCompliantReferenceVideo}
      setDuration={setDuration}
      setMaterialMentionOpen={setMaterialMentionOpen}
      setRatio={setRatio}
      setResolution={setResolution}
      setSpecial={setSpecial}
      setUsageAuthorized={setUsageAuthorized}
      special={special}
      usageAuthorized={usageAuthorized}
    />
  );

  if (!account)
    return (
      <main className="workspace-loading">
        <Sparkles size={22} />
        <p>正在载入复刻工作台</p>
      </main>
    );

  if (!draftId)
    return (
      <main className="recreate-flow-shell">
        <header className="recreate-flow-header">
        <button type="button" onClick={() => router.push("/create/product-video")}>
          <ArrowLeft size={19} />
          返回一站式视频带货
        </button>
      </header>
        <RecreateProjectGate
          draftTitle={draftTitle}
          draftsLoading={draftsLoading}
          onCreateProject={createProject}
          onDeleteDraft={deleteDraft}
          onLoadDraft={continueDraft}
          onRefreshDrafts={() => refreshDrafts(false)}
          onTitleChange={setDraftTitle}
          visibleDrafts={visibleDrafts}
        />
        {notice && <p className="creator-success">{notice}</p>}
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
          <div className="recreate-project-toolbar">
            <span title={draftTitle || "未命名项目"}>{draftTitle || "未命名项目"}</span>
            <button type="button" onClick={renameCurrentProject} aria-label="重命名项目" title="重命名项目">
              <Pencil size={16} />
              重命名
            </button>
          </div>
        </div>
      </header>
      <form className="recreate-flow-card" onSubmit={submit}>
        <RecreateWorkspaceSidebar
          activeStep={activeStep.key}
          clipReady={clipReady}
          completedCount={completedCount}
          onStepChange={setStep}
          phaseSucceeded={phase === "succeeded"}
          productReady={productReady}
          referenceReady={referenceReady}
          sourceReady={sourceReady}
          unlockedIndex={unlockedIndex}
        />
        <section className="recreate-flow-main">
          <header className="recreate-stage-header">
            <div>
              <span>CURRENT STAGE</span>
              <strong>{activeStep.title}</strong>
              <small>{activeStep.subtitle}</small>
            </div>
          </header>
          <div className="recreate-flow-toolbar">
            <div>
              <strong>{activeStep.number} / {workflowSteps.length}</strong>
              <small>{activeStep.title}</small>
            </div>
            <div className="recreate-flow-toolbar-actions">
              <button type="button" onClick={goPreviousStep} disabled={!canGoPrevious}>
                <ArrowLeft size={14} />
                上一步
              </button>
            </div>
          </div>
          {step === "source" && sourcePanel}
          {step === "product" && productPanel}
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
      {previewMedia ? <RecreatePreviewModal media={previewMedia} onClose={() => setPreviewMedia(null)} /> : null}
    </main>
  );
}
