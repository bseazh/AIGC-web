"use client";

import { ArrowRight, Play, Search, Sparkles, Video } from "lucide-react";
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
        <nav className="video-center-topnav" aria-label="视频创作模块导航">
          <Link href="/create/product-video" aria-current="page">
            <Video size={16} />
            AI电商视频
          </Link>
          {videoModules.map((module) => (
            <a href={`#${module.key}`} key={module.key}>{module.title}</a>
          ))}
          <Link href="/tasks">我的任务</Link>
          <Link href="/assets">素材库</Link>
        </nav>

        <section className="video-center-search">
          <Search size={18} />
          <span>AI电商视频</span>
          <strong>选择视频能力，进入对应创作流程</strong>
        </section>

        <section className="video-center-hero">
          <div>
            <span className="page-kicker">
              <Video size={15} />
              一站式视频带货
            </span>
            <h1>爆款视频换品复刻</h1>
            <p>把对标视频、商品素材和生成参数收束在同一个视频创作中心。下方模块全部展开，直接进入对应工作流。</p>
            <Link className="video-center-hero-action" href={projectGateHref("recreate-video")}>
              开始复刻 <ArrowRight size={16} />
            </Link>
          </div>
          <div className="video-center-stat">
            <Sparkles size={20} />
            <strong>Reference</strong>
            <span>换品复刻</span>
          </div>
        </section>

        <div className="video-center-groups">
          {videoModules.map((module) => (
            <section className="video-center-group" id={module.key} key={module.key}>
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
                      <div className="video-template-media">
                        <img src={item.cover} alt="" />
                        <span className="video-template-badge"><Play size={12} />{item.badge}</span>
                        <span className="video-template-play"><Play size={20} /></span>
                      </div>
                      <div className="video-template-body">
                        <span className={`video-template-icon ${item.tone}`}>
                          <Icon size={20} />
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.text}</p>
                        </div>
                      </div>
                      <span className="video-template-action">
                        立即开始 <ArrowRight size={14} />
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
