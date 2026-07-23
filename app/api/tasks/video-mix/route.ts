import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { createImageTask } from "@/lib/task-creation";
import { videoMixWorkflow } from "@/lib/product-config";

const consentVersion = "video-source-authorization-v1";
export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.clone().json().catch(() => null) as { assetIds?: unknown; authorizationConfirmed?: unknown } | null;
  if (body?.authorizationConfirmed !== true) return NextResponse.json({ code: "AUTHORIZATION_REQUIRED", message: "请确认拥有全部素材的合法使用授权" }, { status: 400 });
  const response = await createImageTask(request, videoMixWorkflow, (input) => Array.isArray(input.assetIds) ? input.assetIds.filter((id): id is string => typeof id === "string").slice(0, 10) : [], (assets) => assets.length < 2 || assets.some((asset) => asset.mime_type !== "video/mp4") ? "请至少选择两段 MP4 视频素材" : null, undefined, () => ({ consentVersion }));
  const result = await response.json() as { taskId?: string };
  if (response.ok && result.taskId) await db.query("INSERT INTO content_authorizations (user_id, task_id, consent_version, consent_json, ip_address, user_agent) VALUES ($1,$2,$3,$4::jsonb,$5,$6)", [user.id, result.taskId, consentVersion, JSON.stringify({ confirmed: true, purpose: "video_mix" }), request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, request.headers.get("user-agent") || null]);
  return NextResponse.json(result, { status: response.status });
}
