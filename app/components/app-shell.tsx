"use client";

import { ArrowLeft, Boxes, ChevronDown, CircleDollarSign, Clock3, Coins, Headphones, Home, ImageIcon, LogOut, Menu, Settings2, Sparkles, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

type AppShellProps = {
  active: "workspace" | "tools" | "tasks" | "assets" | "wallet" | "recharge" | "account" | "complaints";
  account: { user: { displayName: string; avatarUrl?: string | null; avatarStyle?: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
  taskCount?: number;
  children: ReactNode;
};

const navItems = [
  { key: "workspace", label: "工作台", href: "/workspace", icon: Home },
  { key: "tools", label: "创作工具", href: "/tools", icon: Sparkles },
  { key: "tasks", label: "任务中心", href: "/tasks", icon: Clock3 },
  { key: "assets", label: "内容资产", href: "/assets", icon: Boxes },
  { key: "wallet", label: "积分钱包", href: "/wallet", icon: WalletCards },
  { key: "recharge", label: "充值中心", href: "/recharge", icon: CircleDollarSign },
  { key: "complaints", label: "投诉与客服", href: "/complaints", icon: Headphones },
] as const;

export function AppShell({ active, account, taskCount = 0, children }: AppShellProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
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
          {account.user.isAdministrator && <><Link href="/admin/wallets" onClick={() => setSidebarOpen(false)}><Settings2 size={19} />积分后台</Link><Link href="/admin/payments" onClick={() => setSidebarOpen(false)}><Settings2 size={19} />微信支付</Link><Link href="/admin/support" onClick={() => setSidebarOpen(false)}><Settings2 size={19} />审核与客服</Link><Link href="/admin/review-metrics" onClick={() => setSidebarOpen(false)}><Settings2 size={19} />审核指标</Link><Link href="/admin/operations" onClick={() => setSidebarOpen(false)}><Settings2 size={19} />存储与运维</Link><Link href="/admin/prompts" onClick={() => setSidebarOpen(false)}><Settings2 size={19} />提示词运营</Link></>}
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card"><span>可用积分</span><strong><Coins size={18} />{account.wallet.availablePoints.toLocaleString()}</strong><em>1 元 = 10 积分</em></div>
          <Link href="/"><ArrowLeft size={17} />返回首页</Link>
          <button className="logout-link" onClick={logout}><LogOut size={16} />退出登录</button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}
      <section className="workspace-main">
        <header className="workspace-header app-page-header">
          <button className="icon-button mobile-menu" aria-label="打开菜单" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <Link href="/workspace" className="mobile-brand"><img src="/brand/bala-aigc-mark.png" alt="" /><strong>芭乐AIGC</strong></Link>
          <div className="header-actions"><Link className="header-create" href="/tools"><ImageIcon size={17} />开始创作</Link><div className="header-account"><button className={`avatar avatar-${account.user.avatarStyle || "ocean"}`} type="button" aria-label="打开账户菜单" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>{account.user.avatarUrl ? <img src={account.user.avatarUrl} alt="" /> : account.user.displayName.slice(0, 1)}<ChevronDown size={13} /></button>{accountMenuOpen && <div className="account-menu"><div><strong>{account.user.displayName}</strong><small>{account.wallet.availablePoints.toLocaleString()} 积分可用</small></div><Link href="/account" onClick={() => setAccountMenuOpen(false)}><UserRound size={16} />账号设置</Link><Link href="/wallet" onClick={() => setAccountMenuOpen(false)}><WalletCards size={16} />积分钱包</Link><Link href="/recharge" onClick={() => setAccountMenuOpen(false)}><CircleDollarSign size={16} />充值中心</Link><button type="button" onClick={logout}><LogOut size={16} />退出登录</button></div>}</div></div>
        </header>
        {children}
      </section>
    </main>
  );
}

export function LoadingScreen() {
  return <main className="workspace-loading"><span><Sparkles size={22} /></span><p>正在载入芭乐AIGC</p></main>;
}
