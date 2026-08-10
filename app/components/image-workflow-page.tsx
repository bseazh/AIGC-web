"use client";

import { ArrowLeft, FolderOpen, ImagePlus, LoaderCircle, Sparkles, Upload, Wand2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { GenerationProgress } from "@/app/components/generation-progress";
import { GeneratedAssetActions, TemporaryResultNotice, restoredTaskPhase, watchProjectTaskResult, type GeneratedTaskResult } from "@/app/components/generated-asset-actions";
import { useAssistantPromptReceiver, useAssistantWorkspaceContext } from "@/app/features/creation-assistant/use-assistant-prompt";
import type { ImageWorkflowCase } from "@/lib/image-workflow-cases";
import { appendProjectId } from "@/lib/project-workflows";

type Props = {
  title: string;
  description: string;
  submitUrl: string;
  scenes: readonly string[];
  styles: readonly string[];
  sourceTitle: string;
  sourceHint: string;
  submitLabel: string;
  pointsPerTask?: number;
  outputCount?: number;
  showAspectRatio?: boolean;
  defaultRatio?: string;
  sceneLabel?: string;
  styleLabel?: string;
  nextStepHref?: string;
  nextStepLabel?: string;
  requireSource?: boolean;
  cases?: readonly ImageWorkflowCase[];
  productDescriptionLabel?: string;
  productDescriptionPlaceholder?: string;
};

type Account = { user: { isAdministrator?: boolean }; wallet: { availablePoints: number } };
type TaskResult = GeneratedTaskResult;
type Asset = { id: string; mimeType: string; byteSize: number; originalName: string; url: string; kind: string };
type Phase = "idle" | "uploading" | "generating" | "succeeded" | "failed";

const ratios = ["1:1", "3:4", "4:3", "9:16"];

export function ImageWorkflowPage({
  title,
  description,
  submitUrl,
  scenes,
  styles,
  sourceTitle,
  sourceHint,
  submitLabel,
  pointsPerTask = 10,
  outputCount = 4,
  showAspectRatio = true,
  defaultRatio = "1:1",
  sceneLabel = "使用场景",
  styleLabel = "视觉风格",
  nextStepHref,
  nextStepLabel,
  requireSource = true,
  cases = [],
  productDescriptionLabel,
  productDescriptionPlaceholder = "填写商品名称、材质、卖点、适用场景等信息",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || "";
  const [account, setAccount] = useState<Account | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [preview, setPreview] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [ratio, setRatio] = useState(defaultRatio);
  const [scene, setScene] = useState(scenes[0]);
  const [style, setStyle] = useState(styles[0]);
  const [prompt, setPrompt] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [appliedCaseId, setAppliedCaseId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [task, setTask] = useState<TaskResult | null>(null);
  const markSaved = (assetId: string) => setTask((current) => current ? { ...current, outputs: current.outputs.map((output) => output.assetId === assetId ? { ...output, savedToLibrary: true, expiresAt: null } : output) } : current);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presetScene = params.get("scene");
    const presetStyle = params.get("style");
    const presetPrompt = params.get("prompt");
    if (presetScene && scenes.includes(presetScene)) setScene(presetScene);
    if (presetStyle && styles.includes(presetStyle)) setStyle(presetStyle);
    if (presetPrompt) setPrompt(presetPrompt.slice(0, 1200));
  }, [scenes, styles]);

  useEffect(() => () => {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("assetId");
    if (!account || !id || selectedAsset || file) return;
    fetch("/api/assets/?kind=ALL", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        const asset = (body.assets || []).find((item: Asset) => item.id === id && item.mimeType.startsWith("image/"));
        if (asset) {
          setSelectedAsset(asset);
          setPreview(asset.url);
        }
      })
      .catch(() => undefined);
  }, [account, file, selectedAsset]);

  const request = async (url: string, init: RequestInit) => {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || "请求失败");
    return body;
  };

  const resetTask = () => {
    setError("");
    setTask(null);
    setPhase("idle");
  };
  useAssistantPromptReceiver({ setPrompt, setProductDescription, onApplied: resetTask });
  useAssistantWorkspaceContext(useMemo(() => ({
    images: preview ? [{ url: preview, name: file?.name || selectedAsset?.originalName || "商品图", role: "product" as const }] : [],
    productText: productDescription || prompt,
  }), [file?.name, preview, productDescription, prompt, selectedAsset?.originalName]));

  const applyCase = (item: ImageWorkflowCase) => {
    if (item.ratio && ratios.includes(item.ratio)) setRatio(item.ratio);
    if (item.scene && scenes.includes(item.scene)) setScene(item.scene);
    if (item.style && styles.includes(item.style)) setStyle(item.style);
    setPrompt(item.prompt.slice(0, 1200));
    if (item.productDescription) setProductDescription(item.productDescription.slice(0, 900));
    setAppliedCaseId(item.id);
    resetTask();
  };

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) return setError("仅支持 JPG、PNG、WebP 图片");
    if (nextFile.size > 10 * 1024 * 1024) return setError("图片不能超过 10MB");
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setSelectedAsset(null);
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    resetTask();
  };

  const openLibrary = async () => {
    setLibraryOpen(true);
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
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(null);
    setSelectedAsset(asset);
    setPreview(asset.url);
    setLibraryOpen(false);
    resetTask();
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
    if ((requireSource && !file && !selectedAsset) || (!requireSource && !prompt.trim()) || ["uploading", "generating"].includes(phase)) return;
    setError("");
    setTask(null);
    setPhase("uploading");
    try {
      let assetId = selectedAsset?.id;
      if (file) {
        const presign = await request("/api/uploads/presign/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }),
        });
        const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!upload.ok) throw new Error(`素材上传失败 (${upload.status})`);
        await request("/api/uploads/confirm/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: presign.assetId }),
        });
        assetId = presign.assetId;
      }
      const composedPrompt = [
        productDescription.trim() ? `商品描述：${productDescription.trim()}` : "",
        prompt.trim() ? `提示词：${prompt.trim()}` : "",
      ].filter(Boolean).join("\n");
      const created = await request(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ assetId, prompt: composedPrompt || prompt, productDescription, aspectRatio: ratio, scene, style, draftId: projectId }),
      });
      setPhase("generating");
      await pollTask(created.taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
      setPhase("failed");
    }
  };

  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  const busy = phase === "uploading" || phase === "generating";

  if (cases.length > 0) {
    const canSubmit = !((requireSource && !file && !selectedAsset) || (!requireSource && !prompt.trim()) || busy || (!account.user.isAdministrator && account.wallet.availablePoints < pointsPerTask));
    const missing = requireSource && !file && !selectedAsset ? sourceTitle : !prompt.trim() ? "提示词" : "";
    const creditText = account.user.isAdministrator ? `管理员免积分 · 报价 ${pointsPerTask} 积分计入成本审计` : `预估积分：${pointsPerTask}${missing ? ` · 待填写：${missing}` : ""}`;
    return <main className="yh-image-page">
      <button className="yh-back-button" type="button" onClick={() => router.push("/tools")}><ArrowLeft size={16} />返回图片创作</button>
      <div className="yh-image-layout">
        <form className="yh-image-form-card" onSubmit={submit}>
          <header><ImagePlus size={18} /><strong>{title}</strong></header>
          {requireSource && <section className="yh-reference-upload">
            <label className="yh-field">{sourceTitle} <em>*</em><small className="yh-inline-help">{sourceHint}</small></label>
            {!preview ? <>
              <div className="yh-upload-tabs">
                <span className="active"><Upload size={14} />本地上传</span>
                <button type="button" onClick={openLibrary}><FolderOpen size={14} />资产库</button>
              </div>
              <label className="yh-upload-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /><span><Upload size={24} /></span><strong>{sourceTitle}</strong><small>{sourceHint}</small></label>
            </> : <div className="yh-reference-list large"><article><img src={preview} alt="待生成商品素材" /><button type="button" aria-label="移除图片" onClick={() => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); setFile(null); setSelectedAsset(null); setPreview(""); resetTask(); }}><X size={13} /></button></article></div>}
          </section>}
          {productDescriptionLabel && <label className="yh-field wide">{productDescriptionLabel}<textarea value={productDescription} onChange={(event) => setProductDescription(event.target.value)} maxLength={900} placeholder={productDescriptionPlaceholder} /><small>{productDescription.length}/900</small></label>}
          {showAspectRatio && <label className="yh-field">图片比例 <em>*</em><select value={ratio} onChange={(event) => setRatio(event.target.value)}>{ratios.map((item) => <option key={item}>{item}</option>)}</select></label>}
          <div className="yh-field-grid">
            <label className="yh-field">{sceneLabel}<select value={scene} onChange={(event) => setScene(event.target.value)}>{scenes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="yh-field">{styleLabel}<select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label className="yh-field wide">提示词 <em>*</em><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder={requireSource ? "例如：商品放在窗边桌面，保留自然投影与留白" : "请输入图像描述，例如：清新自然的电商带货模特，真实摄影质感"} /><small>{prompt.length}/1200</small></label>
          <p className="yh-credit"><Sparkles size={15} />{creditText}</p>
          {error && <p className="creator-error" role="alert">{error}</p>}
          <TemporaryResultNotice result={task} />
          <div className="yh-actions"><button type="submit" disabled={!canSubmit}><Wand2 size={16} />{busy ? "任务处理中" : submitLabel}</button><button type="button" onClick={() => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); setFile(null); setSelectedAsset(null); setPreview(""); setRatio(defaultRatio); setScene(scenes[0]); setStyle(styles[0]); setPrompt(""); setProductDescription(""); setAppliedCaseId(""); resetTask(); }}>重置</button></div>
        </form>

        <section className="yh-case-board">
          <header><span><Sparkles size={17} /></span><div><h1>案例参考</h1><p>选择案例可一键回填入参</p></div></header>
          {busy && <GenerationProgress phase={phase} taskStatus={task?.status} title={title} outputCount={outputCount} />}
          {phase === "succeeded" && task?.outputs.length ? <div className="yh-result-grid">{task.outputs.map((output, index) => <article key={output.assetId}><img src={output.url} alt={`${title}结果 ${index + 1}`} /><GeneratedAssetActions output={output} onSaved={markSaved} />{nextStepHref && <button type="button" className="result-next" onClick={() => router.push(appendProjectId(`${nextStepHref}?assetId=${output.assetId}`, projectId))}>{nextStepLabel || "继续创作"}</button>}</article>)}</div> : phase === "succeeded" && task?.expiredOutputCount ? null : <div className="yh-case-grid">{cases.map((item) => <article className={appliedCaseId === item.id ? "active" : ""} key={item.id}><div className="yh-case-media"><img src={item.image} alt={item.title} /><span><ImagePlus size={12} />{item.tag}</span></div><strong>{item.title}</strong><button type="button" onClick={() => applyCase(item)}><Wand2 size={15} />做同款</button></article>)}</div>}
        </section>
      </div>
      {libraryOpen && <div className="asset-picker-backdrop" role="dialog" aria-modal="true" aria-label="选择图片素材"><section className="asset-picker-modal"><header><div><span>内容资产</span><h2>选择图片素材</h2></div><button type="button" className="icon-button" onClick={() => setLibraryOpen(false)}><X size={18} /></button></header>{assetsLoading ? <div className="asset-picker-empty"><LoaderCircle size={22} />正在加载素材</div> : assets.length ? <div className="asset-picker-grid">{assets.map((asset) => <button type="button" key={asset.id} onClick={() => selectAsset(asset)}><img src={asset.url} alt="" /><strong>{asset.originalName}</strong><small>{asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</small></button>)}</div> : <div className="asset-picker-empty"><FolderOpen size={25} /><strong>暂无图片素材</strong><p>用户上传素材会长期保留；生成结果需要手动添加到素材库后才会显示。</p></div>}</section></div>}
    </main>;
  }

  return <main className="creator-shell">
    <header className="creator-header">
      <button className="icon-button" aria-label="返回工作台" onClick={() => router.push("/workspace")}><ArrowLeft size={19} /></button>
      <div><strong>{title}</strong><span>芭乐AIGC</span></div>
      <div className="creator-points"><Sparkles size={15} />{account.user.isAdministrator ? "管理员免积分" : `${account.wallet.availablePoints} 积分`}</div>
    </header>
    <form className={cases.length ? "creator-layout inspiration-workflow-layout" : "creator-layout"} onSubmit={submit}>
      <section className="upload-stage">
        {!preview ? <div className="image-source-choice">
          {!requireSource && <div className="text-image-empty"><span><Wand2 size={30} /></span><strong>输入提示词即可生成</strong><small>也可以从右侧案例选择“做同款”快速回填创作方向</small></div>}
          {requireSource && <>
          <label className="upload-drop"><span><ImagePlus size={28} /></span><strong>{sourceTitle}</strong><small>{sourceHint}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>
          <button type="button" className="image-library-button" onClick={openLibrary}><FolderOpen size={17} />从内容资产选择</button>
          </>}
        </div> : <div className="source-preview">
          <img src={preview} alt="待生成商品素材" />
          <div className="source-preview-actions">{selectedAsset && <span>已引用资产素材</span>}<button type="button" className="icon-button" aria-label="移除图片" onClick={() => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); setFile(null); setSelectedAsset(null); setPreview(""); resetTask(); }}><X size={18} /></button></div>
        </div>}
        {busy && <GenerationProgress phase={phase} taskStatus={task?.status} title={title} outputCount={outputCount} />}
        {phase === "succeeded" && task?.outputs.length ? <div className="result-grid">{task.outputs.map((output, index) => <article key={output.assetId}><img src={output.url} alt={`${title}结果 ${index + 1}`} /><GeneratedAssetActions output={output} onSaved={markSaved} />{nextStepHref && <button type="button" className="result-next" onClick={() => router.push(appendProjectId(`${nextStepHref}?assetId=${output.assetId}`, projectId))}>{nextStepLabel || "继续创作"}</button>}</article>)}</div> : null}
      </section>
      <aside className="creator-panel">
        <div className="panel-title"><span><Sparkles size={18} /></span><div><h1>生成设置</h1><p>{account.user.isAdministrator ? `管理员免积分 · 报价 ${pointsPerTask} 积分计入成本审计` : description}</p></div></div>
        {showAspectRatio && <><label className="field-label">画幅比例</label><div className="ratio-control">{ratios.map((item) => <button type="button" key={item} className={ratio === item ? "active" : ""} onClick={() => setRatio(item)}>{item}</button>)}</div></>}
        <label className="field-label">{sceneLabel}<select value={scene} onChange={(event) => setScene(event.target.value)}>{scenes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field-label">{styleLabel}<select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label>
        {productDescriptionLabel && <label className="field-label">{productDescriptionLabel}<textarea value={productDescription} onChange={(event) => setProductDescription(event.target.value)} maxLength={900} placeholder={productDescriptionPlaceholder} /><small>{productDescription.length}/900</small></label>}
        <label className="field-label">{requireSource ? "提示词" : "提示词"}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder={requireSource ? "例如：商品放在窗边桌面，保留自然投影与留白" : "请输入图像描述，例如：一只可爱的橘猫在阳光下打盹，温暖真实摄影"} /><small>{prompt.length}/1200</small></label>
        {error && <p className="creator-error" role="alert">{error}</p>}
        <TemporaryResultNotice result={task} />
        <button className="generate-button" type="submit" disabled={(requireSource && !file && !selectedAsset) || (!requireSource && !prompt.trim()) || busy || (!account.user.isAdministrator && account.wallet.availablePoints < pointsPerTask)}><Upload size={18} />{busy ? "任务处理中" : !account.user.isAdministrator && account.wallet.availablePoints < pointsPerTask ? "积分不足" : submitLabel}</button>
      </aside>
      {cases.length > 0 && <aside className="case-reference-panel">
        <header><div><h2>案例参考</h2><p>选择案例可一键回填入参</p></div></header>
        <div className="case-reference-grid">
          {cases.map((item) => <article className={appliedCaseId === item.id ? "active" : ""} key={item.id}>
            <img src={item.image} alt={item.title} />
            <div><span>{item.tag}</span><strong>{item.title}</strong>{item.productDescription && <p>{item.productDescription}</p>}<button type="button" onClick={() => applyCase(item)}><Wand2 size={14} />做同款</button></div>
          </article>)}
        </div>
      </aside>}
    </form>
    {libraryOpen && <div className="asset-picker-backdrop" role="dialog" aria-modal="true" aria-label="选择图片素材"><section className="asset-picker-modal"><header><div><span>内容资产</span><h2>选择图片素材</h2></div><button type="button" className="icon-button" onClick={() => setLibraryOpen(false)}><X size={18} /></button></header>{assetsLoading ? <div className="asset-picker-empty"><LoaderCircle size={22} />正在加载素材</div> : assets.length ? <div className="asset-picker-grid">{assets.map((asset) => <button type="button" key={asset.id} onClick={() => selectAsset(asset)}><img src={asset.url} alt="" /><strong>{asset.originalName}</strong><small>{asset.kind === "OUTPUT" ? "生成结果" : "上传素材"}</small></button>)}</div> : <div className="asset-picker-empty"><FolderOpen size={25} /><strong>暂无图片素材</strong><p>用户上传素材会长期保留；生成结果需要手动添加到素材库后才会显示。</p></div>}</section></div>}
  </main>;
}
