import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

const workflows = new Set(["product-ad-video", "recreate-video", "seedance-video"]);

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const result = await db.query("SELECT id, workflow_key AS \"workflowKey\", version, variant_key AS \"variantKey\", rollout_percent AS \"rolloutPercent\", config_json AS config, enabled, created_at AS \"createdAt\" FROM prompt_config_versions ORDER BY workflow_key, version DESC, variant_key");
  return NextResponse.json({ versions: result.rows });
}

export async function POST(request: NextRequest) {
  const admin = await authenticatedAdministrator(request);
  if (!admin) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const workflowKey = typeof body?.workflowKey === "string" ? body.workflowKey : "";
  const template = typeof body?.template === "string" ? body.template.trim().slice(0, 4000) : "";
  const variantKey = typeof body?.variantKey === "string" ? body.variantKey.trim().slice(0, 50) : "control";
  const rolloutPercent = Number(body?.rolloutPercent);
  const requestedVersion = Number(body?.version);
  if (!workflows.has(workflowKey) || !template || !variantKey || !Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) return NextResponse.json({ code: "INVALID_REQUEST", message: "配置参数不正确" }, { status: 400 });
  const versionResult = await db.query<{ version: number }>("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM prompt_config_versions WHERE workflow_key = $1", [workflowKey]);
  const version = Number.isInteger(requestedVersion) && requestedVersion > 0 ? requestedVersion : versionResult.rows[0].version;
  const result = await db.query("INSERT INTO prompt_config_versions (workflow_key, version, variant_key, rollout_percent, config_json, created_by) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id, version", [workflowKey, version, variantKey, rolloutPercent, JSON.stringify({ template, watermark: body?.watermark === true }), admin.id]);
  return NextResponse.json({ version: result.rows[0] }, { status: 201 });
}
