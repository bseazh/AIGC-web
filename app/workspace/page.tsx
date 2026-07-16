"use client";

import {
  ArrowLeft,
  Bell,
  Boxes,
  ChevronRight,
  Clock3,
  Coins,
  Home,
  ImageIcon,
  Layers3,
  Menu,
  Plus,
  PackageOpen,
  Search,
  Shirt,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const tools = [
  { name: "商品主图", note: "生成电商首屏视觉", icon: ImageIcon, color: "blue" },
  { name: "模特穿搭", note: "服装自然上身展示", icon: Shirt, color: "violet" },
  { name: "场景延展", note: "匹配营销使用场景", icon: WandSparkles, color: "cyan" },
  { name: "详情页套图", note: "组织统一卖点表达", icon: Layers3, color: "orange" },
];

type Account = {
  user: { identifier: string; displayName: string };
  wallet: { availablePoints: number; frozenPoints: number };
};

export default function Workspace() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  useEffect(() => {
    fetch(`${basePath}/api/auth/session/`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unauthenticated");
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [basePath, router]);

  const logout = async () => {
    await fetch(`${basePath}/api/auth/logout/`, { method: "POST" });
    router.replace("/");
    router.refresh();
  };

  if (!account) {
    return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
  }

  return (
    <main className="workspace-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="workspace-brand"><span><Sparkles size={19} /></span><strong>芭乐AIGC</strong></div>
        <nav>
          <a className="active"><Home size={19} />工作台</a>
          <a><Sparkles size={19} />创作工具</a>
          <a><Clock3 size={19} />任务中心<span className="nav-count">1</span></a>
          <a><Boxes size={19} />内容资产</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card"><span>可用积分</span><strong><Coins size={18} />{account.wallet.availablePoints.toLocaleString()}</strong><button disabled>充值</button></div>
          <Link href="/"><ArrowLeft size={17} />返回首页</Link>
          <button className="logout-link" onClick={logout}>退出登录</button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace-main">
        <header className="workspace-header">
          <button className="icon-button mobile-menu" aria-label="打开菜单" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="search-box"><Search size={17} /><input placeholder="搜索任务或资产" /></div>
          <div className="header-actions"><button className="icon-button" aria-label="通知"><Bell size={19} /></button><span className="avatar">{account.user.displayName.slice(0, 1)}</span></div>
        </header>

        <div className="workspace-content">
          <section className="welcome-row"><div><p>{account.user.identifier}</p><h1>今天想做什么？</h1></div><button className="new-task" disabled><Plus size={18} />新建任务</button></section>

          <section className="tool-grid" aria-label="创作工具">
            {tools.map((tool) => { const Icon = tool.icon; return (
              <button className="tool-card" key={tool.name} disabled><span className={`tool-icon ${tool.color}`}><Icon size={22} /></span><span><strong>{tool.name}</strong><small>{tool.note}</small></span><ChevronRight size={18} />
              </button>
            ); })}
          </section>

          <section className="workspace-band">
            <div className="section-title"><div><h2>最近任务</h2><p>跟踪生成进度与最新结果</p></div><button>查看全部<ChevronRight size={16} /></button></div>
            <div className="empty-tasks"><span><PackageOpen size={24} /></span><strong>暂无任务</strong><p>创建商品主图后，生成进度与结果会出现在这里。</p></div>
          </section>
        </div>
      </section>
    </main>
  );
}
