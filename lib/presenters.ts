export const workflowNames: Record<string, string> = {
  "product-hero-image": "商品主图",
  "scene-image": "场景图生成",
  "model-wear": "模特穿搭",
  "hd-enhance": "高清优化",
  "product-detail-page": "商品详情页",
  "product-ad-video": "产品广告大片",
  "recreate-video": "复刻带货视频",
  "seedance-video": "Seedance2 视频",
};

export const taskStatusLabels: Record<string, string> = {
  DRAFT: "草稿",
  QUEUED: "排队中",
  RUNNING: "生成中",
  SUCCEEDED: "已完成",
  FAILED: "失败",
  REJECTED: "未通过审核",
  CANCELED: "已取消",
};

export function workflowName(key: string) {
  return workflowNames[key] || key;
}

export function taskStatusLabel(status: string) {
  return taskStatusLabels[status] || status;
}
