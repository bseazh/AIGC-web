import { NextRequest } from "next/server";
import { hdEnhanceWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, hdEnhanceWorkflow);
}
