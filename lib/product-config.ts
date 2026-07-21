export const heroImageWorkflow = {
  key: "product-hero-image",
  name: "商品主图",
  enabled: Boolean(process.env.AI_API_KEY && process.env.COS_SECRET_ID),
  disabledReason: process.env.AI_API_KEY && process.env.COS_SECRET_ID ? null : "PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.HERO_IMAGE_TASK_POINTS || 10),
  outputsPerTask: 4,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  scenes: ["纯色棚拍", "简约家居", "自然户外", "办公通勤", "节日礼赠"],
  styles: ["真实摄影", "清透商业", "低饱和高级", "明快促销"],
  refundOnFailure: true,
} as const;

export const sceneImageWorkflow = {
  key: "scene-image",
  name: "场景图生成",
  enabled: Boolean(process.env.AI_API_KEY && process.env.COS_SECRET_ID),
  disabledReason: process.env.AI_API_KEY && process.env.COS_SECRET_ID ? null : "PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.SCENE_IMAGE_TASK_POINTS || 10),
  outputsPerTask: 4,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  scenes: ["自然居家", "户外生活", "精品店陈列", "咖啡桌面", "节日礼赠"],
  styles: ["明亮生活方式", "低饱和质感", "轻奢商业", "清新自然"],
  refundOnFailure: true,
} as const;

export const modelWearWorkflow = {
  key: "model-wear",
  name: "模特穿搭",
  enabled: Boolean(process.env.AI_API_KEY && process.env.COS_SECRET_ID),
  pointsPerTask: Number(process.env.MODEL_WEAR_TASK_POINTS || 10),
  outputsPerTask: 4,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  scenes: ["简约棚拍", "通勤街拍", "自然居家", "精品店试穿"],
  styles: ["自然真实", "轻奢时尚", "清新日常", "电商展示"],
  refundOnFailure: true,
} as const;

export const hdEnhanceWorkflow = {
  key: "hd-enhance",
  name: "高清优化",
  enabled: Boolean(process.env.AI_API_KEY && process.env.COS_SECRET_ID),
  pointsPerTask: Number(process.env.HD_ENHANCE_TASK_POINTS || 5),
  outputsPerTask: 1,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["保持原比例"],
  scenes: ["2 倍增强", "4 倍增强"],
  styles: ["自然细节", "商品质感", "人像清晰", "降噪净化"],
  refundOnFailure: true,
} as const;

export const detailPageWorkflow = {
  key: "product-detail-page",
  name: "商品详情页",
  enabled: Boolean(process.env.AI_API_KEY && process.env.COS_SECRET_ID),
  pointsPerTask: Number(process.env.DETAIL_PAGE_TASK_POINTS || 10),
  outputsPerTask: 5,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  scenes: ["简约品牌", "自然生活", "轻奢质感", "科技清爽"],
  styles: ["清晰卖点", "克制留白", "真实摄影", "高转化电商"],
  refundOnFailure: true,
} as const;

const videoWorkflowBase = {
  enabled: Boolean(process.env.ARK_API_KEY && process.env.COS_BUCKET && process.env.COS_REGION && process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY),
  pointsPerTask: Number(process.env.VIDEO_TASK_POINTS || 40),
  outputsPerTask: 1,
  aspectRatios: ["16:9", "9:16"],
  durations: [5, 10, 15],
  resolutions: ["480p", "720p", "1080p"],
  refundOnFailure: true,
} as const;

export const productAdVideoWorkflow = {
  ...videoWorkflowBase,
  key: "product-ad-video",
  name: "产品广告大片",
  minAssets: 1,
  scenes: ["产品广告大片"],
  styles: ["商业广告"],
} as const;

export const recreateVideoWorkflow = {
  ...videoWorkflowBase,
  key: "recreate-video",
  name: "复刻带货视频",
  minAssets: 2,
  scenes: ["镜头节奏复刻", "商品展示复刻", "种草讲解复刻", "场景切换复刻"],
  styles: ["自然带货", "轻快节奏", "质感种草", "促销转化"],
} as const;

export const seedanceVideoWorkflow = {
  ...videoWorkflowBase,
  key: "seedance-video",
  name: "Seedance2 视频",
  minAssets: 1,
  scenes: ["商品特写", "第一人称", "生活方式", "自由创作"],
  styles: ["轻快节奏", "质感广告", "真实记录", "电影感"],
} as const;
