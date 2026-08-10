"use client";

import { ArrowLeft, FolderOpen, ImageIcon, LoaderCircle, Sparkles, Upload, Wand2, X, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { GenerationProgress } from "@/app/components/generation-progress";
import { GeneratedAssetActions, TemporaryResultNotice, restoredTaskPhase, watchProjectTaskResult, type GeneratedTaskResult } from "@/app/components/generated-asset-actions";
import { useAssistantPromptReceiver, useAssistantWorkspaceContext } from "@/app/features/creation-assistant/use-assistant-prompt";
import { aiImageCases } from "@/lib/image-workflow-cases";
import { imageGenerateWorkflow } from "@/lib/product-config";

type Account = { user: { isAdministrator?: boolean }; wallet: { availablePoints: number } };
type Asset = { id: string; mimeType: string; originalName: string; url: string; kind: string };
type UploadedImage = { id?: string; file?: File; url: string; name: string };
type TaskResult = GeneratedTaskResult;
type Phase = "idle" | "uploading" | "generating" | "succeeded" | "failed";

const ratios = ["1:1", "3:4", "4:3", "9:16"];
const modelOptions = ["Gemini 2.5 Flash Image", "豆包 Seedream 5.0 Pro"];
const resolutions = ["1K", "2K"];
const maxReferenceImages = 10;

function imageProviderForModel(model: string) {
  return model === "豆包 Seedream 5.0 Pro" ? "sophnet" : "gemini";
}

export function AiImageGeneratePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || "";
  const [account, setAccount] = useState<Account | null>(null);
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<string>("9:16");
  const [scene, setScene] = useState<string>(imageGenerateWorkflow.scenes[0]);
  const [style, setStyle] = useState<string>(imageGenerateWorkflow.styles[0]);
  const [model, setModel] = useState<string>(modelOptions[0]);
  const [resolution, setResolution] = useState<string>(resolutions[0]);
  const [sourceTab, setSourceTab] = useState<"local" | "asset">("local");
  const [references, setReferences] = useState<UploadedImage[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [task, setTask] = useState<TaskResult | null>(null);
  const [error, setError] = useState("");
  const [appliedCaseId, setAppliedCaseId] = useState("");

  const busy = phase === "uploading" || phase === "generating";
  const canSubmit = prompt.trim().length > 0 && !busy && (account?.user.isAdministrator || (account?.wallet.availablePoints ?? 0) >= imageGenerateWorkflow.pointsPerTask);
  const quotedText = useMemo(() => {
    if (!account) return "";
    return account.user.isAdministrator ? "管理员免积分 · 报价 10 积分计入成本审计" : `预估积分：${imageGenerateWorkflow.pointsPerTask} · 待填写：提示词`;
  }, [account]);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    return watchProjectTaskResult(projectId, (restored) => { setTask(restored); setPhase(restoredTaskPhase(restored)); });
  }, [projectId]);

  const resetTask = () => {
    setError("");
    setTask(null);
    setPhase("idle");
  };
  useAssistantPromptReceiver({ setPrompt, onApplied: resetTask });
  useAssistantWorkspaceContext(useMemo(() => ({
    images: references.map((item) => ({ url: item.url, name: item.name, role: "reference" as const })),
    productText: prompt,
  }), [prompt, references]));
  const markSaved = (assetId: string) => setTask((current) => current ? { ...current, outputs: current.outputs.map((output) => output.assetId === assetId ? { ...output, savedToLibrary: true, expiresAt: null } : output) } : current);

  const request = async (url: string, init: RequestInit) => {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || "请求失败");
    return body;
  };

  const chooseFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const nextFiles = Array.from(fileList).slice(0, maxReferenceImages - references.length);
    const valid = nextFiles.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024);
    if (valid.length !== nextFiles.length) setError("仅支持 10MB 内 JPG、PNG、WebP 图片");
    setReferences((current) => [...current, ...valid.map((file) => ({ file, url: URL.createObjectURL(file), name: file.name }))].slice(0, maxReferenceImages));
    resetTask();
  };

  const removeReference = (index: number) => {
    setReferences((current) => {
      const target = current[index];
      if (target?.url.startsWith("blob:")) URL.revokeObjectURL(target.url);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    resetTask();
  };

  const loadAssets = async () => {
    setSourceTab("asset");
    setAssetsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setAssets((body.assets || []).filter((asset: Asset) => asset.mimeType.startsWith("image/")));
    } catch {
      setError("素材库加载失败，请稍后再试");
    } finally {
      setAssetsLoading(false);
    }
  };

  const selectAsset = (asset: Asset) => {
    if (references.some((item) => item.id === asset.id) || references.length >= maxReferenceImages) return;
    setReferences((current) => [...current, { id: asset.id, url: asset.url, name: asset.originalName }]);
    resetTask();
  };

  const applyCase = (item: (typeof aiImageCases)[number]) => {
    if (item.ratio && ratios.includes(item.ratio)) setRatio(item.ratio);
    if (item.scene && (imageGenerateWorkflow.scenes as readonly string[]).includes(item.scene)) setScene(item.scene);
    if (item.style && (imageGenerateWorkflow.styles as readonly string[]).includes(item.style)) setStyle(item.style);
    setPrompt(item.prompt.slice(0, 1200));
    setAppliedCaseId(item.id);
    resetTask();
  };

  const uploadReferences = async () => {
    const assetIds = references.filter((item) => item.id).map((item) => item.id as string);
    for (const item of references) {
      if (!item.file) continue;
      const presign = await request("/api/uploads/presign/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: item.file.name, mimeType: item.file.type, byteSize: item.file.size }),
      });
      const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": item.file.type }, body: item.file });
      if (!upload.ok) throw new Error(`参考图上传失败 (${upload.status})`);
      await request("/api/uploads/confirm/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: presign.assetId }),
      });
      assetIds.push(presign.assetId);
    }
    return assetIds;
  };

  const pollTask = async (taskId: string) => {
    const deadline = Date.now() + 6 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" });
      const current = await response.json();
      if (!response.ok) throw new Error(current.message || "任务查询失败");
      setTask(current);
      if (current.status === "SUCCEEDED") {
        setPhase("succeeded");
        const session = await fetch("/api/auth/session/", { cache: "no-store" }).then((item) => item.json());
        setAccount(session);
        return;
      }
      if (["FAILED", "REJECTED", "CANCELED"].includes(current.status)) throw new Error(current.errorCode || "生成失败，积分已退回");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("任务等待超时，请稍后在任务中心查看");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setTask(null);
    setPhase("uploading");
    try {
      const assetIds = await uploadReferences();
      const composedPrompt = [
        prompt.trim(),
        `内置参数：清晰度 ${resolution}，画面比例 ${ratio}，使用场景 ${scene}，视觉风格 ${style}。`,
      ].join("\n");
      const created = await request("/api/tasks/image-generate/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          assetIds,
          prompt: composedPrompt,
          aspectRatio: ratio,
          scene,
          style,
          imageProvider: imageProviderForModel(model),
          imageResolution: resolution,
          draftId: projectId,
        }),
      });
      setPhase("generating");
      await pollTask(created.taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
      setPhase("failed");
    }
  };

  const resetForm = () => {
    setPrompt("");
    setRatio("9:16");
    setScene(imageGenerateWorkflow.scenes[0]);
    setStyle(imageGenerateWorkflow.styles[0]);
    setModel(modelOptions[0]);
    setResolution(resolutions[0]);
    setReferences((current) => {
      current.forEach((item) => {
        if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
      });
      return [];
    });
    setAppliedCaseId("");
    resetTask();
  };

  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;

  return (
    <main className="yh-image-page">
      <button className="yh-back-button" type="button" onClick={() => router.push("/tools")}><ArrowLeft size={16} />返回图片创作</button>
      <div className="yh-image-layout">
        <form className="yh-image-form-card" onSubmit={submit}>
          <header><ImageIcon size={18} /><strong>AI生图</strong></header>
          <label className="yh-field wide">提示词 <em>*</em><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder="请输入图像描述，例如：一只可爱的橘猫在阳光下打盹，温暖真实摄影..." /><small>{prompt.length}/1200</small></label>
          <div className="yh-field-grid">
            <label className="yh-field">首选模型 <em>*</em><select value={model} onChange={(event) => setModel(event.target.value)}>{modelOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="yh-field">清晰度 <em>*</em><select value={resolution} onChange={(event) => setResolution(event.target.value)}>{resolutions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="yh-field">图片比例 <em>*</em><select value={ratio} onChange={(event) => setRatio(event.target.value)}>{ratios.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="yh-field">视觉风格 <em>*</em><select value={style} onChange={(event) => setStyle(event.target.value)}>{imageGenerateWorkflow.styles.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label className="yh-field">使用场景<select value={scene} onChange={(event) => setScene(event.target.value)}>{imageGenerateWorkflow.scenes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <section className="yh-reference-upload">
            <div className="yh-upload-tabs">
              <button className={sourceTab === "local" ? "active" : ""} type="button" onClick={() => setSourceTab("local")}><Upload size={14} />本地上传</button>
              <button className={sourceTab === "asset" ? "active" : ""} type="button" onClick={loadAssets}><FolderOpen size={14} />资产库</button>
            </div>
            {sourceTab === "local" ? <label className="yh-upload-drop"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => chooseFiles(event.target.files)} /><span><Upload size={24} /></span><strong>参考图片（可选）</strong><small>不上传则文生图，上传后按参考图生成<br />已上传 {references.length}/{maxReferenceImages} 个</small></label> : <div className="yh-asset-picker">{assetsLoading ? <p><LoaderCircle size={18} />正在加载素材</p> : assets.length ? assets.slice(0, 12).map((asset) => <button type="button" key={asset.id} onClick={() => selectAsset(asset)}><img src={asset.url} alt="" /><span>{asset.originalName}</span></button>) : <p>暂无可用图片素材</p>}</div>}
            {references.length > 0 && <div className="yh-reference-list">{references.map((item, index) => <article key={`${item.url}-${index}`}><img src={item.url} alt="" /><button type="button" aria-label="移除参考图" onClick={() => removeReference(index)}><X size={13} /></button></article>)}</div>}
          </section>
          <p className="yh-credit"><Zap size={15} />{quotedText}</p>
          {error && <p className="creator-error" role="alert">{error}</p>}
          <TemporaryResultNotice result={task} />
          <div className="yh-actions"><button type="submit" disabled={!canSubmit}><Wand2 size={16} />{busy ? "任务处理中" : "提交生成任务"}</button><button type="button" onClick={resetForm}>重置</button></div>
        </form>

        <section className="yh-case-board">
          <header><span><Sparkles size={17} /></span><div><h1>案例参考</h1><p>选择案例可一键回填入参</p></div></header>
          {busy && <GenerationProgress phase={phase} taskStatus={task?.status} title="AI生图" outputCount={4} />}
          {phase === "succeeded" && task?.outputs.length ? <div className="yh-result-grid">{task.outputs.map((output, index) => <article key={output.assetId}><img src={output.url} alt={`AI生图结果 ${index + 1}`} /><GeneratedAssetActions output={output} onSaved={markSaved} /></article>)}</div> : phase === "succeeded" && task?.expiredOutputCount ? null : <div className="yh-case-grid">{aiImageCases.map((item) => <article className={appliedCaseId === item.id ? "active" : ""} key={item.id}><div className="yh-case-media"><img src={item.image} alt={item.title} /><span><ImageIcon size={12} />图片案例</span></div><strong>{item.title}</strong><button type="button" onClick={() => applyCase(item)}><Wand2 size={15} />做同款</button></article>)}</div>}
          <footer><button type="button" aria-label="上一页">‹</button><span>1 / 2</span><button type="button" aria-label="下一页">›</button></footer>
        </section>
      </div>
    </main>
  );
}
