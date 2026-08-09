export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ModelSpokespersonScriptPage } from "@/app/components/model-spokesperson-script-page";
import { isAdministrator } from "@/lib/admin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectGateHref } from "@/lib/project-workflows";

async function loadInitialAccount() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const result = await db.query<{
    id: string;
    email: string | null;
    phone: string | null;
    token_version: number;
    available_points: number;
  }>(
    `SELECT u.id, u.email, u.phone, u.token_version, w.available_points
     FROM users u
     JOIN login_sessions s ON s.user_id = u.id
     JOIN wallets w ON w.user_id = u.id
     WHERE u.id = $1
       AND u.status = 'ACTIVE'
       AND s.id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()`,
    [session.userId, session.sessionId],
  );
  const user = result.rows[0];
  if (!user || user.token_version !== session.tokenVersion) return null;
  return {
    user: { isAdministrator: isAdministrator(user.email || user.phone) },
    wallet: { availablePoints: user.available_points },
  };
}

async function resolveProjectId(searchParams?: Promise<Record<string, string | string[] | undefined>>) {
  const params = searchParams ? await searchParams : {};
  const value = params.projectId;
  return Array.isArray(value) ? value[0] : value || "";
}

export default async function ModelSpokespersonVideoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const projectId = await resolveProjectId(searchParams);
  if (!projectId) redirect(projectGateHref("model-spokesperson-script", "/create/model-spokesperson-video"));
  const account = await loadInitialAccount();
  if (!account) redirect("/");
  return <ModelSpokespersonScriptPage initialAccount={account} />;
}
