"use client";

import {
  ArrowLeft,
  Check,
  Clipboard,
  FileText,
  LoaderCircle,
  MicVocal,
  RefreshCw,
  Save,
  Sparkles,
  Video,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
type Draft = {
  productName: string;
  sellingPoints: string;
  audience: string;
  usageScene: string;
  callToAction: string;
  tone: string;
  duration: number;
  result: ScriptResult | null;
};
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

const draftStorageKey = "aigc-model-spokesperson-script-draft";
const spokespersonCases: SpokespersonCase[] = [
  {
    id: "healthy-breakfast",
    title: "轻食早餐机口播脚本",
    tag: "文案案例",
    image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=86",
    description: "通勤人群、快手早餐、自然亲和口吻。",
    productName: "轻氧多功能早餐机",
    sellingPoints: "三分钟快速加热\n煎烤蒸一体，小厨房也能放\n不粘涂层，清洗省心\n适合上班族快速准备早餐",
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
    sellingPoints: "质地清爽不黏腻\n适合换季干燥和屏障脆弱期\n按压泵设计更卫生\n妆前使用也不搓泥",
    audience: "关注维稳修护的护肤用户",
    usageScene: "晚间护肤、换季维稳、妆前打底",
    callToAction: "需要维稳修护的朋友可以先从这一瓶开始",
    tone: "professional",
    duration: 30,
  },
  {
    id: "travel-bag",
    title: "通勤包带货口播脚本",
    tag: "文案案例",
    image: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=86",
    description: "箱包容量、穿搭场景、热情带货口吻。",
    productName: "大容量通勤托特包",
    sellingPoints: "可以放下电脑、雨伞和化妆包\n皮革纹理细腻，版型挺括\n通勤、出差、周末逛街都能背\n肩带宽，不容易勒肩",
    audience: "都市通勤女性、轻商务人群",
    usageScene: "上班通勤、短途出差、周末约会",
    callToAction: "喜欢实用又有质感的包，可以直接入手",
    tone: "enthusiastic",
    duration: 15,
  },
];

export function ModelSpokespersonScriptPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [productName, setProductName] = useState("");
  const [sellingPoints, setSellingPoints] = useState("");
  const [audience, setAudience] = useState("");
  const [usageScene, setUsageScene] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [tone, setTone] = useState("natural");
  const [duration, setDuration] = useState(15);
  const [variant, setVariant] = useState(0);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    const stored = localStorage.getItem(draftStorageKey);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as Partial<Draft>;
      setProductName(draft.productName || "");
      setSellingPoints(draft.sellingPoints || "");
      setAudience(draft.audience || "");
      setUsageScene(draft.usageScene || "");
      setCallToAction(draft.callToAction || "");
      if (["natural", "enthusiastic", "professional"].includes(draft.tone || ""))
        setTone(draft.tone!);
      if ([15, 30, 60].includes(Number(draft.duration)))
        setDuration(Number(draft.duration));
      if (draft.result?.segments?.length) setResult(draft.result);
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, []);

  const fullScript = useMemo(
    () => result?.segments.map((segment) => segment.narration).join("\n") || "",
    [result],
  );
  const characterCount = fullScript.replace(/\s/g, "").length;

  const draftValue = (): Draft => ({
    productName,
    sellingPoints,
    audience,
    usageScene,
    callToAction,
    tone,
    duration,
    result,
  });

  const saveDraft = () => {
    localStorage.setItem(draftStorageKey, JSON.stringify(draftValue()));
    setNotice("文案草稿已保存在当前浏览器");
    window.setTimeout(() => setNotice(""), 2400);
  };

  const generate = async (event?: FormEvent, nextVariant = variant) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        "/api/workflows/model-spokesperson-script/",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName,
            sellingPoints,
            audience,
            usageScene,
            callToAction,
            tone,
            duration,
            variant: nextVariant,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY")
        throw new Error(body?.message || "口播文案生成失败");
      const nextResult: ScriptResult = {
        status: body.status,
        draftId: body.draftId,
        title: body.title,
        durationSeconds: body.durationSeconds,
        tone: body.tone,
        segments: body.segments,
        alternativeOpeners: body.alternativeOpeners || [],
        generatedAt: body.generatedAt,
      };
      setResult(nextResult);
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({ ...draftValue(), result: nextResult }),
      );
      setNotice("口播文案已生成，可逐段修改");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "口播文案生成失败");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => {
    const next = variant + 1;
    setVariant(next);
    void generate(undefined, next);
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
              index === 0
                ? { ...segment, narration: `${opener}——${productName}。` }
                : segment,
            ),
          }
        : current,
    );

  const applyCase = (item: SpokespersonCase) => {
    setProductName(item.productName);
    setSellingPoints(item.sellingPoints);
    setAudience(item.audience);
    setUsageScene(item.usageScene);
    setCallToAction(item.callToAction);
    if (["natural", "enthusiastic", "professional"].includes(item.tone))
      setTone(item.tone);
    if ([15, 30, 60].includes(item.duration)) setDuration(item.duration);
    setResult(null);
    setError("");
    setNotice("案例参数已回填");
    window.setTimeout(() => setNotice(""), 1800);
  };

  const copyScript = async () => {
    if (!fullScript) return;
    await navigator.clipboard.writeText(fullScript);
    setNotice("完整口播文案已复制");
    window.setTimeout(() => setNotice(""), 2000);
  };

  if (!account)
    return (
      <main className="workspace-loading">
        <Sparkles size={22} />
        <p>正在载入口播文案工作台</p>
      </main>
    );

  return (
    <main className="spokesperson-script-page">
      <header className="spokesperson-script-header">
        <button
          type="button"
          aria-label="返回视频创作中心"
          onClick={() => router.push("/create/product-video")}
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <span>阶段 1 / 2 · 文案工作台</span>
          <strong>AI 模特口播</strong>
        </div>
        <em>
          <FileText size={15} />
          文案生成暂不扣积分
        </em>
      </header>

      <form className="spokesperson-script-layout" onSubmit={generate}>
        <section className="spokesperson-script-form">
          <div className="spokesperson-script-intro">
            <span>
              <MicVocal size={18} />
              SPOKESPERSON SCRIPT
            </span>
            <h1>先把口播文案说清楚，再生成视频</h1>
            <p>
              输入商品信息，系统会按时长拆分开场、卖点、场景和行动引导。生成后可以逐段修改并保存草稿。
            </p>
          </div>

          <div className="spokesperson-field-grid">
            <label>
              商品名称 <em>*</em>
              <input
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                maxLength={80}
                placeholder="例如：轻氧便携榨汁杯"
              />
            </label>
            <label>
              目标人群
              <input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                maxLength={120}
                placeholder="例如：通勤上班族、健身人群"
              />
            </label>
          </div>
          <label className="spokesperson-wide-field">
            核心卖点 <em>*</em>
            <textarea
              value={sellingPoints}
              onChange={(event) => setSellingPoints(event.target.value)}
              maxLength={800}
              placeholder={"每行填写一个卖点，例如：\n轻巧便携\n充电一次可使用多次\n杯体容易清洗"}
            />
            <small>{sellingPoints.length}/800</small>
          </label>
          <div className="spokesperson-field-grid">
            <label>
              使用场景
              <input
                value={usageScene}
                onChange={(event) => setUsageScene(event.target.value)}
                maxLength={120}
                placeholder="例如：办公室、健身后、户外旅行"
              />
            </label>
            <label>
              行动引导
              <input
                value={callToAction}
                onChange={(event) => setCallToAction(event.target.value)}
                maxLength={100}
                placeholder="例如：点击了解更多"
              />
            </label>
          </div>

          <div className="spokesperson-options">
            <div>
              <span>口播语气</span>
              <nav>
                {[
                  ["natural", "自然亲和"],
                  ["enthusiastic", "热情带货"],
                  ["professional", "专业讲解"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    className={tone === value ? "active" : ""}
                    key={value}
                    onClick={() => setTone(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
            <div>
              <span>目标时长</span>
              <nav>
                {[15, 30, 60].map((seconds) => (
                  <button
                    type="button"
                    className={duration === seconds ? "active" : ""}
                    key={seconds}
                    onClick={() => setDuration(seconds)}
                  >
                    {seconds} 秒
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {error && (
            <p className="creator-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="spokesperson-generate"
            type="submit"
            disabled={!productName.trim() || !sellingPoints.trim() || busy}
          >
            {busy ? (
              <LoaderCircle className="generation-spinner" size={18} />
            ) : (
              <WandSparkles size={18} />
            )}
            {busy ? "正在组织口播文案" : "生成口播文案"}
          </button>
        </section>

        <aside className="spokesperson-case-board">
          <header>
            <span>
              <Sparkles size={17} />
            </span>
            <div>
              <h1>案例参考</h1>
              <p>选择案例可一键回填文案入参</p>
            </div>
          </header>
          <div className="spokesperson-case-grid">
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

        <section className="spokesperson-script-result">
          <header>
            <div>
              <span>口播文案预览</span>
              <h2>{result?.title || "等待生成文案"}</h2>
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

          {notice && (
            <p className="spokesperson-notice">
              <Check size={15} />
              {notice}
            </p>
          )}

          {!result ? (
            <div className="spokesperson-result-empty">
              <MicVocal size={34} />
              <strong>这里将显示分镜口播稿</strong>
              <p>文案会按照视频时间轴拆分，并提供对应画面建议。</p>
            </div>
          ) : (
            <>
              <div className="spokesperson-script-meta">
                <span>{result.durationSeconds} 秒</span>
                <span>{result.tone}</span>
                <span>{result.segments.length} 个分镜</span>
                <span>{characterCount} 字</span>
              </div>
              <div className="spokesperson-segments">
                {result.segments.map((segment, index) => (
                  <article key={segment.id}>
                    <span>{index + 1}</span>
                    <header>
                      <strong>{segment.stage}</strong>
                      <em>{segment.timeRange}</em>
                    </header>
                    <textarea
                      value={segment.narration}
                      onChange={(event) =>
                        updateSegment(segment.id, event.target.value)
                      }
                      maxLength={500}
                    />
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
                    <button
                      type="button"
                      key={opener}
                      onClick={() => useOpener(opener)}
                    >
                      {opener}
                    </button>
                  ))}
                </div>
              )}
              <div className="spokesperson-result-actions">
                <button type="button" onClick={regenerate} disabled={busy}>
                  <RefreshCw size={15} />
                  换一版文案
                </button>
                <button type="button" disabled title="将在第二阶段开放">
                  <Video size={15} />
                  使用文案生成口播视频 · 下一阶段
                </button>
              </div>
            </>
          )}
          <footer>
            文案生成仅作为创作辅助。发布前请核对商品信息，避免绝对化、虚假或未经证实的宣传表述。
          </footer>
        </section>
      </form>
    </main>
  );
}
