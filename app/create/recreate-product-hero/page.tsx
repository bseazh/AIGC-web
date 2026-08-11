export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { RecreateProductHeroWorkspace } from "@/app/features/image-creation/recreate-product-hero/recreate-product-hero-workspace";

export default function Page() {
  return <ProjectRequiredGate workflowKey="recreate-product-hero"><RecreateProductHeroWorkspace /></ProjectRequiredGate>;
}
