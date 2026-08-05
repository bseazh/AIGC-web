"use client";

import { Layers3, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, LoadingScreen } from "@/app/components/app-shell";
import { videoModules, type VideoCenterTab } from "@/app/features/video-center/modules";
import { projectGateHref } from "@/lib/project-workflows";

type Account = { user: { displayName: string }; wallet: { availablePoints: number } };

export function VideoCenterPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [activeTab, setActiveTab] = useState<VideoCenterTab>("recreate");
  const activeModule = videoModules.find((module) => module.key === activeTab) || videoModules[0];

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
    <AppShell active="tools" account={account}>
      <div className="app-page-content video-center">
        <section className="video-center-hero">
          <div>
            <span className="page-kicker">
              <Video size={15} />
              视频创作中心
            </span>
            <h1>让内容资产，变成可投放的视频</h1>
            <p>从口播文案、商品素材到视频片段，逐步完成可编辑、可复用的带货视频创作。</p>
          </div>
          <div className="video-center-stat">
            <Sparkles size={20} />
            <strong>文案 → 视频</strong>
            <span>分阶段创作</span>
          </div>
        </section>

        <nav className="video-center-tabs" aria-label="视频创作模块">
          {videoModules.map((module) => (
            <button
              className={module.key === activeTab ? "active" : ""}
              key={module.key}
              type="button"
              onClick={() => setActiveTab(module.key)}
            >
              <strong>{module.title}</strong>
              <span>{module.items.length}</span>
            </button>
          ))}
        </nav>

        <section className="video-center-group">
          <div className="video-center-heading">
            <div>
              <span>{activeModule.caption}</span>
              <h2>{activeModule.title}</h2>
              <p>{activeModule.summary}</p>
            </div>
            <p>{activeModule.items.length} 个创作模板</p>
          </div>
          <div className="video-template-grid">
            {activeModule.items.map((item) => {
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
      </div>
    </AppShell>
  );
}
