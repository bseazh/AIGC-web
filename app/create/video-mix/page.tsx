export const dynamic = "force-dynamic";

import { ProjectRequiredGate } from "@/app/components/project-required-gate";
import { VideoWorkflowPage } from "@/app/components/video-workflow-page";
export default function VideoMixPage() { return <ProjectRequiredGate workflowKey="video-mix"><VideoWorkflowPage template="mix" /></ProjectRequiredGate>; }
