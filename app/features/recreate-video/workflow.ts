import { workflowSteps } from "./constants";
import type { WorkflowStep } from "./types";

type RecreateWorkflowReadiness = {
  clipReady: boolean;
  phaseSucceeded: boolean;
  productReady: boolean;
  referenceReady: boolean;
  sourceReady: boolean;
  step: WorkflowStep;
};

export function getRecreateWorkflowState({
  clipReady,
  phaseSucceeded,
  productReady,
  referenceReady,
  sourceReady,
  step,
}: RecreateWorkflowReadiness) {
  const normalizedStep: WorkflowStep = step === "clip" ? "product" : step === "reference" ? "generate" : step;
  const completedCount = [sourceReady, productReady, phaseSucceeded].filter(Boolean).length;
  const unlockedIndex = sourceReady ? (productReady && referenceReady ? 2 : 1) : 0;
  const currentIndex = Math.min(
    Math.max(0, workflowSteps.findIndex((item) => item.key === normalizedStep)),
    unlockedIndex,
  );
  return {
    activeStep: workflowSteps[currentIndex] || workflowSteps[0],
    completedCount,
    currentIndex,
    unlockedIndex,
  };
}
