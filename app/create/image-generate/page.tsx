export const dynamic = "force-dynamic";

import { AiImageGeneratePage } from "@/app/components/ai-image-generate-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";

export default function ImageGeneratePage() {
  return (
    <ProjectRequiredGate workflowKey="image-generate">
      <AiImageGeneratePage />
    </ProjectRequiredGate>
  );
}
