import type { WorkflowStep } from "./types";

export const recreateWorkflowKey = "recreate-video";
export const imageAccept = "image/jpeg,image/png,image/webp";
export const draftStorageKey = "aigc-recreate-flow-draft";

export const workflowSteps: Array<{
  key: WorkflowStep;
  number: number;
  title: string;
  subtitle: string;
}> = [
  { key: "source", number: 1, title: "添加对标视频", subtitle: "抖音获取或本地上传" },
  { key: "product", number: 2, title: "素材与提示词", subtitle: "上传替换素材，说明想改什么" },
  { key: "generate", number: 3, title: "提交生成", subtitle: "确认参数并开始输出" },
];

export const chineseNumbers = ["一", "二", "三", "四", "五", "六", "七", "八"];

export const materialLabel = (index: number) => `图片${chineseNumbers[index] || index + 1}`;
