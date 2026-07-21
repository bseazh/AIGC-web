"use client";

import { BookOpen, Coins, LoaderCircle, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };
type WalletData = { wallet: { availablePoints: number; frozenPoints: number }; rules: Array<{ title: string; content: string }>; ledger: Array<{ id: string; type: string; amount: number; balance_after: number; label: string; created_at: string }> };

export default function WalletPage() {
  const router = useRouter(); const [account, setAccount] = useState<Account | null>(null); const [data, setData] = useState<WalletData | null>(null);
  useEffect(() => { fetch("/api/auth/session/", { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error(); setAccount(await r.json()); }).catch(() => router.replace("/")); }, [router]);
  useEffect(() => { if (account) fetch("/api/wallet/", { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); }).catch(() => router.replace("/")); }, [account, router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="wallet" account={account}><div className="app-page-content"><section className="page-intro"><div><span className="page-kicker"><WalletCards size={15} />账户资产</span><h1>积分钱包</h1><p>查看可用余额、人工充值和测试积分流水。</p></div></section>{!data ? <div className="records-loading"><LoaderCircle size={22} />正在载入钱包</div> : <><section className="wallet-summary"><div><Coins size={22} /><span>可用积分</span><strong>{data.wallet.availablePoints.toLocaleString()}</strong></div><div><WalletCards size={22} /><span>冻结中</span><strong>{data.wallet.frozenPoints.toLocaleString()}</strong></div><div><BookOpen size={22} /><span>积分换算</span><strong>1 元 = 10 积分</strong></div></section><section className="wallet-layout"><div className="wallet-panel"><div className="section-title"><div><h2>积分流水</h2><p>包含人工充值、测试积分与任务扣减/退回。</p></div></div>{data.ledger.length ? <div className="ledger-list">{data.ledger.map((item) => <div key={item.id}><div><strong>{item.label}</strong><small>{new Date(item.created_at).toLocaleString("zh-CN")}</small></div><em className={item.amount >= 0 ? "income" : "expense"}>{item.amount >= 0 ? "+" : ""}{item.amount} 积分</em><span>余额 {item.balance_after}</span></div>)}</div> : <div className="page-empty compact"><strong>暂无积分流水</strong></div>}</div><aside className="wallet-panel rules-panel"><div className="section-title"><div><h2>兑换规则</h2></div></div>{data.rules.map((rule) => <div className="wallet-rule" key={rule.title}><strong>{rule.title}</strong><p>{rule.content}</p></div>)}</aside></section></>}</div></AppShell>;
}
