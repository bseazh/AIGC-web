import { LoaderCircle, X } from "lucide-react";

import type { ServerDraft } from "../types";

type RecreateProjectGateProps = {
  draftTitle: string;
  draftsLoading: boolean;
  onCreateProject: () => void;
  onDeleteDraft: (id: string) => void;
  onLoadDraft: (draft: ServerDraft) => void;
  onRefreshDrafts: () => void;
  onTitleChange: (title: string) => void;
  visibleDrafts: ServerDraft[];
};

export function RecreateProjectGate({
  draftTitle,
  draftsLoading,
  onCreateProject,
  onDeleteDraft,
  onLoadDraft,
  onRefreshDrafts,
  onTitleChange,
  visibleDrafts,
}: RecreateProjectGateProps) {
  return (
    <section className="recreate-project-gate">
      <header>
        <span>PROJECT REQUIRED</span>
        <h2>先创建或加载一个复刻项目</h2>
        <p>项目会保存对标视频、关键帧、素材、口令、任务状态和后续生成痕迹。</p>
      </header>

      <div className="recreate-project-create">
        <label>
          新项目名称
          <input
            value={draftTitle}
            onChange={(event) => onTitleChange(event.target.value)}
            maxLength={80}
            placeholder="例如：女装夏季上新复刻"
          />
        </label>
        <button type="button" className="primary" onClick={onCreateProject}>
          创建项目并开始
        </button>
      </div>

      <section className="recreate-project-existing">
        <div>
          <strong>已有项目</strong>
          <button type="button" onClick={onRefreshDrafts} disabled={draftsLoading}>
            {draftsLoading ? (
              <>
                <LoaderCircle className="generation-spinner" size={14} />
                读取中
              </>
            ) : (
              "刷新"
            )}
          </button>
        </div>
        {visibleDrafts.length ? (
          <div className="recreate-project-list">
            {visibleDrafts.map((draft) => (
              <article key={draft.id}>
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
                  <X size={14} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>{draftsLoading ? "正在读取项目..." : "暂无项目，请先创建一个"}</p>
        )}
      </section>
    </section>
  );
}
