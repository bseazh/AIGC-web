import { db } from "@/lib/db";
export async function storageSummary(userId: string) {
  await db.query("INSERT INTO user_storage_quotas (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const result = await db.query<{ quota_bytes: string; used_bytes: string }>("SELECT q.quota_bytes::text, COALESCE((SELECT SUM(byte_size) FROM assets WHERE owner_id=$1 AND audit_status IN ('UPLOADING','READY')),0)::text AS used_bytes FROM user_storage_quotas q WHERE q.user_id=$1", [userId]);
  return { quotaBytes: Number(result.rows[0]?.quota_bytes || 1073741824), usedBytes: Number(result.rows[0]?.used_bytes || 0) };
}
