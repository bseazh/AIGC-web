import { NextRequest } from "next/server";
import { modelWearWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, modelWearWorkflow, (body) => {
    const modelAssetId = typeof body.modelAssetId === "string" ? body.modelAssetId : "";
    const productAssetIds = Array.isArray(body.productAssetIds) ? body.productAssetIds.filter((id): id is string => typeof id === "string").slice(0, 4) : [];
    return [modelAssetId, ...productAssetIds];
  });
}
