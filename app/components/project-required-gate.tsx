"use client";

import { FolderOpen } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { projectGateHref, type ProjectWorkflowKey } from "@/lib/project-workflows";

export function ProjectRequiredGate({
  workflowKey,
  children,
}: {
  workflowKey: ProjectWorkflowKey;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId");
  const query = searchParams?.toString();

  useEffect(() => {
    if (projectId) return;
    const next = `${pathname || "/create/product-hero"}${query ? `?${query}` : ""}`;
    router.replace(projectGateHref(workflowKey, next));
  }, [pathname, projectId, query, router, workflowKey]);

  if (!projectId) {
    return (
      <main className="workspace-loading">
        <span><FolderOpen size={22} /></span>
        <p>正在进入项目选择</p>
      </main>
    );
  }

  return <>{children}</>;
}
