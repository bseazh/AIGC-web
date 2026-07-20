"use client";

import {
  ArrowRight,
  Boxes,
  Check,
  ImageIcon,
  Layers3,
  LogIn,
  MessageCircle,
  PackageOpen,
  Shirt,
  Sparkles,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const features: Array<{
  title: string;
  tag: string;
  description: string;
  image: string;
  icon: typeof ImageIcon;
  href?: string;
}> = [
  {
    title: "商品主图",
    tag: "AI 生图",
    description: "聚焦卖点与构图，生成适配电商首屏的商品视觉。",
    image: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=88",
    icon: ImageIcon,
    href: "/create/product-hero",
  },
  {
    title: "模特穿搭",
    tag: "穿搭图",
    description: "保留服装细节，快速获得自然真实的上身效果。",
    image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=88",
    icon: Shirt,
  },
  {
    title: "场景延展",
    tag: "场景图",
    description: "为商品匹配居家、户外和商业棚拍等营销场景。",
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=88",
    icon: WandSparkles,
  },
  {
    title: "详情页套图",
    tag: "商详页",
    description: "围绕商品卖点生成结构统一的详情页视觉素材。",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=88",
    icon: Layers3,
  },
  {
    title: "带货视频",
    tag: "AI 视频",
    description: "从商品素材生成节奏稳定、便于投放的短视频。",
    image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=88",
    icon: Zap,
  },
  {
    title: "高清优化",
    tag: "图像增强",
    description: "修复细节并提升分辨率，满足店铺和投放需求。",
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=88",
    icon: Sparkles,
  },
  {
    title: "内容资产",
    tag: "资产库",
    description: "集中管理输入素材、生成结果与可复用内容。",
    image: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=900&q=88",
    icon: Boxes,
  },
  {
    title: "商品套装",
    tag: "批量创作",
    description: "一次组织多规格、多角度和多渠道商品素材。",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=88",
    icon: PackageOpen,
  },
];

function Brand() {
  return (
    <div className="brand" aria-label="芭乐AIGC">
      <span className="brand-mark"><img src="/brand/bala-aigc-mark.png" alt="" /></span>
      <span>芭乐AIGC</span>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [agreed, setAgreed] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [targetHref, setTargetHref] = useState("/workspace");

  useEffect(() => {
    document.body.style.overflow = loginOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [loginOpen]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/auth/session/`, { cache: "no-store" })
      .then((response) => setAuthenticated(response.ok))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(() => setCodeCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  const enterWorkspace = () => router.push(targetHref);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  const openDestination = (href = "/workspace") => {
    if (authenticated) return router.push(href);
    setTargetHref(href);
    setLoginOpen(true);
  };

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setAuthError("");
    setVerificationCode("");
  };

  const sendEmailCode = async () => {
    if (sendingCode || codeCooldown > 0) return;
    setSendingCode(true);
    setAuthError("");
    try {
      const response = await fetch(`${basePath}/api/auth/email-code/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAuthError(result.message || "验证码发送失败，请稍后再试");
        return;
      }
      setCodeCooldown(result.retryAfter || 60);
    } catch {
      setAuthError("网络连接失败，请稍后再试");
    } finally {
      setSendingCode(false);
    }
  };

  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agreed || submitting) return;
    setSubmitting(true);
    setAuthError("");
    try {
      const response = await fetch(`${basePath}/api/auth/${mode}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, code: mode === "register" ? verificationCode : undefined }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAuthError(result.message || "登录失败，请稍后再试");
        return;
      }
      enterWorkspace();
    } catch {
      setAuthError("网络连接失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="home-shell">
      <div className="hero-media" aria-hidden="true" />
      <div className="hero-overlay" aria-hidden="true" />

      <header className="public-header">
        <Brand />
        <button className="glass-button header-login" onClick={() => openDestination("/workspace")}>
          <LogIn size={17} />{authenticated ? "进入平台" : "登录"}
        </button>
      </header>

      <section className="hero-content">
        <div className="hero-badge"><Sparkles size={16} />商品视觉 · 营销视频 · 内容资产</div>
        <h1>好商品，<br />值得更好的画面</h1>
        <p>芭乐AIGC 面向电商团队，从一张商品素材出发，快速生成主图、模特穿搭、场景图与营销内容。</p>
        <button className="hero-cta" onClick={() => openDestination("/workspace")}>
          开始创作<ArrowRight size={20} />
        </button>
      </section>

      <section className="entry-section" aria-labelledby="entry-heading">
        <div className="entry-heading">
          <div><span>CREATIVE TOOLS</span><h2 id="entry-heading">选择创作任务</h2></div>
          <p>8 项电商视觉能力</p>
        </div>
        <div className="marquee" tabIndex={0}>
          <div className="marquee-track">
            {[...features, ...features].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <button className="feature-card" key={`${feature.title}-${index}`} onClick={() => openDestination(feature.href || "/workspace")}>
                  <img src={feature.image} alt="" />
                  <span className="card-shade" />
                  <span className="card-top"><span className="card-tag">{feature.tag}</span><span className="card-icon"><Icon size={17} /></span></span>
                  <span className="card-copy"><strong>{feature.title}</strong><span>{feature.description}</span><em>进入工具<ArrowRight size={15} /></em></span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="public-footer">
        <span>© 2026 芭乐AIGC</span>
        <nav><a href="mailto:bseazh@163.com">联系我们</a><a href="#">服务协议</a><a href="#">隐私政策</a></nav>
      </footer>

      <button className="support-button" aria-label="联系客服"><MessageCircle size={23} /></button>

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setLoginOpen(false)}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <button className="icon-button modal-close" aria-label="关闭" onClick={() => setLoginOpen(false)}><X size={20} /></button>
            <Brand />
            <div className="login-heading"><span><Sparkles size={18} /></span><h2 id="login-title">{mode === "login" ? "欢迎回来" : "创建账户"}</h2><p>{mode === "login" ? "登录后继续你的创作任务" : "注册即赠送 100 积分"}</p></div>
            <div className="segmented" role="tablist">
              <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>登录</button>
              <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>注册</button>
            </div>
            <form onSubmit={submitAccount}>
              <label>{mode === "register" ? "邮箱" : "手机号或邮箱"}<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} type={mode === "register" ? "email" : "text"} autoComplete="username" placeholder={mode === "register" ? "请输入邮箱地址" : "请输入手机号或邮箱"} required /></label>
              {mode === "register" && <label>邮箱验证码<span className="input-action"><input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="请输入 6 位验证码" pattern="\d{6}" required /><button type="button" onClick={sendEmailCode} disabled={sendingCode || codeCooldown > 0}>{sendingCode ? "发送中..." : codeCooldown > 0 ? `${codeCooldown} 秒后重发` : "发送验证码"}</button></span></label>}
              <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8-72 位密码" minLength={8} maxLength={72} required /></label>
              <label className="consent"><button type="button" className={agreed ? "checked" : ""} onClick={() => setAgreed(!agreed)} aria-label="同意协议">{agreed && <Check size={13} />}</button><span>我已阅读并同意《用户协议》和《隐私政策》</span></label>
              {authError && <p className="auth-error" role="alert">{authError}</p>}
              <button className="submit-button" type="submit" disabled={!agreed || submitting}>{submitting ? "处理中..." : mode === "login" ? "登录并进入工作台" : "注册并领取 100 积分"}<ArrowRight size={18} /></button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
