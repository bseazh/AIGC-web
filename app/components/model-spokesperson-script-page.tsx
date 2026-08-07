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
  sellingPointSummary: string[];
  modelDirection: string;
  productDirection: string;
  internalPrompt: string;
  script: ScriptResult;
};
type Draft = {
  productName: string;
  productBrief: string;
  tone: string;
  duration: number;
  productImages: Array<{
    id: string;
    name: string;
    preview: string;
    byteSize: number;
    assetId?: string;
  }>;
  stageAssets: Partial<Record<SpokespersonStage, StageAsset>>;
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

const draftStorageKey = "aigc-model-spokesperson-script-draft";
const toneOptions = [
  ["auto", "智能匹配"],
  ["natural", "自然种草"],
  ["enthusiastic", "强带货"],
  ["professional", "专业讲解"],
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

export function ModelSpokespersonScriptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [projectTitle, setProjectTitle] = useState("模特口播项目");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [productName, setProductName] = useState("");
  const [productBrief, setProductBrief] = useState("");
  const [tone, setTone] = useState("auto");
  const [duration] = useState(15);
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
  const [videoPhase, setVideoPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [busy, setBusy] = useState(false);
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
      if (["auto", "natural", "enthusiastic", "professional"].includes(draft.tone || "")) setTone(draft.tone!);
      if (Array.isArray(draft.productImages)) {
        setProductImages(
          draft.productImages
            .filter((image) => typeof image?.assetId === "string" && typeof image.preview === "string")
            .map((image) => ({ ...image, file: undefined })),
        );
      }
      if (draft.stageAssets && typeof draft.stageAssets === "object") setStageAssets(draft.stageAssets);
      if (Array.isArray(draft.plans)) setPlans(draft.plans);
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
  const canGeneratePlans = productName.trim().length > 0 && productBrief.trim().length > 0 && !busy;

  const draftValue = (): Draft => ({
    productName,
    productBrief,
    tone,
    duration,
    productImages: productImages.map(({ id, name, preview, byteSize, assetId }) => ({
      id,
      name,
      preview: assetId ? `/api/assets/${assetId}/download/` : preview,
      byteSize,
      assetId,
    })),
    stageAssets,
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
  }, [draftHydrated, duration, plans, productBrief, productImages, projectId, projectTitle, result, selectedPlanId, stageAssets, tone, videoPack]);

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
      setPlans(body.plans);
      setSelectedPlanId(body.plans[0]?.id || "");
      setResult(body.plans[0]?.script || null);
      setVideoPack(null);
      setVideoTask(null);
      setVideoPhase("idle");
      setVideoError("");
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          ...draftValue(),
          plans: body.plans,
          selectedPlanId: body.plans[0]?.id || "",
          result: body.plans[0]?.script || null,
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
    if (["natural", "enthusiastic", "professional"].includes(item.tone)) setTone(item.tone);
    setPlans([]);
    setSelectedPlanId("");
    setResult(null);
    setVideoPack(null);
    setVideoTask(null);
    setVideoPhase("idle");
    setVideoError("");
    setError("");
    setNotice("案例参数已回填，可以生成 A/B/C 方案");
    window.setTimeout(() => setNotice(""), 1800);
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
          selectedPlan,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY" || !body?.pack?.finalPrompt) {
        throw new Error(body?.message || "视频任务包生成失败");
      }
      setVideoPack(body.pack);
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
          ? [stageAssets.productMultiview?.assetId || originalAssetIds[0]].filter(Boolean)
          : [stageAssets.productMultiview?.assetId, stageAssets.modelReference?.assetId, originalAssetIds[0]].filter(
              (id): id is string => Boolean(id),
            );
    if (!sourceIds.length) {
      setVideoError("阶段素材还没有准备好，请先完成上一步");
      return;
    }
    const stagePrompt =
      stage === "productMultiview"
        ? `商品多视图阶段。只生成同一款${productName}的真实商品多视图参考板，必须包含正面、左右45度、侧面、背面、顶部或底部、材质细节和使用方式小图。保持产品轮廓、材质、颜色、接口、按键、Logo位置和比例一致，不要生成真人，不要生成文字或水印。${pack.productMultiview.summary}`
        : stage === "modelReference"
          ? `模特参考阶段。基于商品多视图生成一位隐私安全的虚拟真人模特参考板，必须是完整人体，包含正面、侧面、背面、3/4角度、站姿和手部动作参考。脸部不要逐像素复制真实人物，生成后续可做轻微局部遮挡，保持身体比例、服装穿着关系和动作可执行性。不要输出空衣服、衣架、无头人体或卡通人物。${pack.modelRecommendation.reason}`
          : `12格分镜参考阶段。把已生成的商品多视图、模特参考和商品原图综合为一张清晰的12格动作分镜板，严格按以下时间顺序表现连续口播动作、身体重心、手势、商品展示方向和镜头运动。每格都要有不同且连续的姿态，不要空白格，不要只生成商品静物，不要生成文字水印。${pack.storyboard.frames.map((frame) => `第${frame.index}格 ${frame.timeRange}：${frame.visual}；动作：${frame.camera}；口播：${frame.narration}`).join("；")}`;
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
          scene: stage === "productMultiview" ? "商品多视图" : stage === "modelReference" ? "人物多视图" : "场景多视图",
          style: stage === "modelReference" ? "隐私遮挡" : "参考板",
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
          const asset = stage === "modelReference" ? await createFaceMaskedReferenceAsset(generatedAsset) : generatedAsset;
          setStageAssets((current) => ({ ...current, [stage]: asset }));
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
        stageAssets.modelReference?.assetId,
        stageAssets.storyboard?.assetId,
        ...uploadedImages.map((image) => image.assetId),
      ].filter((id): id is string => Boolean(id));
      const response = await fetch("/api/tasks/model-spokesperson-video/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          assetIds: [...new Set(stagedAssetIds)].slice(0, 6),
          prompt: pack.finalPrompt,
          aspectRatio: "9:16",
          duration,
          resolution: "720p",
          scene: "口播讲解",
          style: "自然口播",
          productInfo: productBrief,
          specialRequirements: selectedPlan.internalPrompt,
          selectedPlanId: selectedPlan.id,
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
        <p>正在载入 AI 模特口播工作台</p>
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
          <strong>AI 模特口播</strong>
        </div>
        <em>
          <FileText size={15} />
          文案生成暂不扣积分
        </em>
      </header>

      <form className="spokesperson-script-layout spokesperson-two-column" onSubmit={generatePlans}>
        <section className="spokesperson-script-form spokesperson-plan-column">
          <div className="spokesperson-script-intro">
            <span>
              <MicVocal size={18} />
              SPOKESPERSON PLAN
            </span>
            <h1>上传商品，先生成 A/B/C 口播方案</h1>
            <p>用户只需要给商品图和一句描述，系统会内置卖点提炼、多视图策略和 15 秒动作导演脚本。</p>
          </div>

          <section className="spokesperson-product-upload">
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

          <div className="spokesperson-field-grid compact">
            <label>
              商品名称 <em>*</em>
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

          <label className="spokesperson-wide-field">
            一句话描述 / 补充卖点 <em>*</em>
            <textarea
              value={productBrief}
              onChange={(event) => setProductBrief(event.target.value)}
              maxLength={600}
              placeholder="例如：这是一个便携榨汁杯，适合上班族、健身人群，卖点是轻巧、好清洗、续航够用。"
            />
            <small>{productBrief.length}/600</small>
          </label>

          <div className="spokesperson-options compact">
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

          <button className="spokesperson-generate" type="submit" disabled={!canGeneratePlans}>
            {busy ? <LoaderCircle className="generation-spinner" size={18} /> : <WandSparkles size={18} />}
            {busy ? "正在生成方案" : plans.length ? "重新生成 A/B/C 方案" : "生成 A/B/C 方案"}
          </button>

          <section className="spokesperson-plan-list">
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
                    {plan.sellingPointSummary.slice(0, 3).map((point) => (
                      <em key={point}>{point}</em>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="spokesperson-plan-empty">生成后会出现 A/B/C 三种讲稿方向。</p>
            )}
          </section>

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

          {!result ? (
            <div className="spokesperson-result-empty">
              <MicVocal size={34} />
              <strong>这里将显示选中的 15 秒讲稿</strong>
              <p>左侧生成 A/B/C 方案后，选择一个方向即可编辑。</p>
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

              <section className="spokesperson-video-pack">
                <header>
                  <div>
                    <strong>视频任务包</strong>
                    <small>商品多视图、模特推荐、12 宫格分镜和最终提示词会自动合并</small>
                  </div>
                  <span>
                    <Layers3 size={14} />
                    内置
                  </span>
                </header>
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
                  <div className="spokesperson-stage-list">
                    {([
                      ["productMultiview", "1. 商品多视图", "先确认产品的正侧背、细节和结构。"],
                      ["modelReference", "2. 模特参考", "生成隐私安全的完整人体和动作参考。"],
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
                          {asset ? <img src={asset.url} alt={title} /> : <span className="spokesperson-stage-placeholder">待生成</span>}
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
                    title={videoPack?.title || result?.title || "AI 模特口播视频"}
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
    </main>
  );
}
