import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { createRechargeCode, digestRechargeCode, normalizeRechargeCode } from "@/lib/recharge-codes";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const result = await db.query(`SELECT c.id, c.code_hint, c.points, c.max_redemptions, c.redeemed_count, c.status, c.note, c.expires_at, c.created_at,
    COALESCE(u.display_name, '系统管理员') AS created_by_name
    FROM recharge_codes c LEFT JOIN users u ON u.id = c.created_by ORDER BY c.created_at DESC LIMIT 100`);
  return NextResponse.json({ codes: result.rows });
}

export async function POST(request: NextRequest) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const points = Number(body?.points);
  const maxRedemptions = Number(body?.maxRedemptions ?? 1);
  if (!Number.isInteger(points) || points < 1 || points > 1_000_000) return NextResponse.json({ message: "积分须为 1–1,000,000 的整数" }, { status: 400 });
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 10_000) return NextResponse.json({ message: "可兑换次数须为 1–10,000 的整数" }, { status: 400 });
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) return NextResponse.json({ message: "有效期必须晚于当前时间" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "";
  const code = createRechargeCode();
  const normalized = normalizeRechargeCode(code)!;
  const result = await db.query<{ id: string }>(`INSERT INTO recharge_codes
    (code_digest, code_hint, points, max_redemptions, note, expires_at, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [digestRechargeCode(normalized), `BALA…${normalized.slice(-4)}`, points, maxRedemptions, note || null, expiresAt?.toISOString() || null, administrator.id]);
  await audit(administrator.id, "ADMIN_RECHARGE_CODE_CREATED", request, { type: "recharge_code", id: result.rows[0].id }, { points, maxRedemptions, expiresAt: expiresAt?.toISOString() || null, note });
  return NextResponse.json({ id: result.rows[0].id, code, points, maxRedemptions }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !["ACTIVE", "DISABLED"].includes(body?.status)) return NextResponse.json({ message: "请求参数错误" }, { status: 400 });
  const result = await db.query("UPDATE recharge_codes SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id", [body.id, body.status]);
  if (!result.rowCount) return NextResponse.json({ message: "兑换码不存在" }, { status: 404 });
  await audit(administrator.id, "ADMIN_RECHARGE_CODE_STATUS_CHANGED", request, { type: "recharge_code", id: body.id }, { status: body.status });
  return NextResponse.json({ ok: true });
}
