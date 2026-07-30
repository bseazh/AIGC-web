"use client";

import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Download,
  Film,
  FolderOpen,
  ImagePlus,
  Link2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { VideoGenerationProgress } from "@/app/components/video-generation-progress";

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
type Account = { wallet: { availablePoints: number } };
type Result = {
  status: string;
  outputs: Array<{ assetId: string; url: string }>;
};
type DouyinAnalysis = {
  title: string;
  durationSeconds: number;
  clipRequired: boolean;
};
type SourceKind = "video" | "product" | "scene";
const imageAccept = "image/jpeg,image/png,image/webp";
const videoMixHandoffKey = "aigc-video-mix-asset-ids";

export function RecreateVideoPage() {
  const router = useRouter();
  const refs = {
    video: useRef<HTMLInputElement>(null),
    product: useRef<HTMLInputElement>(null),
    scene: useRef<HTMLInputElement>(null),
  };
  const [account, setAccount] = useState<Account | null>(null);
  const [reference, setReference] = useState<Item | null>(null);
  const [products, setProducts] = useState<Item[]>([]);
  const [scene, setScene] = useState<Item | null>(null);
  const [tab, setTab] = useState<SourceKind | null>(null);
  const [videoSource, setVideoSource] = useState<
    "local" | "library" | "douyin"
  >("local");
  const [douyinInput, setDouyinInput] = useState("");
  const [douyinBusy, setDouyinBusy] = useState<
    "analyzing" | "importing" | null
  >(null);
  const [douyinError, setDouyinError] = useState("");
  const [douyinAnalysis, setDouyinAnalysis] = useState<DouyinAnalysis | null>(
    null,
  );
  const [douyinStart, setDouyinStart] = useState(0);
  const [douyinClipDuration, setDouyinClipDuration] = useState(15);
  const [douyinClips, setDouyinClips] = useState<Item[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [info, setInfo] = useState("");
  const [special, setSpecial] = useState("");
  const [modelOn, setModelOn] = useState(false);
  const [modelInfo, setModelInfo] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState("15");
  const [resolution, setResolution] = useState("720p");
  const [usageAuthorized, setUsageAuthorized] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "generating" | "succeeded" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

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
  const choose = async (kind: SourceKind, files?: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    if (kind === "video") {
      const file = list[0];
      if (file.type !== "video/mp4") return setError("对标视频仅支持 MP4 格式");
      if (file.size > 100 * 1024 * 1024)
        return setError("对标视频不能超过 100MB");
      try {
        const durationSeconds = await readVideoDuration(file);
        if (durationSeconds < 3 || durationSeconds > 15)
          return setError(
            `该视频 ${durationSeconds.toFixed(1)} 秒，当前仅支持 3–15 秒。为避免截错内容，系统不会自动裁剪，请先剪辑后上传。`,
          );
        setReference({
          file,
          preview: URL.createObjectURL(file),
          name: file.name,
          byteSize: file.size,
          durationSeconds,
        });
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
      if (kind === "scene") setScene(valid[0]);
      else setProducts((current) => [...current, ...valid].slice(0, 5));
    }
    resetTask();
  };
  const openLibrary = async (kind: SourceKind) => {
    if (kind === "video") setVideoSource("library");
    setTab(kind);
    setError("");
    try {
      const response = await fetch("/api/assets/?kind=ALL", {
        cache: "no-store",
      });
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
    }
  };
  const select = (asset: Asset) => {
    if (
      tab === "video" &&
      (!asset.durationSeconds ||
        asset.durationSeconds < 3 ||
        asset.durationSeconds > 15)
    )
      return setError("该视频未记录有效时长或不在 3–15 秒内，请重新上传后使用");
    const selected = {
      assetId: asset.id,
      preview: asset.url,
      name: asset.originalName,
      byteSize: asset.byteSize,
      durationSeconds: asset.durationSeconds || undefined,
    };
    if (tab === "video") setReference(selected);
    if (tab === "scene") setScene(selected);
    if (tab === "product")
      setProducts((current) =>
        current.some((item) => item.assetId === asset.id)
          ? current.filter((item) => item.assetId !== asset.id)
          : current.length < 5
            ? [...current, selected]
            : current,
      );
    setTab(null);
    resetTask();
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
      if (!response.ok || body?.status !== "ANALYZED") {
        throw new Error(body?.message || "抖音链接解析失败");
      }
      setDouyinAnalysis({
        title: body.title,
        durationSeconds: body.durationSeconds,
        clipRequired: body.clipRequired === true,
      });
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
          ...(douyinAnalysis.clipRequired
            ? {
                startSeconds: douyinStart,
                clipDurationSeconds: douyinClipDuration,
              }
            : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY") {
        throw new Error(body?.message || "抖音视频导入失败");
      }
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
      setReference(importedClip);
      setDouyinClips((current) =>
        current.some((item) => item.assetId === importedClip.assetId)
          ? current
          : [...current, importedClip].slice(0, 10),
      );
      setDouyinError("");
      resetTask();
    } catch (caught) {
      setDouyinError(
        caught instanceof Error ? caught.message : "抖音视频导入失败",
      );
    } finally {
      setDouyinBusy(null);
    }
  };
  const removeProduct = (index: number) =>
    setProducts((current) => {
      const item = current[index];
      if (item?.file) URL.revokeObjectURL(item.preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  const moveDouyinClip = (index: number, direction: -1 | 1) =>
    setDouyinClips((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const removeDouyinClip = (assetId?: string) => {
    if (!assetId) return;
    setDouyinClips((current) =>
      current.filter((item) => item.assetId !== assetId),
    );
    if (reference?.assetId === assetId) setReference(null);
    resetTask();
  };
  const goToVideoMix = () => {
    const assetIds = douyinClips
      .map((item) => item.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    if (assetIds.length) {
      sessionStorage.setItem(videoMixHandoffKey, JSON.stringify(assetIds));
    } else {
      sessionStorage.removeItem(videoMixHandoffKey);
    }
    router.push("/create/video-mix");
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
    if (!reference || !products.length || !usageAuthorized || phase !== "idle")
      return;
    setError("");
    setResult(null);
    setPhase("uploading");
    try {
      const assetIds = [
        ...(await Promise.all(products.map(upload))),
        await upload(reference),
        ...(scene ? [await upload(scene)] : []),
      ];
      const prompt = [
        `产品信息：${info.trim()}`,
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
      await poll(created.taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
      setPhase("failed");
    }
  };
  const box = (
    kind: SourceKind,
    title: string,
    required: boolean,
    description: string,
    Icon: typeof Video,
  ) => {
    const item = kind === "video" ? reference : kind === "scene" ? scene : null;
    const maxDouyinStart = douyinAnalysis
      ? Math.max(0, douyinAnalysis.durationSeconds - douyinClipDuration)
      : 0;
    return (
      <section className="recreate-source">
        <div className="ad-field-title">
          {title} {required && <em>*</em>}
        </div>
        <div className={`ad-source-tabs ${kind === "video" ? "three" : ""}`}>
          <button
            type="button"
            className={
              kind === "video"
                ? videoSource === "local"
                  ? "active"
                  : ""
                : tab !== kind
                  ? "active"
                  : ""
            }
            onClick={() => {
              if (kind === "video") {
                setVideoSource("local");
                setTab(null);
              }
              refs[kind].current?.click();
            }}
          >
            <Upload size={16} />
            本地上传
          </button>
          <button
            type="button"
            className={
              kind === "video"
                ? videoSource === "library"
                  ? "active"
                  : ""
                : tab === kind
                  ? "active"
                  : ""
            }
            onClick={() => openLibrary(kind)}
          >
            <FolderOpen size={17} />
            资产库
          </button>
          {kind === "video" && (
            <button
              type="button"
              className={videoSource === "douyin" ? "active" : ""}
              onClick={() => {
                setVideoSource("douyin");
                setTab(null);
                setError("");
                setDouyinError("");
              }}
            >
              <Link2 size={17} />
              抖音链接
            </button>
          )}
        </div>
        {kind === "video" && videoSource === "douyin" ? (
          <div className="douyin-import-panel">
            <label>
              抖音分享链接
              <textarea
                value={douyinInput}
                onChange={(event) => {
                  setDouyinInput(event.target.value);
                  setDouyinError("");
                  setDouyinAnalysis(null);
                  if (reference?.source === "douyin") {
                    setReference(null);
                    resetTask();
                  }
                }}
                maxLength={5000}
                placeholder="粘贴抖音分享链接或完整分享文案"
              />
            </label>
            {!douyinAnalysis && (
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
                {douyinBusy === "analyzing" ? "正在读取视频信息" : "解析链接"}
              </button>
            )}
            {douyinAnalysis && reference?.source !== "douyin" && (
              <div className="douyin-clip-editor">
                <header>
                  <div>
                    <strong>{douyinAnalysis.title}</strong>
                    <small>
                      视频总时长 {douyinAnalysis.durationSeconds.toFixed(1)} 秒
                    </small>
                  </div>
                  <span>
                    {douyinAnalysis.clipRequired ? "选择片段" : "完整视频"}
                  </span>
                </header>
                {douyinAnalysis.clipRequired ? (
                  <>
                    <div className="douyin-clip-range">
                      <span>开始时间</span>
                      <strong>
                        {douyinStart.toFixed(1)}s –{" "}
                        {(douyinStart + douyinClipDuration).toFixed(1)}s
                      </strong>
                      <input
                        type="range"
                        min={0}
                        max={maxDouyinStart}
                        step={0.1}
                        value={Math.min(douyinStart, maxDouyinStart)}
                        aria-label="片段开始时间"
                        onChange={(event) =>
                          setDouyinStart(Number(event.target.value))
                        }
                      />
                      <small>
                        <span>0s</span>
                        <span>{maxDouyinStart.toFixed(1)}s</span>
                      </small>
                    </div>
                    <div className="douyin-clip-length">
                      <span>片段长度</span>
                      <div>
                        {[5, 10, 15].map((seconds) => (
                          <button
                            type="button"
                            className={
                              douyinClipDuration === seconds ? "active" : ""
                            }
                            key={seconds}
                            onClick={() => {
                              setDouyinClipDuration(seconds);
                              setDouyinStart((current) =>
                                Math.min(
                                  current,
                                  Math.max(
                                    0,
                                    douyinAnalysis.durationSeconds - seconds,
                                  ),
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
                  <p>该视频不超过 15 秒，将导入完整内容。</p>
                )}
                <button
                  type="button"
                  onClick={importDouyin}
                  disabled={Boolean(douyinBusy) || douyinClips.length >= 10}
                >
                  {douyinBusy === "importing" ? (
                    <LoaderCircle className="generation-spinner" size={17} />
                  ) : (
                    <Download size={17} />
                  )}
                  {douyinBusy === "importing"
                    ? "正在截取并保存"
                    : douyinClips.length >= 10
                      ? "片段列表已满"
                    : douyinAnalysis.clipRequired
                      ? "截取并导入"
                      : "导入完整视频"}
                </button>
                <p>
                  片段会保存到素材库；可重复选择其他片段，生成后前往智能混剪拼接。
                </p>
              </div>
            )}
            {!douyinAnalysis && (
              <p>
                支持完整抖音分享文案；长视频解析后可选择 5、10 或 15 秒片段。
              </p>
            )}
            {douyinError && (
              <p className="creator-error" role="alert">
                {douyinError}
              </p>
            )}
            {reference?.source === "douyin" && (
              <div className="douyin-imported-video">
                <video
                  src={reference.preview}
                  controls
                  playsInline
                  preload="metadata"
                />
                <span>
                  <strong>{reference.name}</strong>
                  <small>
                    {reference.durationSeconds?.toFixed(1)} 秒 · 已保存到素材库
                  </small>
                </span>
                {douyinAnalysis?.clipRequired && (
                  <button
                    type="button"
                    onClick={() => {
                      setReference(null);
                      setDouyinError("");
                      resetTask();
                    }}
                  >
                    选择其他片段
                  </button>
                )}
              </div>
            )}
            {douyinClips.length > 0 && (
              <section className="douyin-clip-collection">
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
                      className={
                        reference?.assetId === clip.assetId ? "active" : ""
                      }
                      key={clip.assetId}
                    >
                      <button
                        type="button"
                        className="douyin-clip-preview"
                        onClick={() => {
                          setReference(clip);
                          resetTask();
                        }}
                        aria-label={`选择片段 ${index + 1} 用于复刻`}
                      >
                        <video
                          src={clip.preview}
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <span>{index + 1}</span>
                      </button>
                      <button
                        type="button"
                        className="douyin-clip-name"
                        onClick={() => {
                          setReference(clip);
                          resetTask();
                        }}
                      >
                        <strong>{clip.name}</strong>
                        <small>
                          {typeof clip.clipStartSeconds === "number" &&
                          typeof clip.clipEndSeconds === "number"
                            ? `${clip.clipStartSeconds.toFixed(1)}–${clip.clipEndSeconds.toFixed(1)} 秒`
                            : `${clip.durationSeconds?.toFixed(1)} 秒`}
                          {reference?.assetId === clip.assetId
                            ? " · 当前复刻片段"
                            : ""}
                        </small>
                      </button>
                      <div className="douyin-clip-actions">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveDouyinClip(index, -1)}
                          aria-label="片段上移"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={index === douyinClips.length - 1}
                          onClick={() => moveDouyinClip(index, 1)}
                          aria-label="片段下移"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDouyinClip(clip.assetId)}
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
          </div>
        ) : tab === kind ? (
          <div className="recreate-library">
            {assets.length ? (
              assets.map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => select(asset)}
                >
                  {asset.mimeType === "video/mp4" ? (
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
        ) : (
          <button
            type="button"
            className="ad-dropzone recreate-drop"
            onClick={() => refs[kind].current?.click()}
          >
            <span>
              <Icon size={27} />
            </span>
            <strong>{title}</strong>
            <small>{description}</small>
            <small>
              {kind === "product"
                ? `已上传 ${products.length}/5 个`
                : item
                  ? "已选择 1 个"
                  : "已上传 0/1 个"}
            </small>
            <input
              ref={refs[kind]}
              type="file"
              accept={kind === "video" ? "video/mp4" : imageAccept}
              multiple={kind === "product"}
              onChange={(event) => choose(kind, event.target.files)}
            />
          </button>
        )}
      </section>
    );
  };
  const busy = phase === "uploading" || phase === "generating";
  if (!account)
    return (
      <main className="workspace-loading">
        <Sparkles />
      </main>
    );
  return (
    <main className="recreate-studio">
      <header className="ad-studio-header">
        <button
          type="button"
          onClick={() => router.push("/create/product-video")}
        >
          <ArrowLeft size={19} />
          返回视频创作
        </button>
      </header>
      <form className="recreate-card" onSubmit={submit}>
        <div className="ad-studio-title">
          <Film size={22} />
          <strong>复刻爆款带货视频-新版</strong>
        </div>
        <div className="ad-studio-body">
          {box("video", "对标视频", true, "视频时长需在 3–15 秒之间", Video)}
          {reference?.durationSeconds && (
            <p className="recreate-review">
              <Video size={15} />
              已读取对标视频时长：{reference.durationSeconds.toFixed(1)} 秒
            </p>
          )}
          {box("product", "商品图", true, "上传商品图片，支持多张", ImagePlus)}
          {products.length > 0 && (
            <div className="ad-selected-images">
              {products.map((product, index) => (
                <article key={`${product.assetId || product.name}-${index}`}>
                  <img src={product.preview} alt="商品图片预览" />
                  <button
                    type="button"
                    onClick={() => {
                      removeProduct(index);
                      resetTask();
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
          <label className="recreate-consent">
            <input
              type="checkbox"
              checked={usageAuthorized}
              onChange={(event) => {
                setUsageAuthorized(event.target.checked);
                resetTask();
              }}
            />
            我确认拥有对标视频、商品图及其他上传素材的合法使用授权，并同意平台记录本次确认。
          </label>
          <label className="recreate-toggle">
            自定义模特信息{" "}
            <input
              type="checkbox"
              checked={modelOn}
              onChange={(event) => {
                setModelOn(event.target.checked);
                resetTask();
              }}
            />
            <i />
          </label>
          <p className="recreate-review">
            <ShieldCheck size={15} />
            真人模特内容将按平台规则进行审核
          </p>
          {modelOn && (
            <label className="ad-form-field">
              模特信息（可选）
              <textarea
                value={modelInfo}
                onChange={(event) => setModelInfo(event.target.value)}
                maxLength={300}
                placeholder="例如：女性，25 岁，自然亲和，居家穿搭"
              />
            </label>
          )}
          {box(
            "scene",
            "场景图（选填）",
            false,
            "上传希望出现的商品场景",
            ImagePlus,
          )}
          <label className="ad-form-field">
            产品信息（可选）
            <textarea
              value={info}
              onChange={(event) => setInfo(event.target.value)}
              maxLength={600}
              placeholder="例如：产品名称、核心卖点、材质、目标人群"
            />
          </label>
          <label className="ad-form-field">
            视频特殊要求（可选）
            <textarea
              value={special}
              onChange={(event) => setSpecial(event.target.value)}
              maxLength={600}
              placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影"
            />
          </label>
          <div className="ad-select-grid">
            <label>
              视频比例 <em>*</em>
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
            预计积分：
            {reference && products.length
              ? "40 积分"
              : "待填写：对标视频和商品图"}
          </p>
          {busy && (
            <VideoGenerationProgress
              phase={phase}
              taskStatus={result?.status}
              title="复刻带货视频"
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
              <a href={`/api/assets/${result.outputs[0].assetId}/download/`}>
                <Download size={16} />
                下载视频
              </a>
              <button type="button" onClick={goToVideoMix}>
                <Film size={16} />
                前往智能混剪
                {douyinClips.length > 0
                  ? `（已带入 ${douyinClips.length} 段）`
                  : ""}
              </button>
            </div>
          )}
          <div className="ad-actions">
            <button
              className="ad-generate"
              type="submit"
              disabled={
                !reference || !products.length || !usageAuthorized || busy
              }
            >
              {busy ? <LoaderCircle size={18} /> : <Film size={18} />}
              {busy ? "任务处理中" : "生成复刻带货视频"}
            </button>
            <button
              className="ad-reset"
              type="button"
              onClick={() => {
                setReference(null);
                setProducts([]);
                setScene(null);
                setInfo("");
                setSpecial("");
                setModelInfo("");
                setModelOn(false);
                setUsageAuthorized(false);
                setVideoSource("local");
                setDouyinInput("");
                setDouyinError("");
                setDouyinAnalysis(null);
                setDouyinStart(0);
                setDouyinClipDuration(15);
                setDouyinClips([]);
                resetTask();
              }}
            >
              重置
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
