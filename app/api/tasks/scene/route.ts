import { NextRequest } from "next/server";
import { sceneImageWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(
    request,
    sceneImageWorkflow,
    (body) => {
      if (Array.isArray(body.assetIds)) return body.assetIds.filter((id): id is string => typeof id === "string").slice(0, 5);
      return [typeof body.assetId === "string" ? body.assetId : ""];
    },
    undefined,
    undefined,
    (body) => ({
      imageProvider: body.imageProvider === "gemini" ? "gemini" : "sophnet",
      imageResolution: body.imageResolution === "2K" ? "2K" : "1K",
    }),
  );
}
