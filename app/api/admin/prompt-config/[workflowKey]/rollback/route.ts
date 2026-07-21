import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ workflowKey: string }> }) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { workflowKey } = await params;
  const body = await request.json().catch(() => null) as { version?: unknown } | null;
  const version = Number(body?.version);
  if (!Number.isInteger(version) || version < 1) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const result = await db.query("UPDATE prompt_config_versions SET enabled = (version = $2) WHERE workflow_key = $1 RETURNING id", [workflowKey, version]);
  if (!result.rowCount) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ workflowKey, version, restored: result.rows.length });
}
