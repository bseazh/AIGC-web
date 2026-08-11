export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { ResizeImageWorkspace } from "@/app/features/image-creation/resize-image/resize-image-workspace";

export default function Page() {
  return <ProjectRequiredGate workflowKey="resize-image"><ResizeImageWorkspace /></ProjectRequiredGate>;
}
