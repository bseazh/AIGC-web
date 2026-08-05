export const dynamic = "force-dynamic";

import { ProductAdVideoPage as ProductAdVideoWorkspace } from "@/app/components/product-ad-video-page";
import { ProjectRequiredGate } from "@/app/components/project-required-gate";

export default function ProductAdVideoPage() {
  return <ProjectRequiredGate workflowKey="product-ad-video"><ProductAdVideoWorkspace /></ProjectRequiredGate>;
}
