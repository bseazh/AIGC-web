import { NextRequest } from "next/server";
import { recreateVideoWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, recreateVideoWorkflow, (body) => {
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    return assetIds.filter((id): id is string => typeof id === "string");
  }, (assets) => {
    if (!assets[0]?.mime_type.startsWith("image/")) return "商品图必须是第一项素材";
    if (assets[1]?.mime_type !== "video/mp4") return "复刻带货视频必须提供 MP4 参考视频";
    if (assets.length > 3 || assets.slice(2).some((asset) => !asset.mime_type.startsWith("audio/"))) return "仅可额外添加一条参考音频";
    return null;
  });
}
