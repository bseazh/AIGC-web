import { NextRequest } from "next/server";
import { productAdVideoWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, productAdVideoWorkflow, (body) => {
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    return assetIds.filter((id): id is string => typeof id === "string");
  }, (assets) => {
    if (!assets[0]?.mime_type.startsWith("image/")) return "首帧商品图必须是图片";
    if (assets.some((asset) => !asset.mime_type.startsWith("image/") && !asset.mime_type.startsWith("audio/"))) return "产品广告大片只支持图片和参考音频";
    if (assets.filter((asset) => asset.mime_type.startsWith("image/")).length > 2) return "最多可使用两张图片";
    if (assets.filter((asset) => asset.mime_type.startsWith("audio/")).length > 1) return "最多可使用一条参考音频";
    return null;
  });
}
