"use client";

import { useEffect, useState } from "react";
import type { ImageWorkflowCase } from "@/lib/image-workflow-cases";

export function useRemadeImageCases(workflowKey: string, fallback: readonly ImageWorkflowCase[]) {
  const [cases, setCases] = useState<readonly ImageWorkflowCase[]>(fallback);

  useEffect(() => {
    let active = true;
    fetch(`/api/image-cases/?workflowKey=${encodeURIComponent(workflowKey)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { cases: [] })
      .then((body) => { if (active && Array.isArray(body.cases) && body.cases.length) setCases(body.cases); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [workflowKey]);

  return cases;
}
