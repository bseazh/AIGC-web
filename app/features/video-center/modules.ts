import { Clapperboard, Film, Layers3, MicVocal, Repeat2, Sparkles, Video } from "lucide-react";
import type { ProjectWorkflowKey } from "@/lib/project-workflows";

export type VideoCenterTab = "commerce" | "recreate" | "ad" | "mix" | "seedance" | "spokesperson";
export type VideoTemplate = {
  title: string;
  text: string;
  href: string;
  workflowKey: ProjectWorkflowKey;
  icon: typeof Repeat2;
  tone: string;
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
    title: "视频带货",
    caption: "COMMERCE VIDEO",
    summary: "商品素材、卖点脚本和案例模板组成的一站式带货视频入口。",
    sourceFile: "app/create/product-video/page.tsx",
    items: [
      {
        title: "视频创作中心",
        text: "从商品和素材出发，统一进入广告大片、复刻和高级视频工作流。",
        href: "/create/product-video",
        workflowKey: "product-ad-video",
        icon: Video,
        tone: "blue",
        sourceFile: "app/components/video-center-page.tsx",
      },
    ],
  },
  {
    key: "recreate",
    title: "复刻带货视频",
    caption: "REFERENCE REPLICA",
    summary: "项目化管理对标视频、十二宫格、替换素材和生成任务。",
    sourceFile: "app/create/recreate-video/page.tsx",
    items: [
      {
        title: "复刻带货视频",
        text: "参考镜头节奏、动作走势与运镜，替换商品或模特生成原创带货内容。",
        href: "/create/recreate-video",
        workflowKey: "recreate-video",
        icon: Repeat2,
        tone: "violet",
        sourceFile: "app/components/recreate-video-page.tsx",
      },
    ],
  },
  {
    key: "ad",
    title: "产品广告大片",
    caption: "PRODUCT AD",
    summary: "从单张商品图组织卖点、细节、氛围与收束镜头。",
    sourceFile: "app/create/product-ad-video/page.tsx",
    items: [
      {
        title: "产品广告大片",
        text: "一张商品图出发，自动组织卖点、细节与收束镜头。",
        href: "/create/product-ad-video",
        workflowKey: "product-ad-video",
        icon: Clapperboard,
        tone: "blue",
        sourceFile: "app/create/product-ad-video/page.tsx",
      },
    ],
  },
  {
    key: "mix",
    title: "智能混剪",
    caption: "SMART MIX",
    summary: "将已授权素材片段按顺序合成为可投放视频。",
    sourceFile: "app/create/video-mix/page.tsx",
    items: [
      {
        title: "智能混剪",
        text: "至少两段已授权视频，保留原音频合成为长视频。",
        href: "/create/video-mix",
        workflowKey: "video-mix",
        icon: Layers3,
        tone: "cyan",
        sourceFile: "app/create/video-mix/page.tsx",
      },
    ],
  },
  {
    key: "seedance",
    title: "Seedance 高级视频",
    caption: "ADVANCED CREATION",
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
        sourceFile: "app/create/seedance-video/page.tsx",
      },
    ],
  },
  {
    key: "spokesperson",
    title: "模特口播脚本",
    caption: "SPOKESPERSON SCRIPT",
    summary: "先沉淀可编辑脚本，再衔接口播视频链路。",
    sourceFile: "app/create/model-spokesperson-video/page.tsx",
    items: [
      {
        title: "模特口播文案",
        text: "先生成可编辑的分镜口播稿，后续直接衔接口型、配音与视频生成。",
        href: "/create/model-spokesperson-video",
        workflowKey: "model-spokesperson-script",
        icon: MicVocal,
        tone: "violet",
        sourceFile: "app/create/model-spokesperson-video/page.tsx",
      },
      {
        title: "口播视频链路",
        text: "后续接入口型、配音与人物视频生成，当前先完成脚本管理。",
        href: "/create/model-spokesperson-video",
        workflowKey: "model-spokesperson-script",
        icon: Sparkles,
        tone: "blue",
        sourceFile: "app/create/model-spokesperson-video/page.tsx",
      },
    ],
  },
];
