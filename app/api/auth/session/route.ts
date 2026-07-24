import { NextRequest, NextResponse } from "next/server";
import { isAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";
import { createSignedObjectUrl } from "@/lib/cos";
import { authenticatedUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const authenticated = await authenticatedUser(request);
  if (!authenticated) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const result = await db.query<{
    id: string;
    email: string | null;
    phone: string | null;
    display_name: string;
    token_version: number;
    available_points: number;
    frozen_points: number;
    avatar_style: string;
    avatar_key: string | null;
  }>(
    `SELECT u.id, u.email, u.phone, u.display_name, u.token_version,
            w.available_points, w.frozen_points, u.avatar_style, a.storage_key AS avatar_key
     FROM users u JOIN wallets w ON w.user_id = u.id
     LEFT JOIN assets a ON a.id = u.avatar_asset_id AND a.owner_id = u.id AND a.audit_status = 'READY'
     WHERE u.id = $1 AND u.status = 'ACTIVE'`,
    [authenticated.id],
  );
  const user = result.rows[0];
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  return NextResponse.json({
    user: {
      id: user.id,
      identifier: user.email || user.phone,
      displayName: user.display_name,
      avatarStyle: user.avatar_style,
      avatarUrl: user.avatar_key ? await createSignedObjectUrl(user.avatar_key, "GET", 3600) : null,
      isAdministrator: isAdministrator(user.email || user.phone),
    },
    wallet: {
      availablePoints: user.available_points,
      frozenPoints: user.frozen_points,
    },
  });
}
