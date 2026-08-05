import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedUser } from "@/lib/session";

const allowedWorkflows = new Set(["recreate-video"]);

function normalizeWorkflow(value: unknown) {
  return typeof value === "string" && allowedWorkflows.has(value) ? value : "";
}

function normalizeTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";
  return (title || "未命名项目").slice(0, 80);
}

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

type DraftRow = {
  id: string;
  title: string;
  workflow_key: string;
  status: string;
  payload_json: Record<string, unknown>;
  task_id: string | null;
  created_at: string;
  updated_at: string;
};

function draftStep(payload: Record<string, unknown>) {
  return typeof payload.step === "string" ? payload.step.slice(0, 40) : null;
}

function presentDraft(draft: DraftRow) {
  return {
    id: draft.id,
    title: draft.title,
    workflowKey: draft.workflow_key,
    payload: draft.payload_json,
    taskId: draft.task_id,
    status: draft.status,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const workflowKey = normalizeWorkflow(request.nextUrl.searchParams.get("workflowKey") || "recreate-video");
  if (!workflowKey) return NextResponse.json({ code: "INVALID_WORKFLOW" }, { status: 400 });
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 20), 1), 50);
  const result = await db.query<DraftRow>(
    `WITH ranked AS (
       SELECT id, title, workflow_key, status, payload_json, task_id, created_at, updated_at,
              ROW_NUMBER() OVER (PARTITION BY encode(digest(payload_json::text, 'sha256'), 'hex') ORDER BY updated_at DESC, created_at DESC) AS duplicate_rank
       FROM workflow_drafts
       WHERE user_id = $1 AND workflow_key = $2 AND status IN ('ACTIVE', 'ARCHIVED')
     )
     SELECT id, title, workflow_key, status, payload_json, task_id, created_at, updated_at
     FROM ranked
     WHERE duplicate_rank = 1
     ORDER BY updated_at DESC
     LIMIT $3`,
    [user.id, workflowKey, limit],
  );

  return NextResponse.json({ drafts: result.rows.map(presentDraft) });
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const workflowKey = normalizeWorkflow(body.workflowKey);
  const payload = normalizePayload(body.payload);
  if (!workflowKey || !payload) return NextResponse.json({ code: "INVALID_DRAFT" }, { status: 400 });
  const title = normalizeTitle(body.title);
  const draftId = validUuid(body.id) ? body.id : null;

  const result = draftId
    ? await db.query<DraftRow>(
        `UPDATE workflow_drafts
         SET title = $4, payload_json = $5::jsonb, status = 'ACTIVE', archived_at = NULL, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND workflow_key = $3 AND status IN ('ACTIVE', 'ARCHIVED')
         RETURNING id, title, workflow_key, status, payload_json, task_id, created_at, updated_at`,
        [draftId, user.id, workflowKey, title, JSON.stringify(payload)],
      )
    : { rows: [] as DraftRow[] };

  const existingResult = result.rows[0]
    ? result
    : await db.query<DraftRow>(
        `WITH matching AS (
           SELECT id
           FROM workflow_drafts
           WHERE user_id = $1
             AND workflow_key = $2
             AND status IN ('ACTIVE', 'ARCHIVED')
             AND digest(payload_json::text, 'sha256') = digest($4::jsonb::text, 'sha256')
           ORDER BY updated_at DESC
           LIMIT 1
         )
         UPDATE workflow_drafts draft
         SET title = $3, payload_json = $4::jsonb, status = 'ACTIVE', archived_at = NULL, updated_at = NOW()
         FROM matching
         WHERE draft.id = matching.id
         RETURNING draft.id, draft.title, draft.workflow_key, draft.status, draft.payload_json, draft.task_id, draft.created_at, draft.updated_at`,
        [user.id, workflowKey, title, JSON.stringify(payload)],
      );

  const saved =
    existingResult.rows[0] ||
    (
      await db.query<DraftRow>(
        `INSERT INTO workflow_drafts (user_id, workflow_key, title, payload_json)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, title, workflow_key, status, payload_json, task_id, created_at, updated_at`,
        [user.id, workflowKey, title, JSON.stringify(payload)],
      )
    ).rows[0];
  const eventType = draftId || existingResult.rows[0] ? "PROJECT_AUTOSAVED" : "PROJECT_CREATED";

  await db.query(
    `INSERT INTO workflow_draft_events (draft_id, user_id, workflow_key, event_type, step_key, field_name, value_json, payload_json)
     VALUES ($1, $2, $3, $4, $5, 'project_payload', $6::jsonb, $7::jsonb)`,
    [
      saved.id,
      user.id,
      workflowKey,
      eventType,
      draftStep(payload),
      JSON.stringify({
        title,
        hasSource: Boolean(payload.sourceItem || payload.douyinInput),
        productCount: Array.isArray(payload.products) ? payload.products.length : 0,
        keyframeCount: Array.isArray(payload.selectedKeyframes) ? payload.selectedKeyframes.length : 0,
        taskId: saved.task_id,
      }),
      JSON.stringify(payload),
    ],
  );

  return NextResponse.json({ draft: presentDraft(saved) });
}
