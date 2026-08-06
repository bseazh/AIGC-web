import { Clapperboard, Film, Layers3, MicVocal, Repeat2, Video } from "lucide-react";
import type { ProjectWorkflowKey } from "@/lib/project-workflows";

export type VideoCenterTab = "commerce" | "smart-commerce" | "seedance";
export type VideoTemplate = {
  title: string;
  text: string;
  href: string;
  workflowKey: ProjectWorkflowKey;
  icon: typeof Repeat2;
  tone: string;
  cover: string;
  badge: string;
  sourceFile: string;
};
export type VideoModule = {
  key: VideoCenterTab;
  title: string;
  caption: string;
  summary: string;
  sourceFile: string;
  items: VideoTemplate[];
};

export const videoModules: VideoModule[] = [
  {
    key: "commerce",
    title: "带货视频生成",
    caption: "COMMERCE VIDEO",
    summary: "从商品图、模特素材和卖点信息出发，快速生成可投放的带货短视频。",
    sourceFile: "app/create/product-video/page.tsx",
    items: [
      {
        title: "产品广告大片",
        text: "一张商品图出发，自动组织卖点、细节与收束镜头。",
        href: "/create/product-ad-video",
        workflowKey: "product-ad-video",
        icon: Clapperboard,
        tone: "blue",
        cover: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=86",
        badge: "广告大片",
        sourceFile: "app/create/product-ad-video/page.tsx",
      },
      {
        title: "模特对镜自拍",
        text: "围绕商品、穿搭或妆容生成自然的模特自拍带货视频。",
        href: "/create/model-spokesperson-video",
        workflowKey: "model-spokesperson-script",
        icon: Video,
        tone: "violet",
        cover: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=86",
        badge: "模特自拍",
        sourceFile: "app/create/model-spokesperson-video/page.tsx",
      },
    ],
  },
  {
    key: "smart-commerce",
    title: "智能带货视频",
    caption: "SMART COMMERCE",
    summary: "从爆款参考、素材片段和口播脚本出发，沉淀可复用的电商视频流程。",
    sourceFile: "app/create/recreate-video/page.tsx",
    items: [
      {
        title: "复刻爆款带货视频-新版",
        text: "参考镜头节奏、动作走势与运镜，替换商品或模特生成原创带货内容。",
        href: "/create/recreate-video",
        workflowKey: "recreate-video",
        icon: Repeat2,
        tone: "violet",
        cover: "https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&w=900&q=86",
        badge: "爆款复刻",
        sourceFile: "app/components/recreate-video-page.tsx",
      },
      {
        title: "智能混剪带货视频",
        text: "将已授权素材片段按顺序合成为可投放视频。",
        href: "/create/video-mix",
        workflowKey: "video-mix",
        icon: Layers3,
        tone: "cyan",
        cover: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=900&q=86",
        badge: "素材混剪",
        sourceFile: "app/create/video-mix/page.tsx",
      },
      {
        title: "口播带货视频",
        text: "先生成可编辑的分镜口播稿，后续直接衔接口型、配音与视频生成。",
        href: "/create/model-spokesperson-video",
        workflowKey: "model-spokesperson-script",
        icon: MicVocal,
        tone: "blue",
        cover: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=900&q=86",
        badge: "口播脚本",
        sourceFile: "app/create/model-spokesperson-video/page.tsx",
      },
    ],
  },
  {
    key: "seedance",
    title: "Seedance2-视频",
    caption: "SEEDANCE2 VIDEO",
    summary: "组合图片、视频、音频和自由脚本，完成高级视频创作。",
    sourceFile: "app/create/seedance-video/page.tsx",
    items: [
      {
        title: "Seedance2 视频",
        text: "组合图片、视频、音频和自由脚本，完成高级视频创作。",
        href: "/create/seedance-video",
        workflowKey: "seedance-video",
        icon: Film,
        tone: "cyan",
        cover: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=86",
        badge: "高级视频",
        sourceFile: "app/create/seedance-video/page.tsx",
      },
    ],
  },
];
