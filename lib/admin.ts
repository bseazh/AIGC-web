import { NextRequest } from "next/server";
import { authenticatedUser } from "@/lib/session";

function configuredAdministrators() {
  return new Set(
    (process.env.ADMIN_IDENTIFIERS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdministrator(identifier: string | null | undefined) {
  return !!identifier && configuredAdministrators().has(identifier.trim().toLowerCase());
}

export async function authenticatedAdministrator(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user || !isAdministrator(user.email || user.phone)) return null;
  return user;
}
