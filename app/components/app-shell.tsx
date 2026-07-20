"use client";

import { ArrowLeft, Boxes, Clock3, Coins, Home, ImageIcon, LogOut, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

type AppShellProps = {
  active: "workspace" | "tools" | "tasks" | "assets";
  account: { user: { displayName: string }; wallet: { availablePoints: number } };
  taskCount?: number;
  children: ReactNode;
};

const navItems = [
  { key: "workspace", label: "工作台", href: "/workspace", icon: Home },
  { key: "tools", label: "创作工具", href: "/create/product-hero", icon: Sparkles },
  { key: "tasks", label: "任务中心", href: "/tasks", icon: Clock3 },
  { key: "assets", label: "内容资产", href: "/assets", icon: Boxes },
] as const;

export function AppShell({ active, account, taskCount = 0, children }: AppShellProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logout = async () => {
    await fetch("/api/auth/logout/", { method: "POST" });
    router.replace("/");
    router.refresh();
  };

  return (
    <main className="workspace-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <Link href="/workspace" className="workspace-brand"><span><img src="/brand/bala-aigc-mark.png" alt="" /></span><strong>芭乐AIGC</strong></Link>
        <nav>
          {navItems.map((item) => { const Icon = item.icon; return (
            <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} onClick={() => setSidebarOpen(false)}>
              <Icon size={19} />{item.label}{item.key === "tasks" && taskCount > 0 && <span className="nav-count">{taskCount > 99 ? "99+" : taskCount}</span>}
            </Link>
          ); })}
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card"><span>可用积分</span><strong><Coins size={18} />{account.wallet.availablePoints.toLocaleString()}</strong><em>测试积分</em></div>
          <Link href="/"><ArrowLeft size={17} />返回首页</Link>
          <button className="logout-link" onClick={logout}><LogOut size={16} />退出登录</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}
      <section className="workspace-main">
        <header className="workspace-header app-page-header">
          <button className="icon-button mobile-menu" aria-label="打开菜单" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <Link href="/workspace" className="mobile-brand"><img src="/brand/bala-aigc-mark.png" alt="" /><strong>芭乐AIGC</strong></Link>
          <div className="header-actions"><Link className="header-create" href="/create/product-hero"><ImageIcon size={17} />创作商品主图</Link><span className="avatar">{account.user.displayName.slice(0, 1)}</span></div>
        </header>
        {children}
      </section>
    </main>
  );
}

export function LoadingScreen() {
  return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
}
