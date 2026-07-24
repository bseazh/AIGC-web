import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions, validPassword, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";
import { createSignedObjectUrl, removeObject } from "@/lib/cos";

const avatarStyles = new Set(["ocean", "coral", "forest", "plum", "sun"]);

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const result = await db.query<{ display_name: string; email: string | null; phone: string | null; created_at: string; avatar_style: string; avatar_key: string | null }>("SELECT u.display_name, u.email, u.phone, u.created_at, u.avatar_style, a.storage_key AS avatar_key FROM users u LEFT JOIN assets a ON a.id = u.avatar_asset_id AND a.owner_id = u.id AND a.audit_status = 'READY' WHERE u.id = $1", [user.id]);
  const profile = result.rows[0];
  if (!profile) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ displayName: profile.display_name, identifier: profile.email || profile.phone || "-", createdAt: profile.created_at, avatarStyle: profile.avatar_style, avatarUrl: profile.avatar_key ? await createSignedObjectUrl(profile.avatar_key, "GET", 3600) : null });
}

export async function PATCH(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 32) : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const avatarStyle = typeof body?.avatarStyle === "string" && avatarStyles.has(body.avatarStyle) ? body.avatarStyle : "ocean";
  const avatarAssetId = typeof body?.avatarAssetId === "string" ? body.avatarAssetId : null;
  const avatarAction = body?.avatarAction === "preset" ? "preset" : avatarAssetId ? "custom" : "keep";
  if (!displayName) return NextResponse.json({ code: "INVALID_NAME", message: "请输入 1–32 个字符的昵称" }, { status: 400 });
  if (newPassword && !validPassword(newPassword)) return NextResponse.json({ code: "INVALID_PASSWORD", message: "新密码长度需为 8–72 位" }, { status: 400 });
  if (newPassword && !currentPassword) return NextResponse.json({ code: "CURRENT_PASSWORD_REQUIRED", message: "修改密码需要输入当前密码" }, { status: 400 });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ password_hash: string; token_version: number; avatar_asset_id: string | null; avatar_key: string | null }>("SELECT u.password_hash, u.token_version, u.avatar_asset_id, a.storage_key AS avatar_key FROM users u LEFT JOIN assets a ON a.id = u.avatar_asset_id WHERE u.id = $1 FOR UPDATE", [user.id]);
    const current = result.rows[0];
    if (!current) { await client.query("ROLLBACK"); return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 }); }
    if (newPassword && !(await verifyPassword(currentPassword, current.password_hash))) {
      await client.query("ROLLBACK");
      return NextResponse.json({ code: "INVALID_CURRENT_PASSWORD", message: "当前密码不正确" }, { status: 400 });
    }
    const tokenVersion = current.token_version + (newPassword ? 1 : 0);
    if (avatarAssetId) { const asset = await client.query("SELECT id FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY' AND mime_type IN ('image/jpeg','image/png','image/webp')", [avatarAssetId, user.id]); if (!asset.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INVALID_AVATAR", message: "头像图片不可用" }, { status: 400 }); } }
    const nextAvatarId = avatarAction === "preset" ? null : avatarAction === "custom" ? avatarAssetId : current.avatar_asset_id;
    await client.query("UPDATE users SET display_name = $2, password_hash = COALESCE($3, password_hash), token_version = $4, avatar_style = $5, avatar_asset_id = $6, updated_at = NOW() WHERE id = $1", [user.id, displayName, newPassword ? await hashPassword(newPassword) : null, tokenVersion, avatarStyle, nextAvatarId]);
    await client.query("COMMIT");
    if (current.avatar_asset_id && current.avatar_asset_id !== nextAvatarId && current.avatar_key) {
      try { await removeObject(current.avatar_key); await db.query("DELETE FROM assets WHERE id = $1 AND owner_id = $2", [current.avatar_asset_id, user.id]); }
      catch (cleanupError) { console.error("old avatar cleanup failed", cleanupError); }
    }
    const response = NextResponse.json({ displayName, passwordChanged: Boolean(newPassword), avatarStyle, avatarAssetId: nextAvatarId });
    if (newPassword) response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, tokenVersion), sessionCookieOptions());
    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("account update failed", error);
    return NextResponse.json({ code: "ACCOUNT_UPDATE_FAILED", message: "账户信息保存失败，请稍后重试" }, { status: 500 });
  } finally { client.release(); }
}
