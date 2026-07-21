import { NextRequest, NextResponse } from "next/server";
import { createSignedObjectUrl } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export const runtime = "nodejs";

function downloadName(name: string | null, mimeType: string) {
  if (name) return name.replace(/[\\/:*?"<>|]/g, "_");
  return mimeType.startsWith("video/") ? "generated-video.mp4" : "generated-image.png";
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  const result = await db.query<{ storage_key: string; mime_type: string; original_name: string | null }>(
    "SELECT storage_key, mime_type, original_name FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'READY'", [id, user.id],
  );
  const asset = result.rows[0];
  if (!asset) return NextResponse.json({ code: "ASSET_NOT_FOUND" }, { status: 404 });
  const source = await fetch(await createSignedObjectUrl(asset.storage_key, "GET", 300));
  if (!source.ok || !source.body) return NextResponse.json({ code: "DOWNLOAD_UNAVAILABLE" }, { status: 502 });
  return new NextResponse(source.body, {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName(asset.original_name, asset.mime_type))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
