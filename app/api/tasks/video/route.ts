import { NextRequest } from "next/server";
import { seedanceVideoWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, seedanceVideoWorkflow, (body) => {
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    return assetIds.filter((id): id is string => typeof id === "string");
  }, (assets) => {
    if (!assets[0]?.mime_type.startsWith("image/")) return "首帧素材必须是图片";
    if (assets.filter((asset) => asset.mime_type.startsWith("image/")).length > 2) return "最多可使用两张图片";
    if (assets.filter((asset) => asset.mime_type === "video/mp4").length > 1 || assets.filter((asset) => asset.mime_type.startsWith("audio/")).length > 1) return "最多可使用一段参考视频和一条参考音频";
    if (assets.some((asset) => !asset.mime_type.startsWith("image/") && asset.mime_type !== "video/mp4" && !asset.mime_type.startsWith("audio/"))) return "素材格式不受支持";
    return null;
  });
}
