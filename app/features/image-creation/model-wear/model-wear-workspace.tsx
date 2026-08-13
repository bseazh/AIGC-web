"use client";

import { ArrowLeft, ImageIcon, ImagePlus, RotateCcw, Sparkles, Upload, Wand2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { GenerationProgress } from "@/app/components/generation-progress";
import { GeneratedAssetActions, TemporaryResultNotice, restoredTaskPhase, watchProjectTaskResult, type GeneratedTaskResult } from "@/app/components/generated-asset-actions";
import { ImageOutputCountControl, type ImageOutputCount } from "@/app/features/image-creation/shared/image-output-count-control";
import { ImageAspectRatioControl } from "@/app/features/image-creation/shared/image-aspect-ratio-control";
import { ImageCaseDetailDialog } from "@/app/features/image-creation/shared/image-case-detail-dialog";
import { imageRequest, pollImageTask, uploadImageFile } from "@/app/features/image-creation/shared/image-task-api";
import { useAssistantPromptReceiver, useAssistantWorkspaceContext } from "@/app/features/creation-assistant/use-assistant-prompt";
import { buildCaseRecreationPrompt, modelWearCases } from "@/lib/image-workflow-cases";

type Account = { user: { isAdministrator?: boolean }; wallet: { availablePoints: number } };
type Uploaded = { file?: File; assetId?: string; preview: string; name?: string };
type TaskResult = GeneratedTaskResult;
const ratios = ["1:1", "3:4", "4:3", "9:16"];

export function ModelWearWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId") || "";
  const [account, setAccount] = useState<Account | null>(null);
  const [model, setModel] = useState<Uploaded | null>(null);
  const [products, setProducts] = useState<Uploaded[]>([]);
  const [ratio, setRatio] = useState("1:1");
  const [prompt, setPrompt] = useState("");
  const [outputCount, setOutputCount] = useState<ImageOutputCount>(1);
  const [appliedCaseId, setAppliedCaseId] = useState("");
  const [selectedCase, setSelectedCase] = useState<(typeof modelWearCases)[number] | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [error, setError] = useState("");
  const [task, setTask] = useState<TaskResult | null>(null);
  const [seriesContext, setSeriesContext] = useState<{ visualBible?: string; seriesPlan?: unknown[] }>({});
  const [caseRecreationPrompt, setCaseRecreationPrompt] = useState("");
  const markSaved = (assetId: string) => setTask((current) => current ? { ...current, outputs: current.outputs.map((output) => output.assetId === assetId ? { ...output, savedToLibrary: true, expiresAt: null } : output) } : current);

  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setAccount(await response.json()); }).catch(() => router.replace("/")); }, [router]);
  useEffect(() => watchProjectTaskResult(projectId, (restored) => { setTask(restored); setPhase(restoredTaskPhase(restored)); }), [projectId]);
  useEffect(() => () => {
    if (model?.preview.startsWith("blob:")) URL.revokeObjectURL(model.preview);
    products.forEach((item) => { if (item.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview); });
  // Object URLs must remain valid while their current previews are rendered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const valid = (file: File) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024;
  const setModelFile = (file?: File) => { if (!file) return; if (!valid(file)) return setError("仅支持不超过 10MB 的 JPG、PNG、WebP 图片"); if (model) URL.revokeObjectURL(model.preview); setModel({ file, preview: URL.createObjectURL(file) }); setError(""); };
  const addProducts = (files?: FileList | null) => { if (!files) return; const next = [...files].filter(valid).slice(0, Math.max(0, 4 - products.length)).map((file) => ({ file, preview: URL.createObjectURL(file) })); if (!next.length) return setError("请选择不超过 10MB 的 JPG、PNG、WebP 图片"); setProducts((current) => [...current, ...next]); setError(""); };
  const applyCase = (item: (typeof modelWearCases)[number]) => { if (item.ratio && ratios.includes(item.ratio)) setRatio(item.ratio); setCaseRecreationPrompt(buildCaseRecreationPrompt(item, outputCount)); setPrompt(item.prompt.slice(0, 1200)); setAppliedCaseId(item.id); setError(""); setTask(null); setPhase("idle"); };
  const resetForm = () => { if (model?.preview.startsWith("blob:")) URL.revokeObjectURL(model.preview); products.forEach((item) => { if (item.preview.startsWith("blob:")) URL.revokeObjectURL(item.preview); }); setModel(null); setProducts([]); setRatio("1:1"); setPrompt(""); setOutputCount(1); setAppliedCaseId(""); setError(""); setTask(null); setPhase("idle"); };
  useAssistantPromptReceiver({
    setPrompt,
    setReferenceImages: (images) => setProducts((current) => [
      ...images.map((image) => ({ assetId: image.assetId, preview: image.url || "", name: image.name })),
      ...current,
    ].filter((item) => item.preview).filter((item, index, items) => items.findIndex((candidate) => (candidate.assetId && item.assetId ? candidate.assetId === item.assetId : candidate.preview === item.preview)) === index).slice(0, 4)),
    setOutputCount,
    setSeriesTaskContext: ({ visualBible, seriesPlan }) => setSeriesContext({ visualBible, seriesPlan }),
    onApplied: () => { setError(""); setTask(null); setPhase("idle"); },
  });
  useAssistantWorkspaceContext(useMemo(() => ({
    images: products.map((item, index) => ({ url: item.preview, name: `商品图 ${index + 1}`, role: "product" as const })),
    productText: prompt,
  }), [products, prompt]));
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!model || !products.length || phase === "uploading" || phase === "generating") return; setError(""); setTask(null); setPhase("uploading"); try { const resolveAsset = async (item: Uploaded, label: string) => { if (item.assetId) return item.assetId; if (item.file) return uploadImageFile(item.file, label); throw new Error(`${label}缺少可用素材`); }; const [modelAssetId, ...productAssetIds] = await Promise.all([resolveAsset(model, "模特图"), ...products.map((item) => resolveAsset(item, "商品图"))]); const created = await imageRequest<{ taskId: string }>("/api/tasks/model-wear/", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ modelAssetId, productAssetIds, aspectRatio: ratio, prompt, outputCount, caseRecreationPrompt, visualBible: seriesContext.visualBible, seriesPlan: seriesContext.seriesPlan, draftId: projectId }) }); setPhase("generating"); await pollImageTask(created.taskId, setTask); setPhase("succeeded"); setAccount(await fetch("/api/auth/session/", { cache: "no-store" }).then((item) => item.json())); } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败"); setPhase("failed"); } };
  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  const busy = phase === "uploading" || phase === "generating";
  return <main className="creator-shell model-wear-shell"><header className="creator-header"><button className="icon-button" aria-label="返回图片创作" onClick={() => router.push("/tools")}><ArrowLeft size={19} /></button><div><strong>模特穿搭</strong><span>芭乐AIGC</span></div><div className="creator-points"><Sparkles size={15} />{account.user.isAdministrator ? "管理员免积分" : `${account.wallet.availablePoints} 积分`}</div></header>
    <form className="model-wear-workbench" onSubmit={submit}>
      <section className="model-wear-form-card">
        <header><span><ImageIcon size={18} /></span><div><h1>模特穿搭图生成</h1><p>{account.user.isAdministrator ? "管理员免积分 · 报价 10 积分计入成本审计" : "默认生成 1 张，可自定义生成数量"}</p></div></header>
        <div className="model-wear-form-body">
          <section className="model-wear-upload-block">
            <div className="model-wear-field-title"><strong>模特图</strong><em>*</em></div>
            <div className="model-wear-upload-tabs"><span className="active">本地上传</span><span>资产库</span></div>
            {model ? <div className="model-wear-preview model"><img src={model.preview} alt="模特素材" /><button type="button" aria-label="移除模特图" onClick={() => { URL.revokeObjectURL(model.preview); setModel(null); }}><X size={16} /></button></div> : <label className="model-wear-drop model"><Upload size={24} /><strong>模特图</strong><small>上传模特正面图片<br />已上传 0/1 个</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setModelFile(event.target.files?.[0])} /></label>}
          </section>
          <section className="model-wear-upload-block">
            <div className="model-wear-field-title"><strong>商品图（多颜色）</strong><em>*</em></div>
            <div className="model-wear-upload-tabs"><span className="active">本地上传</span><span>资产库</span></div>
            <div className="model-wear-product-list">{products.map((item, index) => <div className="model-wear-preview" key={item.preview}><img src={item.preview} alt={`商品素材 ${index + 1}`} /><button type="button" aria-label="移除商品图" onClick={() => setProducts((current) => { URL.revokeObjectURL(item.preview); return current.filter((entry) => entry.preview !== item.preview); })}><X size={15} /></button></div>)}{products.length < 4 && <label className="model-wear-drop product"><ImagePlus size={22} /><strong>商品图（多颜色）</strong><small>上传不同颜色的商品图片<br />已上传 {products.length}/4 个</small><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => addProducts(event.target.files)} /></label>}</div>
          </section>
          <ImageAspectRatioControl value={ratio} options={ratios} onChange={setRatio} disabled={busy} />
          <label className="model-wear-prompt-field">补充要求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder="例如：保持模特发型，展示全身穿搭效果" /><small>{prompt.length}/1200</small></label>
          <ImageOutputCountControl value={outputCount} onChange={setOutputCount} disabled={busy} />
          <p className="model-wear-credit"><Sparkles size={15} />预估积分：{account.user.isAdministrator ? "待填写：管理员免积分" : "10 积分"}</p>
          {error && <p className="creator-error" role="alert">{error}</p>}<TemporaryResultNotice result={task} />
          <div className="model-wear-actions"><button className="generate-button" type="submit" disabled={!model || !products.length || busy || (!account.user.isAdministrator && account.wallet.availablePoints < 10)}><Upload size={18} />{busy ? "任务处理中" : !account.user.isAdministrator && account.wallet.availablePoints < 10 ? "积分不足" : "提交生成任务"}</button><button className="model-wear-reset" type="button" onClick={resetForm} disabled={busy}><RotateCcw size={16} />重置</button></div>
          {busy && <GenerationProgress phase={phase} taskStatus={task?.status} title="模特穿搭图" outputCount={outputCount} />}{phase === "succeeded" && task?.outputs.length ? <div className="result-grid model-wear-results">{task.outputs.map((output, index) => <article key={output.assetId}><img src={output.url} alt={`模特穿搭结果 ${index + 1}`} /><GeneratedAssetActions output={output} onSaved={markSaved} /></article>)}</div> : null}
        </div>
      </section>
      <aside className="model-wear-case-board">
        <header><span><Sparkles size={17} /></span><div><h2>案例参考</h2><p>选择案例可一键回填入参</p></div></header>
        <div className="model-wear-case-grid">
          {modelWearCases.map((item) => <article className={appliedCaseId === item.id ? "active" : ""} key={item.id}>
            <button className="model-wear-case-media" type="button" aria-label={`查看${item.title}作品详情`} onClick={() => setSelectedCase(item)}><img src={item.image} alt={item.title} /><span><ImageIcon size={12} />图片案例</span></button>
            <div><strong>{item.title}</strong>{item.productDescription && <p>{item.productDescription}</p>}</div>
            <button type="button" onClick={() => setSelectedCase(item)}><Wand2 size={14} />做同款</button>
          </article>)}
        </div>
      </aside>
    </form>{selectedCase && <ImageCaseDetailDialog item={selectedCase} workflowKey="model-wear" workflowLabel="模特穿搭图" onApply={applyCase} onClose={() => setSelectedCase(null)} />}</main>;
}
