import { NextRequest, NextResponse } from "next/server";
import { inspectObject } from "@/lib/cos";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.assetId !== "string") {
    return NextResponse.json({ code: "INVALID_ASSET" }, { status: 400 });
  }
  const result = await db.query<{ id: string; storage_key: string; byte_size: string; mime_type: string }>(
    "SELECT id, storage_key, byte_size, mime_type FROM assets WHERE id = $1 AND owner_id = $2 AND audit_status = 'UPLOADING'",
    [body.assetId, user.id],
  );
  const asset = result.rows[0];
  if (!asset) return NextResponse.json({ code: "ASSET_NOT_FOUND" }, { status: 404 });

  try {
    const metadata = await inspectObject(asset.storage_key);
    const actualSize = metadata.contentLength;
    const actualType = metadata.contentType;
    if (actualSize !== Number(asset.byte_size) || (actualType && actualType !== asset.mime_type)) {
      return NextResponse.json({ code: "UPLOAD_MISMATCH", message: "上传文件校验失败" }, { status: 400 });
    }
    await db.query("UPDATE assets SET audit_status = 'READY' WHERE id = $1", [asset.id]);
    return NextResponse.json({ assetId: asset.id, status: "READY" });
  } catch (error) {
    console.error("upload confirmation failed", error);
    return NextResponse.json({ code: "UPLOAD_NOT_FOUND", message: "尚未检测到上传文件" }, { status: 400 });
  }
}
