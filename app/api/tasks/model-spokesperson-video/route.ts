import { NextRequest } from "next/server";

import { modelSpokespersonVideoWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(
    request,
    modelSpokespersonVideoWorkflow,
    (body) => {
      const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
      return assetIds.filter((id): id is string => typeof id === "string").slice(0, 6);
    },
    (assets) => {
      if (!assets.length) return "请先上传至少一张商品图片";
      if (assets.some((asset) => !asset.mime_type.startsWith("image/"))) return "商品导演视频只支持图片素材";
      if (assets.length > 6) return "最多可使用六张图片";
      return null;
    },
    (body) => (typeof body.prompt === "string" && body.prompt.trim() ? null : "请先生成视频提示词"),
    (body) => {
      const text = (value: unknown, max = 600) => (typeof value === "string" ? value.trim().slice(0, max) : "");
      const peopleMode = text(body.peopleMode, 40);
      const rawPrompt = text(body.prompt, 5000);
      const prompt = peopleMode === "no_people"
        ? [
            rawPrompt,
            "后端人物约束：用户已选择无真人模式，最终视频不得出现真人、模特、讲解者、可识别人脸或完整人体；允许使用商品、空间、安装/摆放过程、光影变化、镜头运动、局部工具或非人物操作线索来完成广告叙事。",
          ].join("\n")
        : rawPrompt;
      return {
        prompt,
        videoModel: text(body.videoModel, 80),
        executionMode: text(body.executionMode, 80),
        imageRatio: text(body.imageRatio, 40),
        productInfo: text(body.productInfo),
        specialRequirements: text(body.specialRequirements),
        appliedCaseId: text(body.appliedCaseId, 80),
        selectedPlanId: text(body.selectedPlanId, 80),
        peopleMode,
        generateAudio: body.generateAudio !== false,
      };
    },
  );
}
