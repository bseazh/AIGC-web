export const dynamic = "force-dynamic";

import { Suspense } from "react";

import { ModelSpokespersonScriptPage } from "@/app/components/model-spokesperson-script-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";

export default function ModelSpokespersonVideoPage() {
  return (
    <Suspense fallback={<main className="workspace-loading"><p>正在加载项目</p></main>}>
      <ProjectRequiredGate workflowKey="model-spokesperson-script">
        <ModelSpokespersonScriptPage />
      </ProjectRequiredGate>
    </Suspense>
  );
}
