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
      if (assets.some((asset) => !asset.mime_type.startsWith("image/"))) return "AI 模特口播视频只支持图片素材";
      if (assets.length > 6) return "最多可使用六张图片";
      return null;
    },
    (body) => (typeof body.prompt === "string" && body.prompt.trim() ? null : "请先生成视频提示词"),
    (body) => {
      const text = (value: unknown, max = 600) => (typeof value === "string" ? value.trim().slice(0, max) : "");
      return {
        videoModel: text(body.videoModel, 80),
        executionMode: text(body.executionMode, 80),
        imageRatio: text(body.imageRatio, 40),
        productInfo: text(body.productInfo),
        specialRequirements: text(body.specialRequirements),
        appliedCaseId: text(body.appliedCaseId, 80),
        selectedPlanId: text(body.selectedPlanId, 80),
      };
    },
  );
}
