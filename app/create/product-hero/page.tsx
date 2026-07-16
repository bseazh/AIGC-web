"use client";

import { ArrowLeft, Check, Download, ImagePlus, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type Account = { wallet: { availablePoints: number } };
type TaskResult = { taskId: string; status: string; outputs: Array<{ assetId: string; url: string }>; errorCode?: string };

const ratios = ["1:1", "3:4", "4:3", "9:16"];
const scenes = ["纯色棚拍", "简约家居", "自然户外", "办公通勤", "节日礼赠"];
const styles = ["真实摄影", "清透商业", "低饱和高级", "明快促销"];

export default function ProductHeroPage() {
  const router = useRouter();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [account, setAccount] = useState<Account | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [ratio, setRatio] = useState("1:1");
  const [scene, setScene] = useState(scenes[0]);
  const [style, setStyle] = useState(styles[0]);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "generating" | "succeeded" | "failed">("idle");
  const [error, setError] = useState("");
  const [task, setTask] = useState<TaskResult | null>(null);

  useEffect(() => {
    fetch(`${basePath}/api/auth/session/`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [basePath, router]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(nextFile.type)) {
      setError("仅支持 JPG、PNG、WebP 图片");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10MB");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
    setError("");
    setTask(null);
    setPhase("idle");
  };

  const jsonRequest = async (url: string, init: RequestInit) => {
    const response = await fetch(`${basePath}${url}`, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || "请求失败");
    return body;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || phase === "uploading" || phase === "generating") return;
    setError("");
    setPhase("uploading");
    try {
      const presign = await jsonRequest("/api/uploads/presign/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }),
      });
      const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!upload.ok) throw new Error(`素材上传失败 (${upload.status})`);
      await jsonRequest("/api/uploads/confirm/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: presign.assetId }),
      });
      const created = await jsonRequest("/api/tasks/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ assetId: presign.assetId, prompt, aspectRatio: ratio, scene, style }),
      });
      setPhase("generating");
      await pollTask(created.taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
      setPhase("failed");
    }
  };

  const pollTask = async (taskId: string) => {
    const deadline = Date.now() + 6 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await fetch(`${basePath}/api/tasks/${taskId}/`, { cache: "no-store" });
      const current = await response.json();
      if (!response.ok) throw new Error(current.message || "任务查询失败");
      setTask(current);
      if (current.status === "SUCCEEDED") {
        setPhase("succeeded");
        const session = await fetch(`${basePath}/api/auth/session/`, { cache: "no-store" }).then((item) => item.json());
        setAccount(session);
        return;
      }
      if (["FAILED", "REJECTED", "CANCELED"].includes(current.status)) {
        throw new Error(current.errorCode || "生成失败，积分已退回");
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("任务等待超时，请稍后在任务中心查看");
  };

  if (!account) return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;

  const busy = phase === "uploading" || phase === "generating";
  return (
    <main className="creator-shell">
      <header className="creator-header">
        <button className="icon-button" aria-label="返回工作台" onClick={() => router.push("/workspace")}><ArrowLeft size={19} /></button>
        <div><strong>商品主图</strong><span>芭乐AIGC</span></div>
        <div className="creator-points"><Sparkles size={15} />{account.wallet.availablePoints} 积分</div>
      </header>

      <form className="creator-layout" onSubmit={submit}>
        <section className="upload-stage">
          {!preview ? (
            <label className="upload-drop">
              <span><ImagePlus size={28} /></span><strong>上传商品图片</strong><small>JPG、PNG、WebP，最大 10MB</small>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
            </label>
          ) : (
            <div className="source-preview"><img src={preview} alt="待生成商品素材" /><button type="button" className="icon-button" aria-label="移除图片" onClick={() => { setFile(null); setPreview(""); }}><X size={18} /></button></div>
          )}
          {busy && <div className="generation-overlay"><LoaderCircle size={30} /><strong>{phase === "uploading" ? "正在上传并校验素材" : "正在生成 4 张商品主图"}</strong><span>任务由服务器异步处理</span></div>}
          {phase === "succeeded" && task && (
            <div className="result-grid">
              {task.outputs.map((output, index) => <article key={output.assetId}><img src={output.url} alt={`商品主图结果 ${index + 1}`} /><a href={output.url} download target="_blank" rel="noreferrer"><Download size={16} />下载</a></article>)}
            </div>
          )}
        </section>

        <aside className="creator-panel">
          <div className="panel-title"><span><Sparkles size={18} /></span><div><h1>生成设置</h1><p>一次生成 4 张，消耗 10 积分</p></div></div>
          <label className="field-label">画幅比例</label>
          <div className="ratio-control">{ratios.map((item) => <button type="button" key={item} className={ratio === item ? "active" : ""} onClick={() => setRatio(item)}>{item}</button>)}</div>
          <label className="field-label">使用场景<select value={scene} onChange={(event) => setScene(event.target.value)}>{scenes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field-label">视觉风格<select value={style} onChange={(event) => setStyle(event.target.value)}>{styles.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field-label">补充要求<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200} placeholder="例如：商品居中偏右，左侧留出文案空间" /><small>{prompt.length}/1200</small></label>
          {error && <p className="creator-error" role="alert">{error}</p>}
          {phase === "succeeded" && <p className="creator-success"><Check size={16} />4 张结果已保存到内容资产</p>}
          <button className="generate-button" type="submit" disabled={!file || busy || account.wallet.availablePoints < 10}><Upload size={18} />{busy ? "任务处理中" : account.wallet.availablePoints < 10 ? "积分不足" : "生成商品主图"}</button>
        </aside>
      </form>
    </main>
  );
}
