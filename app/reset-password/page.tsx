"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") || ""), []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (password !== confirmation) return setMessage("两次输入的密码不一致");
    setBusy(true); setMessage("");
    const response = await fetch("/api/auth/password-reset/confirm/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setMessage(body.message || "密码重置失败");
    setDone(true); setMessage("密码已重置，所有旧会话均已退出。");
  };
  return <main className="reset-shell"><form className="reset-panel" onSubmit={submit}><span><KeyRound size={22} /></span><h1>重置密码</h1>{done ? <><p>{message}</p><Link href="/">返回登录</Link></> : <><p>设置 8–72 位新密码。</p><label>新密码<input type="password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label>确认新密码<input type="password" minLength={8} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>{message && <p className="reset-message">{message}</p>}<button disabled={busy || !token}>{busy ? <LoaderCircle size={17} /> : <KeyRound size={17} />}{busy ? "正在重置" : "确认重置"}</button><Link href="/">返回登录</Link></>}</form></main>;
}
