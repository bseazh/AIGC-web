export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { RecreateVideoPage as RecreateVideoWorkspace } from "@/app/components/recreate-video-page";

export default function RecreateVideoPage() {
  return <ProjectRequiredGate workflowKey="recreate-video"><RecreateVideoWorkspace /></ProjectRequiredGate>;
}
