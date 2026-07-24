import { db } from "@/lib/db";
import { structuredLog } from "@/lib/logger";
export async function audit(userId: string | null, eventType: string, request?: Request, resource?: { type: string; id: string }, details: Record<string, unknown> = {}) {
  const enriched = { requestId: request?.headers.get("x-request-id") || undefined, ...details };
  await db.query("INSERT INTO audit_events (user_id,event_type,resource_type,resource_id,ip_address,user_agent,details_json) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)", [userId, eventType, resource?.type || null, resource?.id || null, request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null, request?.headers.get("user-agent") || null, JSON.stringify(enriched)]).catch((error) => structuredLog("error", "audit_write_failed", { eventType, userId, error }));
}
