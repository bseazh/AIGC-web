"use client";

import { Layers3, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { videoModules } from "@/app/features/video-center/modules";
import { projectGateHref } from "@/lib/project-workflows";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };

export function VideoCenterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    fetch("/api/auth/session/", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAccount(await response.json());
      })
      .catch(() => router.replace("/"));
  }, [router]);

  if (!account) return <LoadingScreen />;

  return (
    <AppShell active="video" account={account}>
      <div className="app-page-content video-center">
        <section className="video-center-hero">
          <div>
            <span className="page-kicker">
              <Video size={15} />
              视频创作中心
            </span>
            <h1>视频创作模块</h1>
            <p>按视频能力全部展开：带货、复刻、广告大片、混剪、高级生成和模特口播脚本都能直接进入。</p>
          </div>
          <div className="video-center-stat">
            <Sparkles size={20} />
            <strong>文案 → 视频</strong>
            <span>分阶段创作</span>
          </div>
        </section>

        <div className="video-center-groups">
          {videoModules.map((module) => (
            <section className="video-center-group" key={module.key}>
              <div className="video-center-heading">
                <div>
                  <span>{module.caption}</span>
                  <h2>{module.title}</h2>
                  <p>{module.summary}</p>
                </div>
                <p>{module.items.length} 个创作模板</p>
              </div>
              <div className="video-template-grid">
                {module.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link className="video-template-card" href={projectGateHref(item.workflowKey)} key={item.title}>
                      <span className={`video-template-icon ${item.tone}`}>
                        <Icon size={25} />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.text}</p>
                      </div>
                      <span className="video-template-action">
                        立即开始 <Layers3 size={14} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
