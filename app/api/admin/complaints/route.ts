import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";
import { createSignedObjectUrl } from "@/lib/cos";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const requestedStatus = request.nextUrl.searchParams.get("status") || "OPEN";
  const statuses = ["SUBMITTED", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];
  const params: string[] = [];
  let where = "c.status NOT IN ('RESOLVED', 'CLOSED')";
  if (statuses.includes(requestedStatus)) { params.push(requestedStatus); where = `c.status = $${params.length}`; }
  const result = await db.query<{ id: string; [key: string]: unknown }>(
    `SELECT c.id, c.complaint_no AS "complaintNo", c.task_id AS "taskId", c.issue_type AS "issueType",
            c.description, c.status, c.admin_note AS "adminNote", c.created_at AS "createdAt", c.updated_at AS "updatedAt",
            u.display_name AS "userName", COALESCE(u.email, u.phone, '-') AS identifier,
            COALESCE((SELECT json_agg(json_build_object('actorRole', e.actor_role, 'status', e.to_status, 'note', e.note, 'createdAt', e.created_at) ORDER BY e.created_at) FROM complaint_events e WHERE e.complaint_id = c.id), '[]') AS events
     FROM complaints c JOIN users u ON u.id = c.user_id WHERE ${where}
     ORDER BY CASE c.status WHEN 'SUBMITTED' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, c.created_at ASC LIMIT 100`,
    params,
  );
  const ids = result.rows.map((complaint) => complaint.id);
  const attachmentRows = ids.length ? await db.query<{ complaint_id: string; id: string; mime_type: string; original_name: string | null; storage_key: string }>(
    `SELECT ca.complaint_id, a.id, a.mime_type, a.original_name, a.storage_key
     FROM complaint_attachments ca JOIN assets a ON a.id = ca.asset_id
     WHERE ca.complaint_id = ANY($1::uuid[]) ORDER BY a.created_at`,
    [ids],
  ) : { rows: [] };
  const attachments = new Map<string, Array<{ id: string; mimeType: string; originalName: string; previewUrl: string }>>();
  for (const attachment of attachmentRows.rows) {
    const item = { id: attachment.id, mimeType: attachment.mime_type, originalName: attachment.original_name || "投诉附件", previewUrl: await createSignedObjectUrl(attachment.storage_key, "GET", 900) };
    attachments.set(attachment.complaint_id, [...(attachments.get(attachment.complaint_id) || []), item]);
  }
  return NextResponse.json({ complaints: result.rows.map((complaint) => ({ ...complaint, attachments: attachments.get(complaint.id) || [] })) });
}
