export const projectWorkflows = {
  "image-generate": { title: "AI生图", startPath: "/create/image-generate" },
  "product-hero-image": { title: "商品主图", startPath: "/create/product-hero" },
  "scene-image": { title: "场景图生成", startPath: "/create/scene-image" },
  "commerce-model": { title: "带货模特", startPath: "/create/commerce-model" },
  "model-wear": { title: "模特穿搭", startPath: "/create/model-wear" },
  "hd-enhance": { title: "高清优化", startPath: "/create/hd-enhance" },
  "white-background": { title: "白底图生成", startPath: "/create/white-background" },
  "resize-image": { title: "图片比例调整", startPath: "/create/resize-image" },
  "product-detail-page": { title: "商品详情页", startPath: "/create/product-detail" },
  "recreate-product-hero": { title: "复刻商品主图", startPath: "/create/recreate-product-hero" },
  "recreate-detail-page": { title: "复刻商详页", startPath: "/create/recreate-detail-page" },
  "product-ad-video": { title: "产品广告大片", startPath: "/create/product-ad-video" },
  "recreate-video": { title: "复刻带货视频", startPath: "/create/recreate-video" },
  "video-mix": { title: "智能混剪", startPath: "/create/video-mix" },
  "model-spokesperson-script": { title: "商品口播导演", startPath: "/create/model-spokesperson-video" },
  "seedance-video": { title: "Seedance2 视频", startPath: "/create/seedance-video" },
} as const;

export type ProjectWorkflowKey = keyof typeof projectWorkflows;

export const projectWorkflowKeys = Object.keys(projectWorkflows) as ProjectWorkflowKey[];

export function isProjectWorkflowKey(value: unknown): value is ProjectWorkflowKey {
  return typeof value === "string" && value in projectWorkflows;
}

export function projectStartHref(workflowKey: ProjectWorkflowKey, projectId?: string) {
  const path = projectWorkflows[workflowKey].startPath;
  return projectId ? appendProjectId(path, projectId) : path;
}

export function projectGateHref(workflowKey: ProjectWorkflowKey, nextPath?: string) {
  const workflow = projectWorkflows[workflowKey];
  return `/create/project?workflowKey=${encodeURIComponent(workflowKey)}&next=${encodeURIComponent(nextPath || workflow.startPath)}`;
}

export function appendProjectId(href: string, projectId: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}projectId=${encodeURIComponent(projectId)}`;
}
