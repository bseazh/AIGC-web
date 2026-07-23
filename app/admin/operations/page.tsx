"use client";

import Link from "next/link";
import { ArrowLeft, DatabaseBackup, HardDrive, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/app/components/app-shell";

type Account = { user: { isAdministrator?: boolean } };
type Overview = {
  storage: Array<{ id: string; display_name: string; identifier: string; quota_bytes: string; used_bytes: string }>;
  operations: Array<{ id: string; operation: string; status: string; summary: string; created_at: string }>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export default function OperationsAdminPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/auth/session/", { cache: "no-store" }), fetch("/api/admin/overview/", { cache: "no-store" })])
      .then(async ([sessionResponse, overviewResponse]) => {
        if (!sessionResponse.ok || !overviewResponse.ok) throw new Error("forbidden");
        const session = await sessionResponse.json();
        if (!session.user.isAdministrator) throw new Error("forbidden");
        setAccount(session);
        setOverview(await overviewResponse.json());
      })
      .catch(() => router.replace("/workspace"));
  }, [router]);

  if (!account || !overview) return <LoadingScreen />;
  return <main className="admin-shell"><header><div><span><ShieldCheck size={17} />受限后台</span><h1>存储与运维</h1><p>查看用户配额、自动清理、数据库备份和恢复演练记录。</p></div><Link className="admin-back-link" href="/admin/wallets"><ArrowLeft size={16} />运营管理</Link></header><section className="admin-query"><div className="provider-log-heading"><div><span><HardDrive size={17} />用户存储配额</span><p>按当前已占用空间排序；配额包含已上传和已就绪资产。</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>用户</th><th>账号</th><th>已使用</th><th>配额</th><th>使用率</th></tr></thead><tbody>{overview.storage.length ? overview.storage.map((item) => { const used = Number(item.used_bytes); const quota = Number(item.quota_bytes); return <tr key={item.id}><td>{item.display_name}</td><td>{item.identifier}</td><td>{formatBytes(used)}</td><td>{formatBytes(quota)}</td><td>{quota ? `${(used / quota * 100).toFixed(1)}%` : "-"}</td></tr>; }) : <tr><td colSpan={5} className="prompt-empty">暂无用户存储记录。</td></tr>}</tbody></table></div></section><section className="admin-query provider-log-panel"><div className="provider-log-heading"><div><span><DatabaseBackup size={17} />运维执行记录</span><p>自动清理、数据库备份和恢复演练会在完成后写入这里。</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>时间</th><th>操作</th><th>状态</th><th>摘要</th></tr></thead><tbody>{overview.operations.length ? overview.operations.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString("zh-CN")}</td><td>{item.operation}</td><td><span className={`admin-status ${item.status.toLowerCase()}`}>{item.status}</span></td><td>{item.summary}</td></tr>) : <tr><td colSpan={4} className="prompt-empty">尚无记录。下一次定时任务完成后会显示。</td></tr>}</tbody></table></div></section></main>;
}
