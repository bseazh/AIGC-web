export const heroImageWorkflow = {
  key: "product-hero-image",
  name: "商品主图",
  enabled: false,
  disabledReason: "AI_PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.HERO_IMAGE_TASK_POINTS || 10),
  outputsPerTask: 4,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  scenes: ["纯色棚拍", "简约家居", "自然户外", "办公通勤", "节日礼赠"],
  styles: ["真实摄影", "清透商业", "低饱和高级", "明快促销"],
  refundOnFailure: true,
} as const;
