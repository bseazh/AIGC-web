const sophnetImageConfigured = Boolean(process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL);
const geminiImageConfigured = Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY);
const imageProviderConfigured = sophnetImageConfigured || geminiImageConfigured;

export const heroImageWorkflow = {
  key: "product-hero-image",
  name: "商品主图",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  disabledReason: imageProviderConfigured && process.env.COS_SECRET_ID ? null : "PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.HERO_IMAGE_TASK_POINTS || 10),
  outputsPerTask: 1,
  userSelectableOutputCount: true,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  internalPrompt: "根据商品图片、商品信息和用户提示词自行判断最合适的商业场景、光线与视觉表达，不向用户追加固定风格。",
  refundOnFailure: true,
} as const;

export const imageGenerateWorkflow = {
  key: "image-generate",
  name: "AI生图",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  disabledReason: imageProviderConfigured && process.env.COS_SECRET_ID ? null : "PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.IMAGE_GENERATE_TASK_POINTS || 10),
  outputsPerTask: 1,
  userSelectableOutputCount: true,
  minAssets: 0,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  internalPrompt: "完整遵循用户提示词中的场景与视觉要求；用户没有指定时，根据主体内容选择自然、协调的表达，不强加固定风格。",
  refundOnFailure: true,
} as const;

export const commerceModelWorkflow = {
  ...imageGenerateWorkflow,
  key: "commerce-model",
  name: "带货模特",
  pointsPerTask: Number(process.env.COMMERCE_MODEL_TASK_POINTS || 10),
  internalPrompt: "围绕用户描述生成自然可信的带货模特资产，并根据商品、人群与用途自动确定场景、造型和摄影语言。",
} as const;

export const sceneImageWorkflow = {
  key: "scene-image",
  name: "场景图生成",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  disabledReason: imageProviderConfigured && process.env.COS_SECRET_ID ? null : "PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.SCENE_IMAGE_TASK_POINTS || 10),
  outputsPerTask: 1,
  userSelectableOutputCount: true,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  internalPrompt: "根据商品属性、用户描述和参考图自动导演最有说服力的真实使用场景，确保商品与环境光影、尺度和接触关系自然。",
  refundOnFailure: true,
} as const;

export const modelWearWorkflow = {
  key: "model-wear",
  name: "模特穿搭",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  pointsPerTask: Number(process.env.MODEL_WEAR_TASK_POINTS || 10),
  outputsPerTask: 1,
  userSelectableOutputCount: true,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  internalPrompt: "根据模特、服装商品和用户补充要求自动确定自然的穿搭场景与摄影表达，优先保证人物身份、人体结构和服装细节准确。",
  refundOnFailure: true,
} as const;

export const hdEnhanceWorkflow = {
  key: "hd-enhance",
  name: "高清优化",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  pointsPerTask: Number(process.env.HD_ENHANCE_TASK_POINTS || 5),
  outputsPerTask: 1,
  userSelectableOutputCount: true,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["保持原比例"],
  internalPrompt: "智能判断图像问题并进行高清增强、降噪和细节修复；保持原始内容准确，避免过度锐化或重绘。",
  refundOnFailure: true,
} as const;

export const detailPageWorkflow = {
  key: "product-detail-page",
  name: "商品详情页",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  pointsPerTask: Number(process.env.DETAIL_PAGE_TASK_POINTS || 10),
  outputsPerTask: 6,
  userSelectableOutputCount: false,
  structuredDetailCards: true,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxFileBytes: 10 * 1024 * 1024,
  aspectRatios: ["1:1", "3:4", "4:3", "9:16"],
  internalPrompt: "根据商品识别结果、用户信息和已确认卡片方案自动统一整套详情页的视觉语言，不使用固定场景或风格枚举。",
  refundOnFailure: true,
} as const;

export const whiteBackgroundWorkflow = { ...hdEnhanceWorkflow, key: "white-background", name: "白底图生成", pointsPerTask: Number(process.env.WHITE_BACKGROUND_TASK_POINTS || 5), internalPrompt: "精确保留商品主体、颜色、材质、边缘与标识，自动生成符合电商规范的纯白背景和自然轻投影。" } as const;
export const resizeImageWorkflow = { ...hdEnhanceWorkflow, key: "resize-image", name: "图片比例调整", pointsPerTask: Number(process.env.RESIZE_IMAGE_TASK_POINTS || 5), outputsPerTask: 1, aspectRatios: ["1:1", "3:4", "4:3", "9:16"], internalPrompt: "只延展主体以外的画面以适配目标比例，根据原图内容自动延续背景、光线和透视，不改变商品主体。" } as const;
export const recreateHeroWorkflow = { ...heroImageWorkflow, key: "recreate-product-hero", name: "复刻商品主图", pointsPerTask: Number(process.env.RECREATE_HERO_TASK_POINTS || 10), internalPrompt: "只参考输入图的构图层级、留白和商业节奏，为当前商品生成原创主图；场景与视觉表达由用户描述和参考图共同决定。" } as const;
export const recreateDetailWorkflow = { ...detailPageWorkflow, key: "recreate-detail-page", name: "复刻商详页", pointsPerTask: Number(process.env.RECREATE_DETAIL_TASK_POINTS || 10), internalPrompt: "只参考输入内容的模块节奏，为当前商品生成原创详情页卡片；整套视觉方向由商品、用户描述和卡片方案自动统一。" } as const;
export const recreateReferenceWorkflow = {
  ...sceneImageWorkflow,
  key: "recreate-reference-image",
  name: "复刻素材参考图",
  enabled: Boolean(imageProviderConfigured && process.env.COS_SECRET_ID),
  disabledReason: imageProviderConfigured && process.env.COS_SECRET_ID ? null : "PROVIDER_NOT_CONFIGURED",
  pointsPerTask: Number(process.env.RECREATE_REFERENCE_TASK_POINTS || 10),
  outputsPerTask: 1,
  userSelectableOutputCount: false,
  aspectRatios: ["16:9", "1:1", "3:4", "4:3", "9:16"],
  scenes: ["人物多视图", "商品多视图", "场景多视图"],
  styles: ["参考板", "隐私遮挡", "真实摄影"],
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
  minAssets: 1,
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

export const modelSpokespersonVideoWorkflow = {
  ...videoWorkflowBase,
  key: "model-spokesperson-video",
  name: "商品导演视频",
  minAssets: 1,
  scenes: ["口播讲解", "商品展示", "多视图讲解", "种草转化"],
  styles: ["自然口播", "专业讲解", "清晰转化", "镜头连贯"],
} as const;

export const videoMixWorkflow = { ...videoWorkflowBase, key: "video-mix", name: "智能混剪", minAssets: 2, durations: [15, 30, 45, 60], resolutions: ["720p", "1080p"], scenes: ["原音频混剪"], styles: ["自然转场"], pointsPerTask: Number(process.env.VIDEO_MIX_TASK_POINTS || 40) } as const;
