export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { ProductHeroWorkspace } from "@/app/features/image-creation/product-hero/product-hero-workspace";

export default function ProductHeroPage() {
  return <ProjectRequiredGate workflowKey="product-hero-image"><ProductHeroWorkspace /></ProjectRequiredGate>;
}
