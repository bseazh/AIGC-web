import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const execute = promisify(execFile);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { id } = await context.params;
  const found = await db.query<{ operation: string; status: string }>("SELECT operation, status FROM operations_runs WHERE id = $1", [id]);
  const operation = found.rows[0];
  if (!operation) return NextResponse.json({ code: "OPERATION_NOT_FOUND" }, { status: 404 });
  if (operation.status !== "FAILED") return NextResponse.json({ code: "OPERATION_NOT_FAILED", message: "只有失败的运维任务可以重试" }, { status: 409 });
  const scriptByOperation: Record<string, string> = { STORAGE_CLEANUP: "scripts/storage-cleanup.mjs", LIFECYCLE_MAINTENANCE: "scripts/lifecycle-maintenance.mjs" };
  const script = scriptByOperation[operation.operation];
  if (!script) return NextResponse.json({ code: "OPERATION_NOT_WEB_RETRYABLE", message: "此操作需要在受控运维终端重试" }, { status: 409 });
  try {
    const result = await execute(process.execPath, [script], { cwd: process.cwd(), timeout: 10 * 60_000, maxBuffer: 1024 * 1024 });
    await audit(administrator.id, "ADMIN_OPERATION_RETRIED", request, { type: "operations_run", id }, { operation: operation.operation });
    return NextResponse.json({ ok: true, operation: operation.operation, output: result.stdout.trim().slice(0, 2000) });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "OPERATION_RETRY_FAILED";
    await db.query("INSERT INTO operations_runs (operation, status, summary) VALUES ($1, 'FAILED', $2)", [operation.operation, `Admin retry of ${id}: ${message}`]);
    await audit(administrator.id, "ADMIN_OPERATION_RETRY_FAILED", request, { type: "operations_run", id }, { operation: operation.operation, message });
    return NextResponse.json({ code: "OPERATION_RETRY_FAILED", message: "运维任务重试失败" }, { status: 500 });
  }
}
