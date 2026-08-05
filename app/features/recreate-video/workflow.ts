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
  const completedCount = [sourceReady, clipReady, productReady, referenceReady, phaseSucceeded].filter(Boolean).length;
  const unlockedIndex = sourceReady
    ? clipReady
      ? productReady
        ? referenceReady
          ? 4
          : 3
        : 2
      : 1
    : 0;
  const currentIndex = Math.min(
    Math.max(0, workflowSteps.findIndex((item) => item.key === step)),
    unlockedIndex,
  );
  return {
    activeStep: workflowSteps[currentIndex] || workflowSteps[0],
    completedCount,
    currentIndex,
    unlockedIndex,
  };
}
