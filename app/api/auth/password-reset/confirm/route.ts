import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword, validPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { requestIp } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 32 || !validPassword(body?.password)) return NextResponse.json({ code: "INVALID_RESET", message: "重置链接无效或密码长度不符合要求" }, { status: 400 });
  const digest = createHash("sha256").update(token).digest("hex");
  const passwordHash = await hashPassword(body.password);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM password_reset_tokens WHERE token_digest = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE",
      [digest],
    );
    const reset = found.rows[0];
    if (!reset) { await client.query("ROLLBACK"); return NextResponse.json({ code: "RESET_EXPIRED", message: "重置链接已失效，请重新申请" }, { status: 400 }); }
    await client.query("UPDATE users SET password_hash = $2, token_version = token_version + 1, updated_at = NOW() WHERE id = $1", [reset.user_id, passwordHash]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [reset.user_id]);
    await client.query("UPDATE login_sessions SET revoked_at = NOW(), revoke_reason = 'PASSWORD_RESET' WHERE user_id = $1 AND revoked_at IS NULL", [reset.user_id]);
    await client.query(
      "INSERT INTO audit_events (user_id, event_type, resource_type, resource_id, ip_address, user_agent, details_json) VALUES ($1, 'PASSWORD_RESET_COMPLETED', 'USER', $1, $2, $3, '{}'::jsonb)",
      [reset.user_id, requestIp(request), request.headers.get("user-agent")],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) { await client.query("ROLLBACK"); console.error("password reset failed", error); return NextResponse.json({ code: "RESET_FAILED", message: "密码重置失败，请稍后再试" }, { status: 500 }); }
  finally { client.release(); }
}
