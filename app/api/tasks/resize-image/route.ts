import { NextRequest } from "next/server";
import { createImageTask } from "@/lib/task-creation";
import { resizeImageWorkflow } from "@/lib/product-config";
export async function POST(request: NextRequest) { return createImageTask(request, resizeImageWorkflow); }
