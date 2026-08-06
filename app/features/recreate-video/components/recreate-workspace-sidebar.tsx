import type { WorkflowStep } from "../types";
import { RecreateStepList } from "./recreate-step-list";

type RecreateWorkspaceSidebarProps = {
  activeStep: WorkflowStep;
  clipReady: boolean;
  completedCount: number;
  onStepChange: (step: WorkflowStep) => void;
  phaseSucceeded: boolean;
  productReady: boolean;
  referenceReady: boolean;
  sourceReady: boolean;
  unlockedIndex: number;
};

export function RecreateWorkspaceSidebar({
  activeStep,
  clipReady,
  completedCount,
  onStepChange,
  phaseSucceeded,
  productReady,
  referenceReady,
  sourceReady,
  unlockedIndex,
}: RecreateWorkspaceSidebarProps) {
  return (
    <section className="recreate-flow-sidebar">
      <div className="recreate-flow-brand">
        <span>REFERENCE REPLICA</span>
        <strong>爆款视频换品复刻</strong>
        <p>我有对标视频：换商品、换模特，保留爆款节奏</p>
      </div>
      <button type="button" className="recreate-tutorial">
        <div>
          <strong>开始前建议观看</strong>
          <small>快速上手教学</small>
        </div>
        <span>立即观看</span>
      </button>
      <div className="recreate-flow-summary">
        <strong>制作流程</strong>
        <span>{completedCount}/5</span>
      </div>
      <RecreateStepList
        activeStep={activeStep}
        clipReady={clipReady}
        onStepChange={onStepChange}
        phaseSucceeded={phaseSucceeded}
        productReady={productReady}
        referenceReady={referenceReady}
        sourceReady={sourceReady}
        unlockedIndex={unlockedIndex}
      />
    </section>
  );
}
