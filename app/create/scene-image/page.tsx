export const dynamic = "force-dynamic";

import { ProductSceneImagePage } from "@/app/features/image-creation/product-scene/product-scene-image-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";

export default function SceneImagePage() {
  return <ProjectRequiredGate workflowKey="scene-image"><ProductSceneImagePage /></ProjectRequiredGate>;
}
