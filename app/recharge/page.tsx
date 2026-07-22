"use client";

import { CheckCircle2, CircleDollarSign, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
type Package = { key: string; title: string; amountCny: number; points: number; description: string };

export default function RechargePage() {
  const router = useRouter(); const [account, setAccount] = useState<Account | null>(null); const [packages, setPackages] = useState<Package[]>([]); const [enabled, setEnabled] = useState(false);
  useEffect(() => { Promise.all([fetch("/api/auth/session/", { cache: "no-store" }), fetch("/api/payments/wechat/", { cache: "no-store" })]).then(async ([session, payment]) => { if (!session.ok || !payment.ok) throw new Error(); setAccount(await session.json()); const config = await payment.json(); setEnabled(config.enabled === true); setPackages(config.packages || []); }).catch(() => router.replace("/")); }, [router]);
  if (!account) return <LoadingScreen />;
  return <AppShell active="recharge" account={account}><div className="app-page-content"><section className="page-intro"><div><span className="page-kicker"><CircleDollarSign size={15} />充值中心</span><h1>购买积分</h1><p>固定换算：1 元 = 10 积分。微信支付审核完成后，可使用微信扫码充值；积分将在支付成功后自动到账。</p></div></section><section className="recharge-notice"><ShieldCheck size={20} /><div><strong>{enabled ? "微信支付已开放" : "微信支付审核中"}</strong><p>{enabled ? "请选择积分包后使用微信扫码支付。" : "支付订单、回调验签与积分入账已准备完成，审核通过后开放扫码支付。"}</p></div></section><section className="recharge-packages">{packages.map((item) => <article key={item.key}><span>{item.title}</span><strong>¥{item.amountCny}</strong><em>{item.points.toLocaleString()} 积分</em><small>{item.description}</small><button disabled={!enabled}>{enabled ? "微信扫码支付" : "审核中，暂不可购买"}</button></article>)}</section><p className="recharge-footnote"><CheckCircle2 size={15} />支付成功以微信支付签名回调为准；任务创建时仅冻结积分，生成成功后才结算，失败或超时将自动退回。</p></div></AppShell>;
}
