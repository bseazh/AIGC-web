import { NextRequest } from "next/server";
import { detailPageWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";

export async function POST(request: NextRequest) {
  return createImageTask(request, detailPageWorkflow);
}
