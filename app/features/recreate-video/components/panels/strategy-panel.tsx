import type { Item, KeyframeSelection } from "../../types";

type MaterialReference = {
  label: string;
  preview: string;
};

type StrategyPanelProps = {
  actionTimelineCount: number;
  keyframeFallbackVisual: (label: string) => React.ReactNode;
  materialReferences: MaterialReference[];
  onNext: () => void;
  previewImageButton: (url: string, name: string, className?: string) => React.ReactNode;
  products: Item[];
  ready: boolean;
  selectedKeyframes: KeyframeSelection[];
};

export function StrategyPanel({
  actionTimelineCount,
  keyframeFallbackVisual,
  materialReferences,
  onNext,
  previewImageButton,
  products,
  ready,
  selectedKeyframes,
}: StrategyPanelProps) {
  return (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div className="recreate-frame-collage">
          <strong>当前步骤</strong>
          <h2>内置复刻策略</h2>
        </div>
        <span>4 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        系统会自动把十二宫格和对标视频作为动作与镜头参考，再用素材池替换原人物、商品和场景；用户口令只是补充要求，不需要写专业提示词。
      </p>
      <section className="recreate-reference-keyframes">
        <header>
          <strong>十二宫格参考画面</strong>
          <small>{selectedKeyframes.length} 帧会作为最终成片的镜头节奏和构图参考</small>
        </header>
        <div>
          {selectedKeyframes.map((frame, index) => (
            <figure key={`${frame.time}-${frame.url || index}`}>
              {frame.url ? previewImageButton(frame.url, `${frame.time.toFixed(1)}秒参考画面`) : keyframeFallbackVisual("待抽帧")}
              <figcaption>{frame.time.toFixed(1)}s</figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="recreate-plan-preview">
        <header>
          <strong>内置策略状态</strong>
          <small>系统会在提交时自动注入动作、镜头和素材替换策略</small>
        </header>
        <div className="recreate-plan-tags">
          <span>{actionTimelineCount ? "动作：已拆解连续性" : "动作：提交前自动分析"}</span>
          <span>参考：动作结构十二宫格</span>
          <span>替换：{products.length ? `${products.length} 个素材自动通配` : "未上传素材，按内置策略原创生成"}</span>
          <span>合规：避开原脸 / 原商品 / Logo / 原字幕</span>
        </div>
        {materialReferences.length ? (
          <div className="recreate-material-tags" aria-label="最终素材标签">
            {materialReferences.map((material, index) => (
              <button type="button" key={`${material.label}-confirm-${index}`}>
                <span>{material.label}</span>
                <img src={material.preview} alt={`${material.label}预览`} />
              </button>
            ))}
          </div>
        ) : null}
      </section>
      {products.length > 0 ? (
        <div className="recreate-selected-images">
          {products.map((product, index) => (
            <article key={`${product.assetId || product.name}-confirm-${index}`}>
              {previewImageButton(product.preview, product.name || `素材 ${index + 1}`)}
              <span>{index + 1}</span>
            </article>
          ))}
        </div>
      ) : null}
      <div className="recreate-source-footer">
        <button type="button" className="primary" onClick={onNext} disabled={!ready}>
          下一步：提交生成
        </button>
      </div>
    </section>
  );
}
