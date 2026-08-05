import { ArrowDown, ArrowUp, Check, Film, LoaderCircle, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";

import type { DouyinAnalysis, Item, KeyframeSelection, RecreateFrameAnalysis } from "../../types";

type KeyframePanelProps = {
  activeClipId: string | null;
  allCandidateKeyframesSelected: boolean;
  analyzeReplaceableFrames: () => void;
  clipReady: boolean;
  douyinAnalysis: DouyinAnalysis | null;
  douyinClips: Item[];
  frameAnalysis: RecreateFrameAnalysis | null;
  frameAnalysisBusy: boolean;
  frameAnalysisFrames: Array<{ time: number; url: string }>;
  frameExtractionBusy: boolean;
  goToVideoMix: () => void;
  keyframeFallbackVisual: (label: string) => ReactNode;
  moveClip: (index: number, direction: -1 | 1) => void;
  onNext: () => void;
  quickExtractKeyframes: () => void;
  removeClip: (assetId?: string) => void;
  selectableKeyframes: KeyframeSelection[];
  selectedKeyframeKeys: Set<string>;
  selectedKeyframes: KeyframeSelection[];
  setActiveClipId: (assetId: string | null) => void;
  setSourceItem: (item: Item) => void;
  sourceSelection: Item | null | undefined;
  toggleAllKeyframes: () => void;
  toggleKeyframe: (frame: KeyframeSelection) => void;
  useDefaultKeyframes: () => void;
};

export function KeyframePanel({
  activeClipId,
  allCandidateKeyframesSelected,
  analyzeReplaceableFrames,
  clipReady,
  douyinAnalysis,
  douyinClips,
  frameAnalysis,
  frameAnalysisBusy,
  frameAnalysisFrames,
  frameExtractionBusy,
  goToVideoMix,
  keyframeFallbackVisual,
  moveClip,
  onNext,
  quickExtractKeyframes,
  removeClip,
  selectableKeyframes,
  selectedKeyframeKeys,
  selectedKeyframes,
  setActiveClipId,
  setSourceItem,
  sourceSelection,
  toggleAllKeyframes,
  toggleKeyframe,
  useDefaultKeyframes,
}: KeyframePanelProps) {
  return (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>选择关键画面</h2>
        </div>
        <span>2 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        先把片段抽成十二宫格。至少保留 4 帧，后续会参考这些画面的节奏、构图和动作走势，再结合复刻口令做通配替换。
      </p>
      <section className="recreate-keyframe-picker">
        <header>
          <div>
            <strong>关键画面选择</strong>
            <small>
              已选 {selectedKeyframes.length}/12 · 至少 4 帧
              {frameAnalysisFrames.length
                ? " · 已有截图"
                : frameExtractionBusy
                  ? " · 正在快速抽帧"
                  : " · 当前为时间点近似"}
            </small>
          </div>
          <div>
            <button type="button" onClick={quickExtractKeyframes} disabled={frameExtractionBusy}>
              {frameExtractionBusy ? (
                <LoaderCircle className="generation-spinner" size={14} />
              ) : (
                <Film size={14} />
              )}
              {frameExtractionBusy ? "正在快速抽帧" : "快速抽取关键画面"}
            </button>
            {douyinAnalysis?.cacheId ? (
              <button type="button" onClick={analyzeReplaceableFrames} disabled={frameAnalysisBusy}>
                {frameAnalysisBusy ? (
                  <LoaderCircle className="generation-spinner" size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {frameAnalysisBusy ? "正在分析" : frameAnalysis ? "重新分析参考" : "分析十二宫格"}
              </button>
            ) : null}
            <button type="button" className="secondary" onClick={toggleAllKeyframes} disabled={!selectableKeyframes.length}>
              <Check size={14} />
              {allCandidateKeyframesSelected ? "取消全选" : "全选画面"}
            </button>
            <button type="button" className="secondary" onClick={useDefaultKeyframes}>
              使用默认十二宫格
            </button>
          </div>
        </header>
        <div className="recreate-keyframe-grid recreate-frame-collage">
          {selectableKeyframes.map((frame, index) => {
            const selected = selectedKeyframeKeys.has(frame.time.toFixed(1));
            return (
              <button
                type="button"
                className={selected ? "active" : ""}
                key={`${frame.time}-${frame.url || index}`}
                onClick={() => toggleKeyframe(frame)}
              >
                {frame.url ? <img src={frame.url} alt={`${frame.time.toFixed(1)}秒关键画面`} /> : keyframeFallbackVisual("待抽帧")}
                <strong>{frame.label || `关键画面 ${index + 1}`}</strong>
                <small>{frame.time.toFixed(1)}s</small>
                <em>{selected ? "已选择" : "点击选择"}</em>
              </button>
            );
          })}
        </div>
        {selectedKeyframes.length < 4 ? (
          <p className="recreate-keyframe-warning">还需选择 {4 - selectedKeyframes.length} 帧，才能进入复刻口令与素材。</p>
        ) : (
          <p className="recreate-keyframe-ready">
            已确认关键画面：{selectedKeyframes.map((frame) => `${frame.time.toFixed(1)}s`).join(" / ")}
          </p>
        )}
      </section>
      <div className="recreate-source-block">
        <p className="recreate-hint">当前对标视频已可直接进入下一步。</p>
        <div className="recreate-selected-source large">
          {sourceSelection && (
            <>
              <video src={sourceSelection.preview} controls playsInline preload="metadata" />
              <div>
                <strong>{sourceSelection.name}</strong>
                <small>{sourceSelection.durationSeconds ? `${sourceSelection.durationSeconds.toFixed(1)} 秒` : "已选中"}</small>
              </div>
            </>
          )}
        </div>
      </div>
      {douyinClips.length > 0 && (
        <section className="recreate-clip-collection">
          <header>
            <div>
              <strong>已截取片段</strong>
              <small>按此顺序带入智能混剪 · {douyinClips.length}/10</small>
            </div>
            <button type="button" onClick={goToVideoMix}>
              <Film size={14} />
              带入混剪
            </button>
          </header>
          <div>
            {douyinClips.map((clip, index) => (
              <article className={activeClipId === clip.assetId ? "active" : ""} key={clip.assetId || `${clip.name}-${index}`}>
                <button
                  type="button"
                  className="recreate-clip-preview"
                  onClick={() => {
                    setActiveClipId(clip.assetId || null);
                    setSourceItem(clip);
                  }}
                  aria-label={`选择片段 ${index + 1}`}
                >
                  <video src={clip.preview} muted playsInline preload="metadata" />
                  <span>{index + 1}</span>
                </button>
                <button
                  type="button"
                  className="recreate-clip-name"
                  onClick={() => {
                    setActiveClipId(clip.assetId || null);
                    setSourceItem(clip);
                  }}
                >
                  <strong>{clip.name}</strong>
                  <small>
                    {typeof clip.clipStartSeconds === "number" && typeof clip.clipEndSeconds === "number"
                      ? `${clip.clipStartSeconds.toFixed(1)}-${clip.clipEndSeconds.toFixed(1)} 秒`
                      : `${clip.durationSeconds?.toFixed(1)} 秒`}
                    {activeClipId === clip.assetId ? " · 当前复刻片段" : ""}
                  </small>
                </button>
                <div className="recreate-clip-actions">
                  <button type="button" disabled={index === 0} onClick={() => moveClip(index, -1)} aria-label="片段上移">
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={index === douyinClips.length - 1}
                    onClick={() => moveClip(index, 1)}
                    aria-label="片段下移"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button type="button" onClick={() => removeClip(clip.assetId)} aria-label="从片段列表移除">
                    <X size={13} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="recreate-source-footer">
        <button type="button" className="primary" onClick={onNext} disabled={!clipReady}>
          下一步：复刻口令与素材
        </button>
      </div>
    </section>
  );
}
