import { PoolClient } from "pg";

export type PromptConfig = {
  id: string | null;
  workflowKey: string;
  version: number;
  variantKey: string;
  template: string;
  watermark: boolean;
};

type ConfigRow = { id: string; workflow_key: string; version: number; variant_key: string; rollout_percent: number; config_json: { template?: unknown; watermark?: unknown } };

const fallbackTemplates: Record<string, string> = {
  "product-ad-video": "将输入的产品图片制作成高品质商品广告大片。综合识别全部图片中的材质、颜色、细节与卖点，围绕商品设计开场、细节、使用或氛围镜头和收束镜头。",
  "recreate-video": "参考视频只用于提取镜头节奏、景别、运镜与转场结构。不得复制原视频中的人物、品牌、商品、文案或具体画面；使用输入商品生成原创带货短片。参考音频仅用于节奏参考，生成全新的声音内容。",
  "seedance-video": "按用户脚本和全部参考素材生成原创短片，优先遵循首帧、尾帧、参考视频与参考音频的角色定义。",
};

function bucket(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 100;
}

export async function resolvePromptConfig(client: PoolClient, workflowKey: string, userId: string): Promise<PromptConfig> {
  const result = await client.query<ConfigRow>(
    "SELECT id, workflow_key, version, variant_key, rollout_percent, config_json FROM prompt_config_versions WHERE workflow_key = $1 AND enabled = TRUE ORDER BY version DESC, created_at ASC",
    [workflowKey],
  );
  const target = bucket(`${workflowKey}:${userId}`);
  const versions = [...new Set(result.rows.map((row) => row.version))];
  let selected: ConfigRow | undefined;
  for (const version of versions) {
    const candidates = result.rows.filter((row) => row.version === version);
    let cumulative = 0;
    selected = candidates.find((row) => { cumulative += row.rollout_percent; return target < cumulative; });
    if (selected) break;
  }
  if (!selected) return { id: null, workflowKey, version: 0, variantKey: "fallback", template: fallbackTemplates[workflowKey] || "", watermark: false };
  return {
    id: selected.id,
    workflowKey,
    version: selected.version,
    variantKey: selected.variant_key,
    template: typeof selected.config_json.template === "string" ? selected.config_json.template.slice(0, 4000) : fallbackTemplates[workflowKey] || "",
    watermark: selected.config_json.watermark === true,
  };
}
