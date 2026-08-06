import { NextRequest } from "next/server";
import { commerceModelWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, commerceModelWorkflow, (body) => Array.isArray(body.assetIds) ? body.assetIds.filter((id): id is string => typeof id === "string") : []);
}
