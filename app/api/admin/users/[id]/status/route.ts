import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator, isAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const status = body?.status === "ACTIVE" ? "ACTIVE" : body?.status === "SUSPENDED" ? "SUSPENDED" : null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!status || (status === "SUSPENDED" && !reason)) return NextResponse.json({ code: "INVALID_STATUS", message: "冻结账号时必须填写原因" }, { status: 400 });
  if (id === administrator.id) return NextResponse.json({ code: "SELF_STATUS_CHANGE", message: "不能冻结当前管理员账号" }, { status: 409 });
  const client = await db.connect();
  let previousStatus = "";
  try {
    await client.query("BEGIN");
    const found = await client.query<{ status: string; email: string | null; phone: string | null }>("SELECT status, email, phone FROM users WHERE id = $1 FOR UPDATE", [id]);
    const user = found.rows[0];
    if (!user) { await client.query("ROLLBACK"); return NextResponse.json({ code: "USER_NOT_FOUND" }, { status: 404 }); }
    if (!["ACTIVE", "SUSPENDED"].includes(user.status)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "STATUS_NOT_MANAGEABLE", message: "该账号状态不能通过冻结/解封操作修改" }, { status: 409 }); }
    if (isAdministrator(user.email || user.phone)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "ADMIN_PROTECTED", message: "管理员账号不能在此冻结" }, { status: 409 }); }
    previousStatus = user.status;
    await client.query("UPDATE users SET status = $2, token_version = token_version + CASE WHEN $2 = 'SUSPENDED' THEN 1 ELSE 0 END, updated_at = NOW() WHERE id = $1", [id, status]);
    if (status === "SUSPENDED") await client.query("UPDATE login_sessions SET revoked_at = NOW(), revoke_reason = 'ACCOUNT_SUSPENDED' WHERE user_id = $1 AND revoked_at IS NULL", [id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); console.error("user status change failed", error); return NextResponse.json({ code: "STATUS_CHANGE_FAILED" }, { status: 500 }); }
  finally { client.release(); }
  await audit(administrator.id, status === "SUSPENDED" ? "ADMIN_USER_SUSPENDED" : "ADMIN_USER_REACTIVATED", request, { type: "user", id }, { previousStatus, status, reason });
  return NextResponse.json({ userId: id, status });
}
