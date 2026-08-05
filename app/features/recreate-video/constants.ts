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
  { key: "clip", number: 2, title: "十二宫格抽帧", subtitle: "锁定复刻节奏与画面" },
  { key: "product", number: 3, title: "复刻口令与素材", subtitle: "一句话说明怎么替换" },
  { key: "reference", number: 4, title: "内置复刻策略", subtitle: "自动整理镜头与替换关系" },
  { key: "generate", number: 5, title: "提交生成", subtitle: "开始任务输出" },
];

export const chineseNumbers = ["一", "二", "三", "四", "五", "六", "七", "八"];

export const materialLabel = (index: number) => `图片${chineseNumbers[index] || index + 1}`;
