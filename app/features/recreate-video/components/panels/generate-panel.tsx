import { ArrowLeft, ChevronDown, Download, Film, LoaderCircle, Sparkles } from "lucide-react";

import { VideoGenerationProgress } from "@/app/components/video-generation-progress";
import type { PreviewMedia, Result } from "../../types";

type MaterialReference = {
  label: string;
  preview: string;
};

type GeneratePanelProps = {
  canGoPrevious: boolean;
  compliantReferenceVideo: boolean;
  duration: string;
  durationSeconds: number;
  error: string;
  generateReady: boolean;
  goToVideoMix: () => void;
  handleCommandInput: (value: string) => void;
  insertMaterialReference: (label: string) => void;
  materialMentionOpen: boolean;
  mentionMaterials: MaterialReference[];
  onGoPrevious: () => void;
  onReset: () => void;
  phase: "idle" | "uploading" | "generating" | "succeeded" | "failed";
  productInfo: string;
  ratio: string;
  resolution: string;
  result: Result | null;
  setCompliantReferenceVideo: (value: boolean) => void;
  setDuration: (value: string) => void;
  setMaterialMentionOpen: (value: boolean) => void;
  setPreviewMedia?: (media: PreviewMedia | null) => void;
  setRatio: (value: string) => void;
  setResolution: (value: string) => void;
  setSpecial: (value: string) => void;
  setUsageAuthorized: (value: boolean) => void;
  special: string;
  usageAuthorized: boolean;
  clearTaskState: () => void;
};

export function GeneratePanel({
  canGoPrevious,
  clearTaskState,
  compliantReferenceVideo,
  duration,
  durationSeconds,
  error,
  generateReady,
  goToVideoMix,
  handleCommandInput,
  insertMaterialReference,
  materialMentionOpen,
  mentionMaterials,
  onGoPrevious,
  onReset,
  phase,
  productInfo,
  ratio,
  resolution,
  result,
  setCompliantReferenceVideo,
  setDuration,
  setMaterialMentionOpen,
  setRatio,
  setResolution,
  setSpecial,
  setUsageAuthorized,
  special,
  usageAuthorized,
}: GeneratePanelProps) {
  return (
    <section className="recreate-panel">
      <header className="recreate-panel-head">
        <div>
          <strong>当前步骤</strong>
          <h2>生成复刻视频</h2>
        </div>
        <span>5 / 5</span>
      </header>
      <p className="recreate-panel-copy">
        这里会把当前复刻链路提交到任务中心，并显示加载进度和预计时间。
      </p>
      <div className="recreate-meta-grid">
        <label>
          视频比例
          <span className="recreate-select">
            <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
              <option value="9:16">竖屏（9:16）</option>
              <option value="16:9">横屏（16:9）</option>
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
        <label>
          视频时长
          <span className="recreate-select">
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="5">5 秒</option>
              <option value="10">10 秒</option>
              <option value="15">15 秒</option>
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
        <label>
          视频分辨率
          <span className="recreate-select">
            <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
              <option>480p</option>
              <option>720p</option>
              <option>1080p</option>
            </select>
            <ChevronDown size={16} />
          </span>
        </label>
      </div>
      <label className="recreate-consent">
        <input
          type="checkbox"
          checked={usageAuthorized}
          onChange={(event) => {
            setUsageAuthorized(event.target.checked);
            clearTaskState();
          }}
        />
        我确认拥有对标视频、素材池及复刻口令中相关内容的合法使用授权
      </label>
      <label className="recreate-toggle">
        轻量合规参考视频
        <input
          type="checkbox"
          checked={compliantReferenceVideo}
          onChange={(event) => {
            setCompliantReferenceVideo(event.target.checked);
            clearTaskState();
          }}
        />
        <i />
      </label>
      <p className="recreate-test-note">
        {compliantReferenceVideo
          ? "提交前会先生成去音频、边缘轮廓线稿化且满足模型最低分辨率的动作结构参考视频，保留动作节奏并降低真人可识别度。"
          : "当前会直接提交原始对标视频，含真人时可能被 Ark 拒绝。"}
      </p>
      <label className="recreate-field">
        复刻口令（可选）
        <textarea
          value={productInfo}
          onChange={(event) => handleCommandInput(event.target.value)}
          onBlur={() => window.setTimeout(() => setMaterialMentionOpen(false), 140)}
          maxLength={800}
          placeholder="例如：动作和节奏参考原视频，把服装换成 @图片一，背景保持干净明亮。"
        />
        {materialMentionOpen && mentionMaterials.length ? (
          <div className="recreate-mention-menu">
            {mentionMaterials.map((material, index) => (
              <button
                type="button"
                key={`${material.label}-generate-mention-${index}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMaterialReference(material.label)}
              >
                <img src={material.preview} alt={`${material.label}预览`} />
                <span>@{material.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </label>
      <label className="recreate-field">
        补充要求（可选）
        <textarea
          value={special}
          onChange={(event) => setSpecial(event.target.value)}
          maxLength={600}
          placeholder="例如：突出金属质感、镜头缓慢推进、电影级光影"
        />
      </label>
      <p className="recreate-credit">
        <Sparkles size={16} />
        预计积分：{generateReady ? "40 积分" : "待补全前置步骤"}
      </p>
      {phase === "uploading" || phase === "generating" ? (
        <VideoGenerationProgress
          phase={phase}
          taskStatus={result?.status}
          title="复刻带货视频"
          durationSeconds={durationSeconds}
        />
      ) : null}
      {error && (
        <p className="creator-error" role="alert">
          {error}
        </p>
      )}
      {phase === "succeeded" && result?.outputs[0] && (
        <div className="recreate-result">
          <video src={result.outputs[0].url} controls playsInline />
          <a href={`/api/assets/${result.outputs[0].assetId}/download/`}>
            <Download size={16} />
            下载视频
          </a>
          <button type="button" onClick={goToVideoMix}>
            <Film size={16} />
            前往智能混剪
          </button>
        </div>
      )}
      <div className="recreate-actions">
        <button className="secondary" type="button" onClick={onGoPrevious} disabled={!canGoPrevious}>
          <ArrowLeft size={16} />
          上一步
        </button>
        <button className="primary" type="submit" disabled={!generateReady || phase !== "idle"}>
          {phase === "uploading" || phase === "generating" ? (
            <LoaderCircle className="generation-spinner" size={18} />
          ) : (
            <Film size={18} />
          )}
          {phase === "uploading" || phase === "generating" ? "任务处理中" : "生成复刻视频"}
        </button>
        <button className="secondary" type="button" onClick={onReset}>
          重置
        </button>
      </div>
    </section>
  );
}
