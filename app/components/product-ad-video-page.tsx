"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Film,
  FolderOpen,
  LoaderCircle,
  PlayCircle,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { VideoGenerationProgress } from "@/app/components/video-generation-progress";
import { GeneratedAssetActions, TemporaryResultNotice, restoredTaskPhase, watchProjectTaskResult, type GeneratedTaskResult } from "@/app/components/generated-asset-actions";

type Account = { wallet: { availablePoints: number } };
type SelectedImage = {
  preview: string;
  name: string;
  byteSize: number;
  file?: File;
  assetId?: string;
};
type Asset = {
  id: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  url: string;
  kind: string;
};
type Result = GeneratedTaskResult;
const maxImages = 5;
const imageAccepts = "image/jpeg,image/png,image/webp";

type ProductAdCase = {
  id: string;
  title: string;
  tag: "视频案例";
  poster: string;
  description: string;
  productInfo: string;
  specialRequirements: string;
  executionMode: string;
  ratio: string;
  imageRatio: string;
  duration: string;
  model: string;
  modelLabel: string;
  resolution: string;
  internalPrompt: string;
};

const productAdCases: ProductAdCase[] = [
  {
    id: "icy-water",
    title: "清爽气泡水广告大片",
    tag: "视频案例",
    poster:
      "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=88",
    description: "冰块、水珠、蓝白高光棚拍，做出清爽饮品广告节奏。",
    productInfo: "蓝瓶气泡水饮料，主打冰爽、低糖、清透口感，面向年轻通勤和运动后补水人群。",
    specialRequirements:
      "冰块飞溅、冷凝水珠、蓝白高光棚拍，镜头从瓶身特写推进到完整产品展示，节奏清爽高级。",
    executionMode: "分段式执行",
    ratio: "16:9",
    imageRatio: "9:16",
    duration: "15",
    model: "doubao-seedance-2",
    modelLabel: "即梦 Seedance-2",
    resolution: "720p",
    internalPrompt:
      "内置策略：以饮品广告片逻辑组织镜头。开场用冰块、水珠和瓶身高光建立清爽感，中段用慢速推进和环绕展示包装细节，结尾保持产品居中、背景干净、无文字水印。",
  },
  {
    id: "jewelry-ring",
    title: "镜面金属气垫粉饼广告大片",
    tag: "视频案例",
    poster:
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=88",
    description: "镜面反光、柔光棚拍、慢速环绕，突出轻奢金属质感。",
    productInfo: "镜面银色椭圆气垫粉饼，主打轻奢彩妆、细腻底妆和便携补妆场景。",
    specialRequirements:
      "暖色棚拍光、慢速环绕运镜、金属高光闪烁，背景保持简洁高级，突出镜面轮廓和反光细节。",
    executionMode: "分段式执行",
    ratio: "9:16",
    imageRatio: "1:1",
    duration: "15",
    model: "doubao-seedance-2",
    modelLabel: "即梦 Seedance-2",
    resolution: "720p",
    internalPrompt:
      "内置策略：以轻奢美妆广告逻辑组织镜头。保持商品为唯一主主体，使用柔光反射、慢速旋转、开盒/合盖暗示和细节近景，避免生成可读文字、价格、水印或额外品牌。",
  },
  {
    id: "luxury-bag",
    title: "通勤箱包大片高级质感视频",
    tag: "视频案例",
    poster:
      "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=88",
    description: "都市通勤、皮革近景、生活方式陈列，强调高级实用感。",
    productInfo: "通勤手提包，主打高级皮革、容量收纳和商务穿搭，面向都市白领女性。",
    specialRequirements:
      "咖色室内陈列、柔和侧光、镜头缓慢推近包身纹理，再切到桌面生活方式场景。",
    executionMode: "分段式执行",
    ratio: "9:16",
    imageRatio: "4:3",
    duration: "15",
    model: "doubao-seedance-2",
    modelLabel: "即梦 Seedance-2",
    resolution: "720p",
    internalPrompt:
      "内置策略：以通勤箱包生活方式广告组织镜头。先展示整体轮廓，再展示皮革纹理、五金、容量和上手使用感，镜头节奏稳定高级，场景干净且不出现无关人物脸部特写。",
  },
];

async function createCaseImage(item: ProductAdCase): Promise<SelectedImage> {
  const response = await fetch(item.poster);
  if (!response.ok) throw new Error("案例素材加载失败");
  const blob = await response.blob();
  const mimeType = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const suffix = mimeType.split("/")[1] || "jpg";
  const file = new File([blob], `${item.id}-case-material.${suffix}`, {
    type: mimeType,
  });
  return {
    file,
    preview: URL.createObjectURL(file),
    name: file.name,
    byteSize: file.size,
  };
}

export function ProductAdVideoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [sourceTab, setSourceTab] = useState<"local" | "library">("local");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [productInfo, setProductInfo] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [executionMode, setExecutionMode] = useState("分段式执行");
  const [ratio, setRatio] = useState("9:16");
  const [imageRatio, setImageRatio] = useState("自动适配");
  const [duration, setDuration] = useState("15");
  const [videoModel, setVideoModel] = useState("doubao-seedance-2");
  const [resolution, setResolution] = useState("720p");
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "generating" | "succeeded" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const markSaved = (assetId: string) => setResult((current) => current ? { ...current, outputs: current.outputs.map((output) => output.assetId === assetId ? { ...output, savedToLibrary: true, expiresAt: null } : output) } : current);
  useEffect(() => watchProjectTaskResult(projectId, (restored) => { setResult(restored); setPhase(restoredTaskPhase(restored)); }), [projectId]);
  const [appliedCaseId, setAppliedCaseId] = useState("");
  const [applyingCaseId, setApplyingCaseId] = useState("");
  const [detailCase, setDetailCase] = useState<ProductAdCase | null>(null);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  const resetTask = () => {
    setError("");
    setResult(null);
    setPhase("idle");
  };
  const applyCase = async (item: ProductAdCase) => {
    setApplyingCaseId(item.id);
    setError("");
    setProductInfo(item.productInfo);
    setSpecialRequirements(item.specialRequirements);
    setExecutionMode(item.executionMode);
    setRatio(item.ratio);
    setImageRatio(item.imageRatio);
    setDuration(item.duration);
    setVideoModel(item.model);
    setResolution(item.resolution);
    setAppliedCaseId(item.id);
    resetTask();
    try {
      const caseImage = await createCaseImage(item);
      setImages((current) => {
        current.forEach((image) => {
          if (image.file) URL.revokeObjectURL(image.preview);
        });
        return [caseImage];
      });
    } catch (caught) {
      setError(caught instanceof Error ? `${caught.message}，已先回填案例参数` : "案例素材加载失败，已先回填案例参数");
    } finally {
      setApplyingCaseId("");
      setDetailCase(null);
    }
  };
  const addFiles = (files?: FileList | null) => {
    if (!files) return;
    const accepted: SelectedImage[] = [];
    for (const file of Array.from(files)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError("仅支持 JPG、PNG、WebP 图片");
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("单张产品图片不能超过 10MB");
        continue;
      }
      accepted.push({
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
        byteSize: file.size,
      });
    }
    setImages((current) => {
      const available = maxImages - current.length;
      if (accepted.length > available)
        setError(`最多可添加 ${maxImages} 张产品图片`);
      return [...current, ...accepted.slice(0, Math.max(0, available))];
    });
    resetTask();
  };
  const openLibrary = async () => {
    setSourceTab("library");
    setAssetsLoading(true);
    try {
      const response = await fetch("/api/assets/?kind=ALL", {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setAssets(
        (body.assets || []).filter((asset: Asset) =>
          asset.mimeType.startsWith("image/"),
        ),
      );
    } catch {
      setError("素材库加载失败，请稍后再试");
    } finally {
      setAssetsLoading(false);
    }
  };
  const toggleAsset = (asset: Asset) => {
    const existing = images.find((item) => item.assetId === asset.id);
    if (existing) {
      setImages((current) =>
        current.filter((item) => item.assetId !== asset.id),
      );
      resetTask();
      return;
    }
    if (images.length >= maxImages)
      return setError(`最多可添加 ${maxImages} 张产品图片`);
    setImages((current) => [
      ...current,
      {
        assetId: asset.id,
        preview: asset.url,
        name: asset.originalName,
        byteSize: asset.byteSize,
      },
    ]);
    resetTask();
  };
  const removeImage = (index: number) =>
    setImages((current) => {
      const item = current[index];
      if (item?.file) URL.revokeObjectURL(item.preview);
      resetTask();
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  const upload = async (image: SelectedImage) => {
    if (image.assetId) return image.assetId;
    if (!image.file) throw new Error("产品图片未找到");
    const response = await fetch("/api/uploads/presign/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: image.file.name,
        mimeType: image.file.type,
        byteSize: image.file.size,
      }),
    });
    const presign = await response.json();
    if (!response.ok) throw new Error(presign.message || "获取上传地址失败");
    const stored = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": image.file.type },
      body: image.file,
    });
    if (!stored.ok) throw new Error("产品图片上传失败");
    const confirmed = await fetch("/api/uploads/confirm/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: presign.assetId }),
    });
    if (!confirmed.ok) throw new Error("产品图片校验失败");
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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!images.length || ["uploading", "generating"].includes(phase)) return;
    setError("");
    setResult(null);
    setPhase("uploading");
    try {
      const assetIds = await Promise.all(images.map(upload));
      const prompt = [
        `产品信息：${productInfo.trim()}`,
        `视频特殊要求：${specialRequirements.trim()}`,
        `执行方式：${executionMode}`,
        `图片比例：${imageRatio}`,
        `视频模型：${videoModel}`,
        appliedCaseId ? `案例预设：${appliedCaseId}` : "",
        appliedCaseId
          ? productAdCases.find((item) => item.id === appliedCaseId)?.internalPrompt || ""
          : "内置策略：按照高品质电商广告片组织镜头，突出商品主体、材质、卖点和使用氛围，画面内不要生成可读文字、价格、水印或额外品牌。",
      ]
        .filter((line) => !line.endsWith("："))
        .join("\n");
      const response = await fetch("/api/tasks/product-ad-video/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          assetIds,
          prompt,
          aspectRatio: ratio,
          duration: Number(duration),
          resolution,
          scene: "产品广告大片",
          style: "商业广告",
          videoModel,
          executionMode,
          imageRatio,
          productInfo: productInfo.trim(),
          specialRequirements: specialRequirements.trim(),
          appliedCaseId,
          draftId: projectId,
        }),
      });
      const created = await response.json();
      if (!response.ok)
        throw new Error(created.message || created.code || "创建任务失败");
      setPhase("generating");
      await poll(created.taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
      setPhase("failed");
    }
  };
  const reset = () => {
    images.forEach((item) => {
      if (item.file) URL.revokeObjectURL(item.preview);
    });
    setImages([]);
    setProductInfo("");
    setSpecialRequirements("");
    setExecutionMode("分段式执行");
    setRatio("9:16");
    setImageRatio("自动适配");
    setDuration("15");
    setVideoModel("doubao-seedance-2");
    setResolution("720p");
    setAppliedCaseId("");
    setApplyingCaseId("");
    setDetailCase(null);
    resetTask();
  };
  if (!account)
    return (
      <main className="workspace-loading">
        <span>
          <Sparkles size={22} />
        </span>
        <p>正在载入芭乐AIGC</p>
      </main>
    );
  const busy = phase === "uploading" || phase === "generating";

  return (
    <main className="ad-studio-shell">
      <header className="ad-studio-header">
        <button onClick={() => router.push("/create/product-video")}>
          <ArrowLeft size={19} />
          返回视频创作
        </button>
      </header>
      <div className="ad-studio-layout">
        <form className="ad-studio-card" onSubmit={submit}>
          <div className="ad-studio-title">
            <Film size={22} />
            <strong>产品广告大片</strong>
          </div>
          <section className="ad-studio-body">
          <div className="ad-field-title">
            产品图片 <em>*</em>
          </div>
          <div className="ad-source-tabs">
            <button
              type="button"
              className={sourceTab === "local" ? "active" : ""}
              onClick={() => setSourceTab("local")}
            >
              <Upload size={17} />
              本地上传
            </button>
            <button
              type="button"
              className={sourceTab === "library" ? "active" : ""}
              onClick={openLibrary}
            >
              <FolderOpen size={18} />
              资产库
            </button>
          </div>
          {sourceTab === "local" ? (
            <button
              type="button"
              className="ad-dropzone"
              onClick={() => inputRef.current?.click()}
            >
              <span>
                <Upload size={28} />
              </span>
              <strong>产品图片</strong>
              <small>选择 1–5 张产品图，单张即可生成</small>
              <small>
                已上传 {images.length}/{maxImages} 个
              </small>
              <input
                ref={inputRef}
                type="file"
                accept={imageAccepts}
                multiple
                onChange={(event) => addFiles(event.target.files)}
              />
            </button>
          ) : (
            <div className="ad-library-panel">
              {assetsLoading ? (
                <div>
                  <LoaderCircle size={22} />
                  正在加载素材
                </div>
              ) : assets.length ? (
                <div className="ad-library-grid">
                  {assets.map((asset) => {
                    const selected = images.some(
                      (item) => item.assetId === asset.id,
                    );
                    return (
                      <button
                        type="button"
                        className={selected ? "selected" : ""}
                        key={asset.id}
                        onClick={() => toggleAsset(asset)}
                      >
                        <img src={asset.url} alt="" />
                        <span>{selected ? <Check size={15} /> : null}</span>
                        <small>{asset.originalName}</small>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="ad-library-empty">
                  <FolderOpen size={24} />
                  暂无图片素材
                </div>
              )}
            </div>
          )}
          {images.length > 0 && (
            <div className="ad-selected-images">
              {images.map((image, index) => (
                <article key={`${image.assetId || image.name}-${index}`}>
                  <img src={image.preview} alt="产品图片预览" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    aria-label="移除产品图片"
                  >
                    <X size={14} />
                  </button>
                  <span>{index + 1}</span>
                </article>
              ))}
            </div>
          )}
          <label className="ad-form-field">
            产品信息（可选）
            <textarea
              value={productInfo}
              onChange={(event) => setProductInfo(event.target.value)}
              maxLength={600}
              placeholder="例如：产品名称、核心卖点、目标人群"
            />
          </label>
          <label className="ad-form-field">
            视频特殊要求（可选）
            <textarea
              value={specialRequirements}
              onChange={(event) => setSpecialRequirements(event.target.value)}
              maxLength={600}
              placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影"
            />
          </label>
          <div className="ad-select-grid">
            <label>
              执行方式 <em>*</em>
              <span className="ad-select">
                <select
                  value={executionMode}
                  onChange={(event) => setExecutionMode(event.target.value)}
                >
                  <option>分段式执行</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            <label>
              视频画面比例 <em>*</em>
              <span className="ad-select">
                <select
                  value={ratio}
                  onChange={(event) => setRatio(event.target.value)}
                >
                  <option value="9:16">竖屏（9:16）</option>
                  <option value="16:9">横屏（16:9）</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            <label>
              图片比例 <em>*</em>
              <span className="ad-select">
                <select
                  value={imageRatio}
                  onChange={(event) => setImageRatio(event.target.value)}
                >
                  <option>自动适配</option>
                  <option>1:1</option>
                  <option>3:4</option>
                  <option>4:3</option>
                  <option>9:16</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            <label>
              视频时长 <em>*</em>
              <span className="ad-select">
                <select
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                >
                  <option value="5">5 秒</option>
                  <option value="10">10 秒</option>
                  <option value="15">15 秒</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            <label>
              视频模型 <em>*</em>
              <span className="ad-select">
                <select
                  value={videoModel}
                  onChange={(event) => setVideoModel(event.target.value)}
                >
                  <option value="doubao-seedance-2">即梦 Seedance-2</option>
                </select>
                <ChevronDown size={16} />
              </span>
            </label>
            <label>
              视频分辨率 <em>*</em>
              <span className="ad-select">
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
          <p className="ad-credit">
            <Sparkles size={16} />
            预计积分：{images.length ? "40 积分" : "待填写：产品图片"}
          </p>
          {busy && (
            <VideoGenerationProgress
              phase={phase}
              taskStatus={result?.status}
              title="产品广告大片"
              durationSeconds={Number(duration)}
            />
          )}
          {error && (
            <p className="creator-error" role="alert">
              {error}
            </p>
          )}
          {phase === "succeeded" && result?.outputs[0] && (
            <div className="ad-result">
              <video src={result.outputs[0].url} controls playsInline />
              <GeneratedAssetActions output={result.outputs[0]} downloadLabel="下载视频" onSaved={markSaved} />
            </div>
          )}
          <TemporaryResultNotice result={result} />
          <div className="ad-actions">
            <button
              className="ad-generate"
              type="submit"
              disabled={!images.length || busy}
            >
              {busy ? <LoaderCircle size={18} /> : <Film size={18} />}
              {busy ? "任务处理中" : "生成产品广告大片"}
            </button>
            <button className="ad-reset" type="button" onClick={reset}>
              重置
            </button>
          </div>
          </section>
        </form>
        <aside className="ad-case-board">
          <header>
            <span>
              <Sparkles size={17} />
            </span>
            <div>
              <h1>案例参考</h1>
              <p>选择案例可一键回填入参</p>
            </div>
          </header>
          <div className="ad-case-grid">
            {productAdCases.map((item) => (
              <article className={appliedCaseId === item.id ? "active" : ""} key={item.id}>
                <button
                  type="button"
                  className="ad-case-media"
                  onClick={() => setDetailCase(item)}
                  aria-label={`查看${item.title}作品详情`}
                >
                  <img src={item.poster} alt={item.title} />
                  <span>
                    <PlayCircle size={12} />
                    {item.tag}
                  </span>
                  <i>
                    <PlayCircle size={21} />
                  </i>
                </button>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <button
                  type="button"
                  className="ad-case-apply"
                  disabled={applyingCaseId === item.id}
                  onClick={() => void applyCase(item)}
                >
                  {applyingCaseId === item.id ? <LoaderCircle size={15} /> : <Wand2 size={15} />}
                  {applyingCaseId === item.id ? "回填中" : "做同款"}
                </button>
              </article>
            ))}
          </div>
        </aside>
      </div>
      {detailCase && (
        <div className="ad-case-dialog-backdrop" role="presentation" onMouseDown={() => setDetailCase(null)}>
          <section
            className="ad-case-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="作品详情"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="ad-case-dialog-close" type="button" onClick={() => setDetailCase(null)} aria-label="关闭作品详情">
              <X size={18} />
            </button>
            <div className="ad-case-dialog-media">
              <img src={detailCase.poster} alt={detailCase.title} />
              <span><PlayCircle size={13} />{detailCase.tag}</span>
            </div>
            <div className="ad-case-dialog-detail">
              <span className="ad-case-dialog-kicker">产品广告大片</span>
              <h2>{detailCase.title}</h2>
              <p>{detailCase.description}</p>
              <div className="ad-case-materials">
                <strong>案例素材</strong>
                <img src={detailCase.poster} alt="" />
              </div>
              <div className="ad-case-params">
                <strong>提示词 / 关键参数</strong>
                <dl>
                  <div><dt>产品信息</dt><dd>{detailCase.productInfo}</dd></div>
                  <div><dt>视频特殊要求</dt><dd>{detailCase.specialRequirements}</dd></div>
                  <div><dt>视频画面比例</dt><dd>{detailCase.ratio}</dd></div>
                  <div><dt>图片比例</dt><dd>{detailCase.imageRatio}</dd></div>
                  <div><dt>模型名称</dt><dd>{detailCase.modelLabel}</dd></div>
                  <div><dt>视频分辨率</dt><dd>{detailCase.resolution}</dd></div>
                  <div><dt>视频时长</dt><dd>{detailCase.duration} 秒</dd></div>
                </dl>
              </div>
              <button
                type="button"
                className="ad-case-dialog-apply"
                disabled={applyingCaseId === detailCase.id}
                onClick={() => void applyCase(detailCase)}
              >
                {applyingCaseId === detailCase.id ? <LoaderCircle size={16} /> : <Wand2 size={16} />}
                {applyingCaseId === detailCase.id ? "正在回填" : "做同款"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
