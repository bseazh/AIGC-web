import { NextRequest } from "next/server";
import { imageGenerateWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(
    request,
    imageGenerateWorkflow,
    (body) => Array.isArray(body.assetIds) ? body.assetIds.filter((id): id is string => typeof id === "string") : [],
    undefined,
    (body) => {
      const provider = body.imageProvider === "sophnet" ? "sophnet" : "gemini";
      const assetIds = Array.isArray(body.assetIds) ? body.assetIds.filter((id) => typeof id === "string") : [];
      if (provider === "sophnet" && assetIds.length === 0) {
        return "智能生图-IG-2.0 当前为参考图编辑模型，请至少上传一张参考图，或改用 Gemini 文生图";
      }
      return null;
    },
    (body) => ({
      imageProvider: body.imageProvider === "sophnet" ? "sophnet" : "gemini",
      imageResolution: body.imageResolution === "2K" ? "2K" : "1K",
    }),
  );
}
