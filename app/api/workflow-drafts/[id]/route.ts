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

function normalizeTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";
  return (title || "未命名项目").slice(0, 80);
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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await context.params;
  if (!validUuid(id)) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = normalizeTitle(body?.title);
  const current = await db.query<{ workflow_key: string }>(
    `SELECT workflow_key
     FROM workflow_drafts
     WHERE id = $1 AND user_id = $2 AND status IN ('ACTIVE', 'ARCHIVED')`,
    [id, user.id],
  );
  const workflowKey = current.rows[0]?.workflow_key;
  if (!workflowKey) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });

  const duplicateTitle = await db.query<{ id: string }>(
    `SELECT id
     FROM workflow_drafts
     WHERE user_id = $1
       AND workflow_key = $2
       AND lower(title) = lower($3)
       AND status IN ('ACTIVE', 'ARCHIVED')
       AND id <> $4::uuid
     LIMIT 1`,
    [user.id, workflowKey, title, id],
  );
  if (duplicateTitle.rows[0])
    return NextResponse.json({ code: "DUPLICATE_PROJECT_TITLE", message: "同名项目已存在，请换一个项目名称" }, { status: 409 });

  const result = await db.query<Parameters<typeof presentDraft>[0]>(
    `UPDATE workflow_drafts
     SET title = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('ACTIVE', 'ARCHIVED')
     RETURNING id, title, workflow_key, status, payload_json, task_id, created_at, updated_at`,
    [id, user.id, title],
  );
  const draft = result.rows[0];
  if (!draft) return NextResponse.json({ code: "DRAFT_NOT_FOUND" }, { status: 404 });

  await db.query(
    `INSERT INTO workflow_draft_events (draft_id, user_id, workflow_key, event_type, field_name, value_json, payload_json)
     VALUES ($1, $2, $3, 'PROJECT_RENAMED', 'project_title', $4::jsonb, $5::jsonb)`,
    [draft.id, user.id, draft.workflow_key, JSON.stringify({ title }), JSON.stringify({ title })],
  );

  return NextResponse.json({ draft: presentDraft(draft) });
}
