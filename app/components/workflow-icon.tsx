import {
  Clapperboard,
  Film,
  ImageIcon,
  Layers3,
  ScanSearch,
  Shirt,
  Sparkles,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

type WorkflowIconDefinition = {
  color: "blue" | "cyan" | "orange" | "violet";
  icon: LucideIcon;
};

const workflowIcons: Record<string, WorkflowIconDefinition> = {
  "product-hero-image": { color: "blue", icon: ImageIcon },
  "scene-image": { color: "cyan", icon: WandSparkles },
  "model-wear": { color: "violet", icon: Shirt },
  "hd-enhance": { color: "blue", icon: ScanSearch },
  "white-background": { color: "cyan", icon: ImageIcon },
  "resize-image": { color: "blue", icon: ImageIcon },
  "product-detail-page": { color: "orange", icon: Layers3 },
  "recreate-product-hero": { color: "violet", icon: WandSparkles },
  "recreate-detail-page": { color: "orange", icon: Layers3 },
  "product-ad-video": { color: "blue", icon: Clapperboard },
  "recreate-video": { color: "violet", icon: Video },
  "recreate-reference-image": { color: "violet", icon: Sparkles },
  "seedance-video": { color: "cyan", icon: Film },
  "video-mix": { color: "cyan", icon: Layers3 },
};

export function WorkflowIcon({ workflowKey }: { workflowKey?: string | null }) {
  const definition = workflowKey ? workflowIcons[workflowKey] : null;
  const Icon = definition?.icon || Sparkles;
  return (
    <span className={`workflow-icon ${definition?.color || "blue"}`}>
      <Icon size={23} />
    </span>
  );
}
