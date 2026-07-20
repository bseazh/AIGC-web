import { NextRequest } from "next/server";
import { sceneImageWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, sceneImageWorkflow);
}
