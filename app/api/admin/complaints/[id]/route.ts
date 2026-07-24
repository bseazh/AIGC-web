import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { enqueueComplaintNotification } from "@/lib/notifications";

const statuses = new Set(["IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const administrator = await authenticatedAdministrator(request);
  if (!administrator) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" && statuses.has(body.status) ? body.status : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (!status || !note) return NextResponse.json({ code: "INVALID_UPDATE", message: "请选择状态并填写处理备注" }, { status: 400 });
  const client = await db.connect();
  let complaintNo = "";
  try {
    await client.query("BEGIN");
    const result = await client.query<{ complaint_no: string; user_id: string; status: string; email: string | null }>(
      "SELECT c.complaint_no, c.user_id, c.status, u.email FROM complaints c JOIN users u ON u.id = c.user_id WHERE c.id = $1 FOR UPDATE OF c",
      [id],
    );
    const complaint = result.rows[0];
    if (!complaint) { await client.query("ROLLBACK"); return NextResponse.json({ code: "COMPLAINT_NOT_FOUND" }, { status: 404 }); }
    if (complaint.status === "CLOSED") { await client.query("ROLLBACK"); return NextResponse.json({ code: "COMPLAINT_CLOSED", message: "已关闭的投诉不能再次修改" }, { status: 409 }); }
    complaintNo = complaint.complaint_no;
    await client.query(
      "UPDATE complaints SET status = $2, admin_note = $3, assigned_to = $4, closed_at = CASE WHEN $2 = 'CLOSED' THEN NOW() ELSE NULL END, updated_at = NOW() WHERE id = $1",
      [id, status, note, administrator.id],
    );
    await client.query("INSERT INTO complaint_events (complaint_id, actor_id, actor_role, from_status, to_status, note) VALUES ($1, $2, 'ADMIN', $3, $4, $5)", [id, administrator.id, complaint.status, status, note]);
    await enqueueComplaintNotification(client, { id, complaintNo, userId: complaint.user_id, email: complaint.email, status });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("complaint update failed", error);
    return NextResponse.json({ code: "COMPLAINT_UPDATE_FAILED", message: "投诉更新失败" }, { status: 500 });
  } finally { client.release(); }
  await audit(administrator.id, "ADMIN_COMPLAINT_UPDATED", request, { type: "complaint", id }, { complaintNo, status, note });
  return NextResponse.json({ complaintId: id, complaintNo, status });
}
