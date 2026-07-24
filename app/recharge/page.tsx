"use client";

import { CheckCircle2, CircleDollarSign, FileKey2, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toDataURL } from "qrcode";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { displayName: string; isAdministrator?: boolean }; wallet: { availablePoints: number } };
type Package = { key: string; title: string; amountCny: number; points: number; description: string };
type PaymentOrder = { orderId: string; orderNo: string; amountCny: number; points: number; qrDataUrl: string; status: "PENDING" | "PAID" | "CLOSED" | "FAILED" };

export default function RechargePage() {
  const router = useRouter();
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [rechargeCode, setRechargeCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState("");

  const refreshAccount = useCallback(async () => {
    const response = await fetch("/api/auth/session/", { cache: "no-store" });
    if (!response.ok) throw new Error("会话已失效");
    setAccount(await response.json());
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const checkOrder = useCallback(async (orderId: string) => {
    const response = await fetch(`/api/payments/orders/${orderId}/`, { cache: "no-store" });
    if (!response.ok) return;
    const current = await response.json() as { status: PaymentOrder["status"] };
    setOrder((previous) => previous && previous.orderId === orderId ? { ...previous, status: current.status } : previous);
    if (current.status === "PAID") {
      stopPolling();
      await refreshAccount();
    }
    if (["CLOSED", "FAILED"].includes(current.status)) stopPolling();
  }, [refreshAccount, stopPolling]);

  useEffect(() => {
    Promise.all([refreshAccount(), fetch("/api/payments/wechat/", { cache: "no-store" })]).then(async ([, payment]) => {
      if (!payment.ok) throw new Error();
      const config = await payment.json();
      setEnabled(config.enabled === true);
      setPackages(config.packages || []);
    }).catch(() => router.replace("/"));
    return stopPolling;
  }, [refreshAccount, router, stopPolling]);

  async function createOrder(packageKey: string) {
    setCreating(packageKey); setPaymentError("");
    try {
      const response = await fetch("/api/payments/wechat/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageKey }) });
      const body = await response.json().catch(() => null) as { code?: string; message?: string; orderId?: string; orderNo?: string; codeUrl?: string } | null;
      if (!response.ok || !body?.orderId || !body.codeUrl || !body.orderNo) throw new Error(body?.message || "支付订单创建失败，请稍后重试");
      const selected = packages.find((item) => item.key === packageKey);
      if (!selected) throw new Error("充值套餐不存在");
      const qrDataUrl = await toDataURL(body.codeUrl, { width: 264, margin: 1, errorCorrectionLevel: "M" });
      const nextOrder: PaymentOrder = { orderId: body.orderId, orderNo: body.orderNo, amountCny: selected.amountCny, points: selected.points, qrDataUrl, status: "PENDING" };
      setOrder(nextOrder);
      stopPolling();
      pollTimer.current = setInterval(() => { checkOrder(nextOrder.orderId).catch(() => undefined); }, 3000);
      await checkOrder(nextOrder.orderId);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "支付订单创建失败，请稍后重试");
    } finally { setCreating(null); }
  }

  function closeOrder() { stopPolling(); setOrder(null); }

  async function redeemCode(event: React.FormEvent) {
    event.preventDefault(); setRedeeming(true); setRedeemMessage("");
    const response = await fetch("/api/recharge-codes/redeem/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: rechargeCode }) });
    const body = await response.json(); setRedeeming(false);
    if (!response.ok) return setRedeemMessage(body.message || "兑换失败，请检查充值码");
    setRedeemMessage(body.message); setRechargeCode(""); await refreshAccount();
  }

  if (!account) return <LoadingScreen />;
  return <AppShell active="recharge" account={account}><div className="app-page-content"><section className="page-intro"><div><span className="page-kicker"><CircleDollarSign size={15} />充值中心</span><h1>购买积分</h1><p>固定换算：1 元 = 10 积分。微信支付审核完成后，可使用微信扫码充值；积分将在支付成功后自动到账。</p></div></section><section className="recharge-notice"><ShieldCheck size={20} /><div><strong>{enabled ? "微信支付已开放" : "微信支付审核中"}</strong><p>{enabled ? "请选择积分包后使用微信扫码支付。" : "支付开通前可使用管理员发放的充值码，兑换后积分即时到账。"}</p></div></section><form className="recharge-code-panel" onSubmit={redeemCode}><span><FileKey2 size={20} /></span><div><strong>使用充值码 / 兑换码</strong><p>输入管理员发放的兑换码，积分将直接进入当前账户。</p><div><input value={rechargeCode} onChange={(event) => setRechargeCode(event.target.value)} placeholder="BALA-XXXX-XXXX-XXXX" maxLength={40} /><button disabled={redeeming || !rechargeCode.trim()}>{redeeming ? "兑换中" : "立即兑换"}</button></div>{redeemMessage && <small>{redeemMessage}</small>}</div></form>{paymentError && <p className="creator-error" role="alert">{paymentError}</p>}<section className="recharge-packages">{packages.map((item) => <article key={item.key}><span>{item.title}</span><strong>¥{item.amountCny}</strong><em>{item.points.toLocaleString()} 积分</em><small>{item.description}</small><button disabled={!enabled || creating !== null} onClick={() => createOrder(item.key)}>{creating === item.key ? <><LoaderCircle size={15} />正在创建订单</> : enabled ? "微信扫码支付" : "审核中，暂不可购买"}</button></article>)}</section><p className="recharge-footnote"><CheckCircle2 size={15} />支付成功以微信支付签名回调为准；任务创建时仅冻结积分，生成成功后才结算，失败或超时将自动退回。</p></div>{order && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeOrder()}><section className="recharge-payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title"><button className="icon-button payment-close" type="button" aria-label="关闭支付窗口" onClick={closeOrder}><X size={18} /></button>{order.status === "PAID" ? <><CheckCircle2 className="payment-success-icon" size={42} /><h2 id="payment-title">充值成功</h2><p>{order.points.toLocaleString()} 积分已到账。</p><button className="payment-confirm" type="button" onClick={closeOrder}>完成</button></> : order.status === "PENDING" ? <><h2 id="payment-title">微信扫码支付</h2><p>请使用微信扫一扫完成 ¥{order.amountCny} 支付。</p><img className="payment-qr" src={order.qrDataUrl} alt="微信支付二维码" /><strong>支付完成后将自动到账</strong><small>订单号：{order.orderNo}</small></> : <><h2 id="payment-title">订单已失效</h2><p>该支付订单未完成，请关闭后重新创建订单。</p><button className="payment-confirm" type="button" onClick={closeOrder}>关闭</button></>}</section></div>}</AppShell>;
}
