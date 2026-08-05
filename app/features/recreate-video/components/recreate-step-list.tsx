import { Check } from "lucide-react";

import { workflowSteps } from "../constants";
import type { WorkflowStep } from "../types";

type RecreateStepListProps = {
  activeStep: WorkflowStep;
  clipReady: boolean;
  onStepChange: (step: WorkflowStep) => void;
  phaseSucceeded: boolean;
  productReady: boolean;
  referenceReady: boolean;
  sourceReady: boolean;
  unlockedIndex: number;
};

export function RecreateStepList({
  activeStep,
  clipReady,
  onStepChange,
  phaseSucceeded,
  productReady,
  referenceReady,
  sourceReady,
  unlockedIndex,
}: RecreateStepListProps) {
  return (
    <div className="recreate-step-list">
      {workflowSteps.map((item, index) => {
        const completed =
          (item.key === "source" && sourceReady) ||
          (item.key === "clip" && clipReady) ||
          (item.key === "product" && productReady) ||
          (item.key === "reference" && referenceReady) ||
          (item.key === "generate" && phaseSucceeded);
        const unlocked = index <= unlockedIndex;
        return (
          <button
            type="button"
            className={`recreate-step-item ${item.key === activeStep ? "active" : ""} ${completed ? "done" : ""}`}
            disabled={!unlocked}
            key={item.key}
            onClick={() => onStepChange(item.key)}
          >
            <span>{completed ? <Check size={12} /> : item.number}</span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </div>
          </button>
        );
      })}
    </div>
  );
}
