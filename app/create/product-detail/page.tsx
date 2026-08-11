export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { ProductDetailWorkspace } from "@/app/features/image-creation/product-detail/product-detail-workspace";

export default function ProductDetailPage() {
  return <ProjectRequiredGate workflowKey="product-detail-page"><ProductDetailWorkspace /></ProjectRequiredGate>;
}
