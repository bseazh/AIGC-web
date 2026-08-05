import { X } from "lucide-react";

import type { ServerDraft, WorkflowStep } from "../types";
import { RecreateStepList } from "./recreate-step-list";

type DraftSyncState = "idle" | "saving" | "saved" | "error";

type RecreateWorkspaceSidebarProps = {
  activeStep: WorkflowStep;
  clipReady: boolean;
  completedCount: number;
  draftId: string;
  draftSyncState: DraftSyncState;
  draftTitle: string;
  draftsLoading: boolean;
  onDeleteDraft: (id: string) => void;
  onLoadDraft: (draft: ServerDraft) => void;
  onNewProject: () => void;
  onRefreshDrafts: () => void;
  onStepChange: (step: WorkflowStep) => void;
  onTitleChange: (title: string) => void;
  phaseSucceeded: boolean;
  productReady: boolean;
  referenceReady: boolean;
  sourceReady: boolean;
  unlockedIndex: number;
  visibleDrafts: ServerDraft[];
};

export function RecreateWorkspaceSidebar({
  activeStep,
  clipReady,
  completedCount,
  draftId,
  draftSyncState,
  draftTitle,
  draftsLoading,
  onDeleteDraft,
  onLoadDraft,
  onNewProject,
  onRefreshDrafts,
  onStepChange,
  onTitleChange,
  phaseSucceeded,
  productReady,
  referenceReady,
  sourceReady,
  unlockedIndex,
  visibleDrafts,
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
      <section className="recreate-draft-box">
        <div className="recreate-draft-box-head">
          <div>
            <strong>项目存档</strong>
            <small>
              {draftSyncState === "saving"
                ? "正在保存"
                : draftSyncState === "saved"
                  ? "已同步到账户"
                  : draftSyncState === "error"
                    ? "同步失败，本地已兜底"
                    : "项目已加载"}
            </small>
          </div>
          <button type="button" onClick={onRefreshDrafts} disabled={draftsLoading}>
            {draftsLoading ? "读取中" : "刷新"}
          </button>
        </div>
        <label className="recreate-draft-title">
          项目名称
          <input
            value={draftTitle}
            onChange={(event) => onTitleChange(event.target.value)}
            maxLength={80}
            placeholder="给这次复刻项目起个名字"
          />
        </label>
        <button type="button" className="recreate-new-draft" onClick={onNewProject}>
          切换 / 新建项目
        </button>
        <div className="recreate-draft-list">
          {visibleDrafts.length ? (
            visibleDrafts.map((draft) => (
              <article className={draft.id === draftId ? "active" : ""} key={draft.id}>
                <button type="button" onClick={() => onLoadDraft(draft)}>
                  <strong>{draft.title}</strong>
                  <small>
                    最近编辑 {new Date(draft.updatedAt).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </button>
                <button type="button" aria-label="删除项目" onClick={() => onDeleteDraft(draft.id)}>
                  <X size={13} />
                </button>
              </article>
            ))
          ) : (
            <p>{draftsLoading ? "正在读取项目..." : "暂无服务器项目"}</p>
          )}
        </div>
      </section>
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
