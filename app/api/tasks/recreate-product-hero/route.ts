import { NextRequest } from "next/server";
import { createImageTask } from "@/lib/task-creation";
import { recreateHeroWorkflow } from "@/lib/product-config";
export async function POST(request: NextRequest) { return createImageTask(request, recreateHeroWorkflow); }
