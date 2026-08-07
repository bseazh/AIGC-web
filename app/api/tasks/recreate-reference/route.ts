import { NextRequest, NextResponse } from "next/server";
import { recreateReferenceWorkflow } from "@/lib/product-config";
import { createImageTask } from "@/lib/task-creation";
import { structuredLog, requestContext } from "@/lib/logger";
import { authenticatedUser } from "@/lib/session";

function sanitizeDetails(value: unknown): unknown {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input).slice(0, 30)) {
    if (typeof raw === "string") output[key] = raw.slice(0, 240);
    else if (typeof raw === "number" || typeof raw === "boolean" || raw === null) output[key] = raw;
    else if (Array.isArray(raw)) output[key] = raw.slice(0, 10).map((item) => typeof item === "string" ? item.slice(0, 120) : item);
  }
  return output;
}

async function logClientTrace(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const stage = typeof body?.stage === "string" ? body.stage.slice(0, 80) : "unknown";
  structuredLog("info", "recreate_multiview_client_trace", {
    ...requestContext(request),
    userId: user.id,
    stage,
    details: sanitizeDetails(body?.details),
  });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.searchParams.get("debug") === "1") return logClientTrace(request);
  return createImageTask(
    request,
    recreateReferenceWorkflow,
    (body) => {
      if (Array.isArray(body.assetIds)) {
        return body.assetIds.filter((id): id is string => typeof id === "string").slice(0, 4);
      }
      return typeof body.assetId === "string" ? [body.assetId] : [];
    },
  );
}
