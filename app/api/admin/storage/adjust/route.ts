import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

const GIB = 1024 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const quotaBytes = Number(body?.quotaBytes);
  if (typeof body?.userId !== "string" || !Number.isInteger(quotaBytes) || quotaBytes < 0 || quotaBytes > 1024 * GIB) {
    return NextResponse.json({ code: "INVALID_QUOTA", message: "配额必须是 0 到 1024 GiB 之间的整数。" }, { status: 400 });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>("SELECT id FROM users WHERE id = $1 FOR UPDATE", [body.userId]);
    if (!user.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ code: "USER_NOT_FOUND" }, { status: 404 }); }
    const previous = await client.query<{ quota_bytes: string }>("SELECT quota_bytes::text FROM user_storage_quotas WHERE user_id = $1", [body.userId]);
    await client.query("INSERT INTO user_storage_quotas (user_id, quota_bytes, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET quota_bytes = EXCLUDED.quota_bytes, updated_at = NOW()", [body.userId, quotaBytes]);
    await client.query("COMMIT");
    await audit(administrator.id, "ADMIN_STORAGE_QUOTA_UPDATED", request, { type: "user", id: body.userId }, { previousQuotaBytes: Number(previous.rows[0]?.quota_bytes || GIB), quotaBytes });
    return NextResponse.json({ ok: true, quotaBytes });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("storage quota adjustment failed", error);
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  } finally {
    client.release();
  }
}
