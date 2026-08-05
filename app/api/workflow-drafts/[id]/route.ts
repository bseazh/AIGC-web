import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function presentDraft(draft: {
  id: string;
  title: string;
  workflow_key: string;
  status: string;
  payload_json: Record<string, unknown>;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: draft.id,
    title: draft.title,
    workflowKey: draft.workflow_key,
    status: draft.status,
    payload: draft.payload_json,
    taskId: draft.task_id,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });

  const result = await db.query<Parameters<typeof presentDraft>[0]>(
    `SELECT id, title, workflow_key, status, payload_json, task_id, created_at, updated_at
     FROM workflow_drafts
     WHERE id = $1 AND user_id = $2 AND status IN ('ACTIVE', 'ARCHIVED')`,
    [id, user.id],
  );
  const draft = result.rows[0];
  if (!draft) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ draft: presentDraft(draft) });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });

  const result = await db.query<{ id: string }>(
    `UPDATE workflow_drafts
     SET status = 'DELETED', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('ACTIVE', 'ARCHIVED')
     RETURNING id`,
    [id, user.id],
  );
  if (!result.rows[0]) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
