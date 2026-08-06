import { ArrowLeft, Film, FolderOpen, Link2, LoaderCircle, Upload, Video } from "lucide-react";
import type { RefObject } from "react";

import { formatBytes } from "../../media";
import type { Asset, DouyinAnalysis, Item, SourceMode } from "../../types";

type SourcePanelProps = {
  analyzeDouyin: () => void;
  assets: Asset[];
  assetsLoading: boolean;
  chooseVideo: (files?: FileList | null) => void;
  douyinAnalysis: DouyinAnalysis | null;
  douyinBusy: "analyzing" | "importing" | null;
  douyinCacheExpired: boolean;
  douyinError: string;
  douyinInput: string;
  libraryKind: string | null;
  onNext: () => void;
  openVideoLibrary: () => void;
  returnToSourceForExpiredCache: () => void;
  selectAsset: (asset: Asset) => void;
  setDouyinAnalysis: (analysis: DouyinAnalysis | null) => void;
  setDouyinError: (error: string) => void;
  setDouyinInput: (input: string) => void;
  setFrameAnalysis: (analysis: null) => void;
  setFrameAnalysisFrames: (frames: Array<{ time: number; url: string }>) => void;
  setLibraryKind: (kind: null) => void;
  setSourceMode: (mode: SourceMode) => void;
  setVideoSource: (source: "local" | "library" | "douyin") => void;
  sourceReady: boolean;
  sourceSelection: Item | null | undefined;
  sourceMode: SourceMode;
  videoInputRef: RefObject<HTMLInputElement | null>;
  videoSource: "local" | "library" | "douyin";
};

export function SourcePanel({
  analyzeDouyin,
  assets,
  assetsLoading,
  chooseVideo,
  douyinAnalysis,
  douyinBusy,
  douyinCacheExpired,
  douyinError,
  douyinInput,
  libraryKind,
  onNext,
  openVideoLibrary,
  returnToSourceForExpiredCache,
  selectAsset,
  setDouyinAnalysis,
  setDouyinError,
  setDouyinInput,
  setFrameAnalysis,
  setFrameAnalysisFrames,
  setLibraryKind,
  setSourceMode,
  setVideoSource,
  sourceReady,
  sourceSelection,
  sourceMode,
  videoInputRef,
  videoSource,
}: SourcePanelProps) {
  return (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>添加对标视频</h2>
        </div>
        <span>1 / 3</span>
      </header>
      <p className="recreate-panel-copy">
        视频来源可通过链接解析，也可以直接上传或从素材库挑选。
      </p>
      <div className="recreate-tabs" role="tablist" aria-label="视频来源">
        <button
          type="button"
          className={videoSource === "douyin" ? "active" : ""}
          onClick={() => {
            setVideoSource("douyin");
            setSourceMode("douyin");
            setLibraryKind(null);
          }}
        >
          链接获取
          <small>粘贴抖音分享链接</small>
        </button>
        <button
          type="button"
          className={videoSource === "local" ? "active" : ""}
          onClick={() => {
            setVideoSource("local");
            setSourceMode("upload");
            setLibraryKind(null);
          }}
        >
          上传视频
          <small>本地上传或资产库</small>
        </button>
      </div>
      {videoSource === "douyin" ? (
        <div className="recreate-source-block recreate-douyin-layout">
          <div className="recreate-douyin-left">
            <label className="recreate-field">
              粘贴抖音作品分享链接
              <textarea
                value={douyinInput}
                onChange={(event) => {
                  setDouyinInput(event.target.value);
                  setDouyinError("");
                  setDouyinAnalysis(null);
                  setFrameAnalysis(null);
                  setFrameAnalysisFrames([]);
                }}
                placeholder="粘贴抖音分享链接或完整分享文案"
              />
            </label>
            <div className="recreate-inline-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDouyinInput(
                    "复制打开抖音，看看【编导小咪的作品】不儿，ai我让你买个西瓜这么难吗？ # AI创作浪潮",
                  );
                }}
              >
                示例
              </button>
              <button type="button" onClick={analyzeDouyin} disabled={!douyinInput.trim() || Boolean(douyinBusy)}>
                {douyinBusy === "analyzing" ? (
                  <LoaderCircle className="generation-spinner" size={17} />
                ) : (
                  <Link2 size={17} />
                )}
                {douyinBusy === "analyzing" ? "正在读取视频信息" : "获取视频"}
              </button>
            </div>
            {!douyinAnalysis && (
              <p className="recreate-hint">
                支持完整分享文案；解析后右侧会临时缓存并预览原视频，下一步会自动准备参考画面。
              </p>
            )}
            {douyinAnalysis && (
              <div className="recreate-clip-editor">
                <header>
                  <div>
                    <strong>{douyinAnalysis.title}</strong>
                    <small>视频总时长 {douyinAnalysis.durationSeconds.toFixed(1)} 秒</small>
                  </div>
                  <span>已缓存</span>
                </header>
                <button type="button" onClick={onNext} disabled={!sourceSelection}>
                  <Film size={17} />
                  下一步
                </button>
                <p>不需要手动截取；系统会在后台准备参考画面。最终生成建议控制在 15 秒以内，稳定性更高。</p>
              </div>
            )}
          </div>
          <aside className="recreate-douyin-preview">
            {douyinAnalysis?.cachePreviewUrl ? (
              <div className="recreate-source-cache">
                <video src={douyinAnalysis.cachePreviewUrl} controls playsInline preload="metadata" />
                <div>
                  <strong>原视频临时预览</strong>
                  <small>
                    已缓存到云端临时区
                    {douyinAnalysis.cacheByteSize ? ` · ${formatBytes(douyinAnalysis.cacheByteSize)}` : ""}
                  </small>
                  <small>
                    {douyinAnalysis.cacheExpiresAt
                      ? `缓存将在 ${new Date(douyinAnalysis.cacheExpiresAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} 后自动清理`
                      : "缓存保留约 1 小时"}
                  </small>
                </div>
              </div>
            ) : (
              <div className="recreate-preview-empty">
                <Video size={30} />
                <strong>等待原视频预览</strong>
                <small>粘贴链接并获取视频后，会在这里以竖屏方式展示。</small>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="recreate-source-block">
          <div className="recreate-source-tabs">
            <button
              type="button"
              className={sourceMode === "upload" ? "active" : ""}
              onClick={() => {
                setSourceMode("upload");
                setLibraryKind(null);
                videoInputRef.current?.click();
              }}
            >
              <Upload size={16} />
              本地上传
            </button>
            <button
              type="button"
              className={sourceMode === "library" ? "active" : ""}
              onClick={() => {
                setSourceMode("library");
                openVideoLibrary();
              }}
            >
              <FolderOpen size={16} />
              资产库
            </button>
          </div>
          {libraryKind === "video" ? (
            <div className="recreate-library">
              {assetsLoading ? (
                <p>正在加载素材库</p>
              ) : assets.length ? (
                assets.map((asset) => (
                  <button type="button" key={asset.id} onClick={() => selectAsset(asset)}>
                    <span className="recreate-library-media">
                      <Video size={23} />
                    </span>
                    <small>{asset.originalName}</small>
                  </button>
                ))
              ) : (
                <p>暂无可用视频素材</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              className={`recreate-drop ${sourceSelection ? "has-file" : ""}`}
              onClick={() => videoInputRef.current?.click()}
            >
              <span>
                <Video size={27} />
              </span>
              <strong>上传对标视频</strong>
              <small>支持 MP4，最大 100MB，视频时长 3-15 秒</small>
              <small>
                {sourceSelection ? `${sourceSelection.name} · ${formatBytes(sourceSelection.byteSize)}` : "已上传 0 / 1 个"}
              </small>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4"
                onChange={(event) => chooseVideo(event.target.files)}
              />
            </button>
          )}
          {sourceSelection && (
            <div className="recreate-selected-source">
              <video src={sourceSelection.preview} controls playsInline preload="metadata" />
              <div>
                <strong>{sourceSelection.name}</strong>
                <small>
                  {sourceSelection.durationSeconds ? `${sourceSelection.durationSeconds.toFixed(1)} 秒` : "已保存到素材库"}
                </small>
              </div>
            </div>
          )}
        </div>
      )}
      {douyinError && (
        <div className="creator-error recreate-actionable-error" role="alert">
          <span>{douyinError}</span>
          {douyinCacheExpired ? (
            <button type="button" onClick={returnToSourceForExpiredCache}>
              <ArrowLeft size={14} />
              返回第一步重新获取
            </button>
          ) : null}
        </div>
      )}
      <div className="recreate-source-footer">
        <button type="button" className="primary" onClick={onNext} disabled={!sourceReady}>
          下一步
        </button>
      </div>
    </section>
  );
}
