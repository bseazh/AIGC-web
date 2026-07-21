import { NextRequest, NextResponse } from "next/server";
import { authenticatedAdministrator } from "@/lib/admin";
import { db } from "@/lib/db";
import { taskStatusLabel, workflowName } from "@/lib/presenters";

export async function GET(request: NextRequest) {
  if (!await authenticatedAdministrator(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 80) || "";
  const like = `%${query}%`;
  const [users, tasks, assets, ledger] = await Promise.all([
    db.query<{ id: string; display_name: string; email: string | null; phone: string | null; available_points: number; created_at: string }>(`SELECT u.id, u.display_name, u.email, u.phone, w.available_points, u.created_at FROM users u JOIN wallets w ON w.user_id = u.id WHERE $1 = '' OR u.display_name ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2 ORDER BY u.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; workflow_key: string; status: string; points: number; error_code: string | null; created_at: string }>(`SELECT t.id, u.display_name, t.workflow_key, t.status, t.points, t.error_code, t.created_at FROM generation_tasks t JOIN users u ON u.id = t.user_id WHERE $1 = '' OR u.display_name ILIKE $2 OR t.workflow_key ILIKE $2 OR t.status ILIKE $2 ORDER BY t.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; kind: string; original_name: string | null; mime_type: string; byte_size: string; created_at: string }>(`SELECT a.id, u.display_name, a.kind, a.original_name, a.mime_type, a.byte_size, a.created_at FROM assets a JOIN users u ON u.id = a.owner_id WHERE $1 = '' OR u.display_name ILIKE $2 OR a.original_name ILIKE $2 OR a.kind ILIKE $2 ORDER BY a.created_at DESC LIMIT 50`, [query, like]),
    db.query<{ id: string; display_name: string; type: string; amount: number; balance_after: number; business_type: string; created_at: string }>(`SELECT l.id, u.display_name, l.type, l.amount, l.balance_after, l.business_type, l.created_at FROM wallet_ledger l JOIN users u ON u.id = l.user_id WHERE $1 = '' OR u.display_name ILIKE $2 OR l.business_type ILIKE $2 ORDER BY l.created_at DESC LIMIT 50`, [query, like]),
  ]);
  return NextResponse.json({ users: users.rows.map((x) => ({ ...x, identifier: x.email || x.phone || "-" })), tasks: tasks.rows.map((x) => ({ ...x, workflowName: workflowName(x.workflow_key), statusLabel: taskStatusLabel(x.status) })), assets: assets.rows, ledger: ledger.rows });
}
