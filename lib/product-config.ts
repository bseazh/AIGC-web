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
