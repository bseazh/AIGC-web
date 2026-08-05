export const dynamic = "force-dynamic";

import { ModelSpokespersonScriptPage } from "@/app/components/model-spokesperson-script-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";

export default function ModelSpokespersonVideoPage() {
  return <ProjectRequiredGate workflowKey="model-spokesperson-script"><ModelSpokespersonScriptPage /></ProjectRequiredGate>;
}
