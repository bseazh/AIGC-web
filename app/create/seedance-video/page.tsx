export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { VideoWorkflowPage } from "@/app/components/video-workflow-page";

export default function SeedanceVideoPage() {
  return <ProjectRequiredGate workflowKey="seedance-video"><VideoWorkflowPage template="seedance" /></ProjectRequiredGate>;
}
