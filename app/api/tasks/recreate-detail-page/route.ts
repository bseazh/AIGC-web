import { NextRequest } from "next/server";
import { createImageTask } from "@/lib/task-creation";
import { recreateDetailWorkflow } from "@/lib/product-config";
export async function POST(request: NextRequest) { return createImageTask(request, recreateDetailWorkflow); }
