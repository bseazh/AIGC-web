import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

const issueTypes = new Set(["GENERATION_QUALITY", "CONTENT_SAFETY", "COPYRIGHT", "BILLING", "PRIVACY", "OTHER"]);

function complaintNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `CMP-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const result = await db.query<{
    id: string; complaint_no: string; task_id: string | null; issue_type: string; description: string;
    status: string; admin_note: string | null; created_at: string; updated_at: string; closed_at: string | null;
  }>("SELECT id, complaint_no, task_id, issue_type, description, status, admin_note, created_at, updated_at, closed_at FROM complaints WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [user.id]);
  const ids = result.rows.map((item) => item.id);
  const events = ids.length ? await db.query<{ complaint_id: string; actor_role: string; to_status: string; note: string | null; created_at: string }>(
    "SELECT complaint_id, actor_role, to_status, note, created_at FROM complaint_events WHERE complaint_id = ANY($1::uuid[]) ORDER BY created_at ASC",
    [ids],
  ) : { rows: [] };
  const eventMap = new Map<string, typeof events.rows>();
  for (const event of events.rows) eventMap.set(event.complaint_id, [...(eventMap.get(event.complaint_id) || []), event]);
  return NextResponse.json({ complaints: result.rows.map((item) => ({
    id: item.id, complaintNo: item.complaint_no, taskId: item.task_id, issueType: item.issue_type,
    description: item.description, status: item.status, adminNote: item.admin_note, createdAt: item.created_at,
    updatedAt: item.updated_at, closedAt: item.closed_at, events: eventMap.get(item.id) || [],
  })) });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const issueType = typeof body?.issueType === "string" && issueTypes.has(body.issueType) ? body.issueType : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 5000) : "";
  const attachmentIds = Array.isArray(body?.attachmentIds) ? [...new Set(body.attachmentIds.filter((id: unknown): id is string => typeof id === "string"))].slice(0, 3) : [];
  if (!taskId || !issueType || description.length < 10) return NextResponse.json({ code: "INVALID_COMPLAINT", message: "请填写任务编号、问题类型和至少 10 个字的问题描述" }, { status: 400 });

  const client = await db.connect();
  let complaintId = "";
  let complaintNo = "";
  try {
    await client.query("BEGIN");
    const task = await client.query("SELECT id FROM generation_tasks WHERE id = $1 AND user_id = $2", [taskId, user.id]);
    if (!task.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ code: "TASK_NOT_FOUND", message: "任务编号不存在或不属于当前账号" }, { status: 404 }); }
    if (attachmentIds.length) {
      const attachments = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM assets WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND audit_status IN ('PENDING_REVIEW', 'READY')",
        [attachmentIds, user.id],
      );
      if (Number(attachments.rows[0]?.count || 0) !== attachmentIds.length) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INVALID_ATTACHMENT", message: "部分附件不可用" }, { status: 400 }); }
    }
    complaintNo = complaintNumber();
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO complaints (complaint_no, user_id, task_id, issue_type, description) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [complaintNo, user.id, taskId, issueType, description],
    );
    complaintId = inserted.rows[0].id;
    for (const assetId of attachmentIds) await client.query("INSERT INTO complaint_attachments (complaint_id, asset_id) VALUES ($1, $2)", [complaintId, assetId]);
    await client.query("INSERT INTO complaint_events (complaint_id, actor_id, actor_role, to_status, note) VALUES ($1, $2, 'USER', 'SUBMITTED', $3)", [complaintId, user.id, "用户提交投诉"]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("complaint submission failed", error);
    return NextResponse.json({ code: "COMPLAINT_CREATE_FAILED", message: "投诉提交失败，请稍后重试" }, { status: 500 });
  } finally { client.release(); }
  await audit(user.id, "COMPLAINT_SUBMITTED", request, { type: "complaint", id: complaintId }, { complaintNo, taskId, issueType, attachmentCount: attachmentIds.length });
  return NextResponse.json({ complaintId, complaintNo, status: "SUBMITTED" }, { status: 201 });
}
