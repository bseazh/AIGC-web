import { FolderOpen, ImagePlus, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { GeneratedAssetActions } from "@/app/components/generated-asset-actions";
import { imageAccept, materialLabel } from "../../constants";
import type { Item, KeyframeSelection, MaterialKind, PolishedRecreatePrompt, RecreateFrameAnalysis } from "../../types";

type MaterialReference = {
  label: string;
  preview: string;
};

type ReplacementSlot = NonNullable<RecreateFrameAnalysis["replacementPlan"]>[number];

type MaterialsPanelProps = {
  analyzeMaterial: (index: number) => void;
  analyzeReplaceableFrames: () => void;
  assetLibrary: ReactNode;
  chooseProduct: (files?: FileList | null) => void;
  clearTaskState: () => void;
  createPrivacyMultiView: (index: number) => void;
  douyinHasCache: boolean;
  faceMaskBusyIndex: number | null;
  frameAnalysis: RecreateFrameAnalysis | null;
  frameAnalysisBusy: boolean;
  frameAnalysisFrames: Array<{ time: number; url: string }>;
  handleCommandInput: (value: string) => void;
  insertMaterialReference: (label: string) => void;
  keyframeFallbackVisual: (label: string) => ReactNode;
  libraryKind: string | null;
  materialAnalysisBusyIndex: number | null;
  materialKindLabel: (kind?: MaterialKind) => string;
  materialMentionOpen: boolean;
  materialReferences: MaterialReference[];
  mentionMaterials: MaterialReference[];
  normalizeProductName: (index: number) => void;
  onNext: () => void;
  openProductLibrary: () => void;
  polishRecreateCommand: () => void;
  polishedPrompt: PolishedRecreatePrompt | null;
  portraitCandidate: Item | null;
  portraitCandidateIndex: number;
  previewImageButton: (url: string, name: string, className?: string) => ReactNode;
  privacyReference: Item | null;
  privacyViewBusyIndex: number | null;
  productInputRef: RefObject<HTMLInputElement | null>;
  productInfo: string;
  productReady: boolean;
  products: Item[];
  removeProduct: (index: number) => void;
  renameProduct: (index: number, name: string) => void;
  replacementSlots: ReplacementSlot[];
  selectedKeyframes: KeyframeSelection[];
  setLibraryKind: (kind: null) => void;
  setMaterialKind: (index: number, kind: MaterialKind) => void;
  setMaterialMentionOpen: (open: boolean) => void;
  setMaterialMentionQuery: (query: string) => void;
  slotTypeLabel: (slotType?: string) => string;
  strengthenFaceMask: (index: number) => void;
};

export function MaterialsPanel({
  analyzeMaterial,
  analyzeReplaceableFrames,
  assetLibrary,
  chooseProduct,
  clearTaskState,
  createPrivacyMultiView,
  douyinHasCache,
  faceMaskBusyIndex,
  frameAnalysis,
  frameAnalysisBusy,
  frameAnalysisFrames,
  handleCommandInput,
  insertMaterialReference,
  keyframeFallbackVisual,
  libraryKind,
  materialAnalysisBusyIndex,
  materialKindLabel,
  materialMentionOpen,
  materialReferences,
  mentionMaterials,
  normalizeProductName,
  onNext,
  openProductLibrary,
  polishRecreateCommand,
  polishedPrompt,
  portraitCandidate,
  portraitCandidateIndex,
  previewImageButton,
  privacyReference,
  privacyViewBusyIndex,
  productInputRef,
  productInfo,
  productReady,
  products,
  removeProduct,
  renameProduct,
  replacementSlots,
  selectedKeyframes,
  setLibraryKind,
  setMaterialKind,
  setMaterialMentionOpen,
  setMaterialMentionQuery,
  slotTypeLabel,
  strengthenFaceMask,
}: MaterialsPanelProps) {
  return (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>素材与提示词</h2>
        </div>
        <span>2 / 3</span>
      </header>
      <p className="recreate-panel-copy">
        上传要替换的人物、商品或场景素材，再用一句话说明想改成什么效果；动作和镜头参考会在后台自动整理。
      </p>
      <section className="recreate-replacement-guide">
        <header>
          <div>
            <strong>参考画面</strong>
            <small>
              {frameAnalysis
                ? "已准备动作、场景和可替换元素参考"
                : douyinHasCache
                  ? "系统会在提交前自动理解画面"
                  : "本地视频已准备为视觉参考"}
            </small>
          </div>
        </header>
        {(frameAnalysisFrames.length || selectedKeyframes.length) ? (
          <div className="recreate-replacement-frames recreate-frame-collage compact">
            {(frameAnalysisFrames.length ? frameAnalysisFrames : selectedKeyframes).slice(0, 12).map((frame, index) => (
              <figure key={`${frame.time}-${frame.url || index}`}>
                {frame.url ? previewImageButton(frame.url, `${frame.time.toFixed(1)}秒关键帧`) : keyframeFallbackVisual("待抽帧")}
                <figcaption>{frame.time.toFixed(1)}s</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
        {frameAnalysis ? (
          <div className="recreate-command-insight">
            {frameAnalysis.summary ? <p>{frameAnalysis.summary}</p> : null}
            {frameAnalysis.actionTimeline?.length ? <p>动作连续性已准备，提交时会自动用于生成。</p> : null}
            <div>
              {replacementSlots.slice(0, 5).map((slot, index) => (
                <span key={`${slot.target || "元素"}-${index}`}>
                  {slotTypeLabel(slot.slotType)}：{slot.target || slot.strategy || "可通配替换"}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {frameAnalysis?.risks?.length ? (
          <p className="recreate-replacement-risk">注意：{frameAnalysis.risks.slice(0, 2).join("；")}</p>
        ) : null}
      </section>
      <section className="recreate-command-card">
        <header>
          <div>
            <strong>提示词</strong>
            <small>简单说明替换方向即可，可以用 @ 引用素材。</small>
          </div>
          <button type="button" onClick={polishRecreateCommand} disabled={frameAnalysisBusy}>
            {frameAnalysisBusy ? (
              <LoaderCircle className="generation-spinner" size={15} />
            ) : (
              <Sparkles size={15} />
            )}
            {frameAnalysisBusy ? "正在优化" : "优化提示词"}
          </button>
        </header>
        {materialReferences.length ? (
          <div className="recreate-material-tags" aria-label="素材标签">
            {materialReferences.map((material, index) => (
              <button type="button" key={`${material.label}-${index}`} onClick={() => insertMaterialReference(material.label)}>
                <span>{material.label}</span>
                <img src={material.preview} alt={`${material.label}预览`} />
              </button>
            ))}
            <small>在口令里输入 @ 可召唤素材；点击标签也可插入，悬停可预览。</small>
          </div>
        ) : null}
        <textarea
          value={productInfo}
          onChange={(event) => handleCommandInput(event.target.value)}
          onBlur={() => window.setTimeout(() => setMaterialMentionOpen(false), 140)}
          onFocus={() => {
            const match = productInfo.match(/(^|\s)@([\u4e00-\u9fa5\w-]*)$/);
            setMaterialMentionOpen(Boolean(match && materialReferences.length));
            setMaterialMentionQuery(match?.[2] || "");
          }}
          maxLength={800}
          placeholder="例如：动作和镜头节奏参考原视频，把人物服装替换为 @图片一，背景参考 @图片二，字幕改成夏季显瘦穿搭。"
        />
        {materialMentionOpen && mentionMaterials.length ? (
          <div className="recreate-mention-menu">
            {mentionMaterials.map((material, index) => (
              <button
                type="button"
                key={`${material.label}-mention-${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMaterialReference(material.label)}
              >
                <img src={material.preview} alt={`${material.label}预览`} />
                <span>@{material.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        {polishedPrompt?.finalPrompt ? (
          <div className="recreate-polished-prompt">
            <strong>AI 已整理成生成方案</strong>
            {polishedPrompt.summary ? <p>{polishedPrompt.summary}</p> : null}
            <div>
              {(polishedPrompt.preserve || []).slice(0, 4).map((item) => <span key={`保留-${item}`}>保留：{item}</span>)}
              {(polishedPrompt.replace || []).slice(0, 4).map((item) => <span key={`替换-${item}`}>替换：{item}</span>)}
              {(polishedPrompt.avoid || []).slice(0, 4).map((item) => <span key={`避开-${item}`}>避开：{item}</span>)}
            </div>
            <textarea readOnly value={polishedPrompt.finalPrompt} aria-label="AI润色后的复刻提示词" />
            {polishedPrompt.providerError ? <small>{polishedPrompt.providerError}</small> : null}
          </div>
        ) : null}
      </section>
      <div className="recreate-source-tabs three">
        <button
          type="button"
          className={!libraryKind && !products.length ? "active" : ""}
          onClick={() => {
            setLibraryKind(null);
            productInputRef.current?.click();
          }}
        >
          <Upload size={16} />
          本地上传
        </button>
        <button type="button" className={libraryKind === "product" ? "active" : ""} onClick={openProductLibrary}>
          <FolderOpen size={16} />
          资产库
        </button>
      </div>
      {libraryKind === "product" ? (
        assetLibrary
      ) : (
        <button type="button" className="recreate-drop" onClick={() => productInputRef.current?.click()}>
          <span>
            <ImagePlus size={27} />
          </span>
          <strong>上传素材池</strong>
          <small>支持人物、服装、商品、背景、Logo 或文案参考图，AI 会自动通配使用</small>
          <small>已上传 {products.length}/8 个</small>
        </button>
      )}
      {products.length > 0 && (
        <div className="recreate-selected-images">
          {products.map((product, index) => (
            <article key={`${product.assetId || product.preview}-${index}`}>
              {previewImageButton(product.preview, product.name || `素材 ${index + 1}`)}
              <label>
                <small>引用标签：@{product.name.trim() || materialLabel(index)}</small>
                {product.materialKind ? <small>识别：{materialKindLabel(product.materialKind)}</small> : null}
                <input
                  value={product.name}
                  onChange={(event) => renameProduct(index, event.target.value)}
                  onBlur={() => normalizeProductName(index)}
                  maxLength={18}
                  aria-label={`重命名${materialLabel(index)}`}
                  placeholder={materialLabel(index)}
                />
                <label className="recreate-material-kind-select">
                  类型
                  <select
                    value={product.materialKind && ["person", "product", "scene"].includes(product.materialKind) ? product.materialKind : ""}
                    onChange={(event) => setMaterialKind(index, event.target.value as MaterialKind)}
                    disabled={privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                  >
                    <option value="">请选择</option>
                    <option value="person">模特</option>
                    <option value="product">商品</option>
                    <option value="scene">场景</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="privacy-view"
                  onClick={() => createPrivacyMultiView(index)}
                  disabled={privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                >
                  {privacyViewBusyIndex === index ? (
                    <LoaderCircle className="generation-spinner" size={12} />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {privacyViewBusyIndex === index
                    ? "生成中"
                    : product.materialKind === "person"
                      ? "人物多视图"
                      : product.materialKind === "scene"
                        ? "场景多视图"
                        : "素材多视图"}
                </button>
                {product.materialKind === "person" ? (
                  <button
                    type="button"
                    className="privacy-view"
                    onClick={() => strengthenFaceMask(index)}
                    disabled={faceMaskBusyIndex !== null || privacyViewBusyIndex !== null || materialAnalysisBusyIndex !== null}
                  >
                    {faceMaskBusyIndex === index ? (
                      <LoaderCircle className="generation-spinner" size={12} />
                    ) : (
                      <Sparkles size={12} />
                    )}
                    {faceMaskBusyIndex === index ? "遮盖中" : "强化遮盖"}
                  </button>
                ) : null}
                {product.generatedAsset && product.assetId ? (
                  <GeneratedAssetActions output={{ assetId: product.assetId, url: product.preview, savedToLibrary: product.savedToLibrary, expiresAt: product.expiresAt }} />
                ) : null}
              </label>
              <button
                type="button"
                onClick={() => {
                  removeProduct(index);
                  clearTaskState();
                }}
                aria-label="移除替换素材"
              >
                <X size={14} />
              </button>
              <span>{index + 1}</span>
            </article>
          ))}
        </div>
      )}
      <div className="recreate-source-footer">
        <button type="button" className="primary" onClick={onNext} disabled={!productReady}>
          下一步
        </button>
      </div>
      <input ref={productInputRef} type="file" accept={imageAccept} multiple onChange={(event) => chooseProduct(event.target.files)} hidden />
    </section>
  );
}
