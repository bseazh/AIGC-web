export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { HdEnhanceWorkspace } from "@/app/features/image-creation/hd-enhance/hd-enhance-workspace";

export default function HdEnhancePage() {
  return <ProjectRequiredGate workflowKey="hd-enhance"><HdEnhanceWorkspace /></ProjectRequiredGate>;
}
