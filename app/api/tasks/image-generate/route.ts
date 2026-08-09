import { NextRequest } from "next/server";
import { imageGenerateWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(
    request,
    imageGenerateWorkflow,
    (body) => Array.isArray(body.assetIds) ? body.assetIds.filter((id): id is string => typeof id === "string") : [],
    undefined,
    undefined,
    (body) => ({
      imageProvider: body.imageProvider === "sophnet" ? "sophnet" : "gemini",
      imageResolution: body.imageResolution === "2K" ? "2K" : "1K",
    }),
  );
}
