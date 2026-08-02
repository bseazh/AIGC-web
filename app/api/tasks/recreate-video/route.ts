import { NextRequest } from "next/server";
import { recreateVideoWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(
    request,
    recreateVideoWorkflow,
    (body) => {
      const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
      return assetIds.filter((id): id is string => typeof id === "string");
    },
    (assets) => {
      const videoIndex = assets.findIndex(
        (asset) => asset.mime_type === "video/mp4",
      );
      if (videoIndex < 0) return "复刻带货视频必须提供 MP4 对标视频";
      if (assets.filter((asset) => asset.mime_type.startsWith("image/")).length > 8)
        return "素材池最多可添加八张图片";
      if (
        assets.length > 9 ||
        assets.some(
          (asset) =>
            !asset.mime_type.startsWith("image/") &&
            asset.mime_type !== "video/mp4",
        )
      )
        return "仅支持素材池图片和一段 MP4 对标视频";
      if (
        assets.filter((asset) => asset.mime_type === "video/mp4").length !== 1
      )
        return "只能上传一段对标视频";
      const referenceVideo = assets[videoIndex];
      const durationSeconds = Number(
        referenceVideo.metadata_json?.durationSeconds,
      );
      if (!Number.isFinite(durationSeconds))
        return "无法确认对标视频时长，请重新上传该 MP4 文件";
      if (durationSeconds < 3 || durationSeconds > 15)
        return "对标视频时长需在 3–15 秒之间";
      return null;
    },
    (body) =>
      body.usageAuthorized === true
        ? null
        : "请确认您拥有对标视频及素材的使用授权",
    () => ({
      referenceVideoAuthorization: {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        statementVersion: "recreate-video-authorization-v1",
      },
    }),
  );
}
