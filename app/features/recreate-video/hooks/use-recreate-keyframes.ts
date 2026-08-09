import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { uploadRecreateItem } from "../api";
import {
  captureVideoFrameForCanvas,
  extractFramesInBrowser,
  loadImageForCanvas,
} from "../browser-media";
import { defaultKeyframes } from "../media";
import type {
  DouyinAnalysis,
  Item,
  KeyframeSelection,
  PolishedRecreatePrompt,
  RecreateFrameAnalysis,
  WorkflowStep,
} from "../types";

type ReferenceFrameAnalysisBody = {
  analysis?: RecreateFrameAnalysis;
  frames?: Array<{ time: number; url: string }>;
};

type UseRecreateKeyframesOptions = {
  clearTaskState: () => void;
  douyinAnalysis: DouyinAnalysis | null;
  douyinClipDuration: number;
  douyinStart: number;
  setDouyinCacheExpired: (expired: boolean) => void;
  setDouyinError: (error: string) => void;
  setNotice: (notice: string) => void;
  setPolishedPrompt: Dispatch<SetStateAction<PolishedRecreatePrompt | null>>;
  sourceSelection: Item | null | undefined;
  step: WorkflowStep;
};

const drawKeyframePlaceholder = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
) => {
  context.save();
  context.fillStyle = "#edf4fa";
  context.fillRect(x, y, width, height);
  context.fillStyle = "#7a8fa4";
  context.font = "22px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + width / 2, y + height / 2);
  context.restore();
};

export function useRecreateKeyframes({
  clearTaskState,
  douyinAnalysis,
  douyinClipDuration,
  douyinStart,
  setDouyinCacheExpired,
  setDouyinError,
  setNotice,
  setPolishedPrompt,
  sourceSelection,
  step,
}: UseRecreateKeyframesOptions) {
  const [selectedKeyframes, setSelectedKeyframes] = useState<KeyframeSelection[]>([]);
  const [frameExtractionBusy, setFrameExtractionBusy] = useState(false);
  const [frameAnalysisBusy, setFrameAnalysisBusy] = useState(false);
  const [frameAnalysis, setFrameAnalysis] = useState<RecreateFrameAnalysis | null>(null);
  const [frameAnalysisFrames, setFrameAnalysisFrames] = useState<Array<{ time: number; url: string }>>([]);
  const autoKeyframeSourceRef = useRef<string | null>(null);

  const keyframeCandidates = useMemo<KeyframeSelection[]>(() => {
    if (frameAnalysisFrames.length) {
      return frameAnalysisFrames.map((frame, index) => ({
        time: frame.time,
        url: frame.url,
        label: `AI关键画面 ${index + 1}`,
      }));
    }
    if (selectedKeyframes.length) return selectedKeyframes;
    return defaultKeyframes(sourceSelection?.durationSeconds);
  }, [frameAnalysisFrames, selectedKeyframes, sourceSelection?.durationSeconds]);

  const selectedKeyframeKeys = useMemo(
    () => new Set(selectedKeyframes.map((frame) => frame.time.toFixed(1))),
    [selectedKeyframes],
  );
  const selectableKeyframes = useMemo(() => keyframeCandidates.slice(0, 12), [keyframeCandidates]);
  const allCandidateKeyframesSelected =
    selectableKeyframes.length > 0 &&
    selectableKeyframes.every((frame) => selectedKeyframeKeys.has(frame.time.toFixed(1)));

  const toggleKeyframe = (frame: KeyframeSelection) => {
    setSelectedKeyframes((current) => {
      const key = frame.time.toFixed(1);
      if (current.some((item) => item.time.toFixed(1) === key))
        return current.filter((item) => item.time.toFixed(1) !== key);
      return [...current, frame]
        .sort((first, second) => first.time - second.time)
        .slice(0, 12);
    });
    clearTaskState();
  };

  const toggleAllKeyframes = () => {
    setSelectedKeyframes(
      allCandidateKeyframesSelected
        ? []
        : selectableKeyframes
            .map((frame, index) => ({
              ...frame,
              label: frame.label || `关键画面 ${index + 1}`,
            }))
            .sort((first, second) => first.time - second.time),
    );
    clearTaskState();
  };

  const useDefaultKeyframes = () => {
    setSelectedKeyframes(defaultKeyframes(sourceSelection?.durationSeconds));
    clearTaskState();
  };

  const requestReferenceFrameAnalysis = async () => {
    if (!douyinAnalysis?.cacheId) throw new Error("请先获取对标视频");
    const response = await fetch("/api/workflows/recreate-video-analysis/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cacheId: douyinAnalysis.cacheId,
        startSeconds:
          typeof sourceSelection?.clipStartSeconds === "number"
            ? sourceSelection.clipStartSeconds
            : douyinStart,
        durationSeconds: sourceSelection?.durationSeconds || douyinAnalysis.durationSeconds || douyinClipDuration,
        replacementGoals: ["替换商品", "替换模特", "替换背景/场景参考"],
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (body?.code === "CACHE_EXPIRED" || response.status === 410) {
        setDouyinCacheExpired(true);
        setFrameAnalysis(null);
        setFrameAnalysisFrames([]);
      }
      throw new Error(body?.message || body?.code || "关键帧识别失败");
    }
    return body as ReferenceFrameAnalysisBody;
  };

  const applyReferenceFrameAnalysis = (body: ReferenceFrameAnalysisBody) => {
    setFrameAnalysis(body.analysis || null);
    const extractedFrames = (body.frames || []).map((frame) => ({
      time: frame.time,
      url: frame.url,
    }));
    setFrameAnalysisFrames(extractedFrames);
    if (!selectedKeyframes.length)
      setSelectedKeyframes(
        extractedFrames.slice(0, 12).map((frame, index) => ({
          ...frame,
          label: `AI关键画面 ${index + 1}`,
        })),
      );
    const analysisPrompt = body.analysis?.prompt;
    if (analysisPrompt) {
      setPolishedPrompt((current) =>
        current || {
          summary: body.analysis?.summary || "已根据关键帧生成基础复刻方案",
          preserve: ["镜头节奏", "构图", "动作走势", "光线氛围"],
          replace: ["按复刻口令和上传素材做通配替换"],
          materialUse: ["能匹配上的素材优先使用，匹配不上的素材不强行使用"],
          avoid: ["原人物脸", "原商品", "原品牌", "Logo", "水印", "原字幕"],
          finalPrompt: analysisPrompt,
        },
      );
    }
  };

  const analyzeReplaceableFrames = async () => {
    if (!douyinAnalysis?.cacheId || frameAnalysisBusy) return;
    setFrameAnalysisBusy(true);
    setDouyinError("");
    setDouyinCacheExpired(false);
    try {
      const body = await requestReferenceFrameAnalysis();
      applyReferenceFrameAnalysis(body);
      setNotice("AI 已识别关键帧，并生成基础复刻方案");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "关键帧识别失败");
    } finally {
      setFrameAnalysisBusy(false);
    }
  };

  const quickExtractKeyframes = async () => {
    if (!sourceSelection || frameExtractionBusy) return;
    setFrameExtractionBusy(true);
    setDouyinError("");
    setDouyinCacheExpired(false);
    try {
      if (sourceSelection.source === "douyin" && douyinAnalysis?.cacheId) {
        const response = await fetch("/api/workflows/recreate-video-analysis/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cacheId: douyinAnalysis.cacheId,
            mode: "frames",
            startSeconds:
              typeof sourceSelection.clipStartSeconds === "number"
                ? sourceSelection.clipStartSeconds
                : douyinStart,
            durationSeconds: sourceSelection.durationSeconds || douyinAnalysis?.durationSeconds || douyinClipDuration,
          }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          if (body?.code === "CACHE_EXPIRED" || response.status === 410) {
            setDouyinCacheExpired(true);
            setFrameAnalysis(null);
            setFrameAnalysisFrames([]);
          }
          throw new Error(body?.message || body?.code || "快速抽帧失败");
        }
        const frames = (body.frames || []).map((frame: { time: number; url: string }, index: number) => ({
          time: frame.time,
          url: frame.url,
          label: `关键画面 ${index + 1}`,
        }));
        setFrameAnalysisFrames(frames);
        setSelectedKeyframes(frames.slice(0, 12));
        setNotice("已快速抽取十二宫格关键画面；可继续写复刻口令");
      } else {
        const frames = await extractFramesInBrowser(sourceSelection.preview, sourceSelection.durationSeconds);
        setFrameAnalysisFrames(
          frames
            .filter((frame): frame is KeyframeSelection & { url: string } => Boolean(frame.url))
            .map((frame) => ({ time: frame.time, url: frame.url })),
        );
        setSelectedKeyframes(frames.slice(0, 12));
        setNotice("已在浏览器本地快速抽取十二宫格关键画面");
      }
      window.setTimeout(() => setNotice(""), 2400);
      clearTaskState();
    } catch (caught) {
      const fallbackFrames = defaultKeyframes(sourceSelection.durationSeconds);
      setSelectedKeyframes(fallbackFrames);
      setFrameAnalysisFrames([]);
      setNotice("无法直接抽取截图，已先使用默认时间点；可继续操作或换一个视频");
      setDouyinError(caught instanceof Error ? caught.message : "快速抽帧失败");
      window.setTimeout(() => setNotice(""), 2600);
    } finally {
      setFrameExtractionBusy(false);
    }
  };

  useEffect(() => {
    const sourceKey =
      sourceSelection?.assetId || sourceSelection?.preview || sourceSelection?.name || "";
    const hasOnlyTimePoints =
      selectedKeyframes.length > 0 && selectedKeyframes.every((frame) => !frame.url);
    if (
      !["clip", "product"].includes(step) ||
      !sourceSelection ||
      !sourceKey ||
      frameExtractionBusy ||
      frameAnalysisFrames.length ||
      !hasOnlyTimePoints ||
      autoKeyframeSourceRef.current === sourceKey
    )
      return;
    autoKeyframeSourceRef.current = sourceKey;
    const timer = window.setTimeout(() => {
      void quickExtractKeyframes();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [
    step,
    sourceSelection?.assetId,
    sourceSelection?.preview,
    sourceSelection?.name,
    selectedKeyframes.length,
    frameAnalysisFrames.length,
    frameExtractionBusy,
  ]);

  const createKeyframeCollageAsset = async () => {
    const frames = selectedKeyframes.filter((frame): frame is KeyframeSelection & { url: string } => Boolean(frame.url)).slice(0, 12);
    if (frames.length < 4) return null;
    const columns = frames.length <= 8 ? 4 : 4;
    const rows = Math.ceil(frames.length / columns);
    const cellWidth = 360;
    const cellHeight = 640;
    const labelHeight = 42;
    const gap = 8;
    const padding = 16;
    const width = columns * cellWidth + (columns - 1) * gap + padding * 2;
    const height = rows * (cellHeight + labelHeight) + (rows - 1) * gap + padding * 2;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("十二宫格参考图生成失败");
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, width, height);
    context.font = "24px sans-serif";
    context.textBaseline = "middle";
    context.textAlign = "left";
    const drawMotionStructureKeyframe = (
      image: HTMLImageElement,
      x: number,
      y: number,
      cellWidth: number,
      cellHeight: number,
    ) => {
      const proxy = document.createElement("canvas");
      proxy.width = 144;
      proxy.height = 256;
      const proxyContext = proxy.getContext("2d");
      if (!proxyContext) return false;
      const proxyScale = Math.max(proxy.width / image.naturalWidth, proxy.height / image.naturalHeight);
      const proxyDrawWidth = image.naturalWidth * proxyScale;
      const proxyDrawHeight = image.naturalHeight * proxyScale;
      proxyContext.fillStyle = "#ffffff";
      proxyContext.fillRect(0, 0, proxy.width, proxy.height);
      proxyContext.drawImage(
        image,
        (proxy.width - proxyDrawWidth) / 2,
        (proxy.height - proxyDrawHeight) / 2,
        proxyDrawWidth,
        proxyDrawHeight,
      );
      const source = proxyContext.getImageData(0, 0, proxy.width, proxy.height);
      const output = proxyContext.createImageData(proxy.width, proxy.height);
      const gray = new Uint8ClampedArray(proxy.width * proxy.height);
      for (let index = 0; index < gray.length; index += 1) {
        const offset = index * 4;
        gray[index] = Math.round(source.data[offset] * 0.299 + source.data[offset + 1] * 0.587 + source.data[offset + 2] * 0.114);
      }
      const pixel = (px: number, py: number) => gray[Math.max(0, Math.min(proxy.height - 1, py)) * proxy.width + Math.max(0, Math.min(proxy.width - 1, px))];
      for (let py = 0; py < proxy.height; py += 1) {
        for (let px = 0; px < proxy.width; px += 1) {
          const gx =
            -pixel(px - 1, py - 1) + pixel(px + 1, py - 1) -
            2 * pixel(px - 1, py) + 2 * pixel(px + 1, py) -
            pixel(px - 1, py + 1) + pixel(px + 1, py + 1);
          const gy =
            -pixel(px - 1, py - 1) - 2 * pixel(px, py - 1) - pixel(px + 1, py - 1) +
            pixel(px - 1, py + 1) + 2 * pixel(px, py + 1) + pixel(px + 1, py + 1);
          const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));
          const line = magnitude > 34 ? 30 : 246;
          const offset = (py * proxy.width + px) * 4;
          output.data[offset] = line;
          output.data[offset + 1] = line;
          output.data[offset + 2] = line;
          output.data[offset + 3] = 255;
        }
      }
      proxyContext.putImageData(output, 0, 0);
      context.save();
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, 18);
      context.clip();
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, cellWidth, cellHeight);
      context.imageSmoothingEnabled = true;
      context.filter = "contrast(1.08)";
      context.drawImage(proxy, x, y, cellWidth, cellHeight);
      context.filter = "none";
      context.fillStyle = "rgba(255, 255, 255, 0.12)";
      context.fillRect(x, y, cellWidth, cellHeight);
      context.strokeStyle = "rgba(14, 165, 233, 0.34)";
      context.lineWidth = 1;
      for (let gridX = x + cellWidth / 3; gridX < x + cellWidth; gridX += cellWidth / 3) {
        context.beginPath();
        context.moveTo(gridX, y);
        context.lineTo(gridX, y + cellHeight);
        context.stroke();
      }
      for (let gridY = y + cellHeight / 4; gridY < y + cellHeight; gridY += cellHeight / 4) {
        context.beginPath();
        context.moveTo(x, gridY);
        context.lineTo(x + cellWidth, gridY);
        context.stroke();
      }
      context.restore();
      return true;
    };
    for (const [index, frame] of frames.entries()) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (cellWidth + gap);
      const y = padding + row * (cellHeight + labelHeight + gap);
      const image = await loadImageForCanvas(frame.url)
        .catch(() => sourceSelection?.preview ? captureVideoFrameForCanvas(sourceSelection.preview, frame.time) : null)
        .catch(() => null);
      if (image) {
        drawMotionStructureKeyframe(image, x, y, cellWidth, cellHeight);
      } else {
        drawKeyframePlaceholder(context, x, y, cellWidth, cellHeight, "关键帧暂不可用");
      }
      context.fillStyle = "rgba(15, 23, 42, 0.86)";
      context.fillRect(x, y + cellHeight - labelHeight, cellWidth, labelHeight);
      context.fillStyle = "#ffffff";
      context.fillText(`画面 ${index + 1} · ${frame.time.toFixed(1)}s`, x + 14, y + cellHeight - labelHeight / 2);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("十二宫格参考图导出失败");
    const file = new File([blob], "recreate-motion-structure-collage.jpg", { type: "image/jpeg" });
    const preview = URL.createObjectURL(file);
    try {
      return await uploadRecreateItem({
        file,
        preview,
        name: "动作结构十二宫格参考图",
        byteSize: file.size,
        temporaryDerived: true,
      });
    } finally {
      URL.revokeObjectURL(preview);
    }
  };

  const prepareKeyframeCollageReference = async () => {
    const hasVisualKeyframes = selectedKeyframes.some((frame) => frame.url);
    if (!hasVisualKeyframes) return null;
    return createKeyframeCollageAsset();
  };

  const resetKeyframes = () => {
    setFrameAnalysis(null);
    setFrameAnalysisFrames([]);
    setSelectedKeyframes([]);
    autoKeyframeSourceRef.current = null;
  };

  return {
    allCandidateKeyframesSelected,
    analyzeReplaceableFrames,
    applyReferenceFrameAnalysis,
    frameAnalysis,
    frameAnalysisBusy,
    frameAnalysisFrames,
    frameExtractionBusy,
    prepareKeyframeCollageReference,
    quickExtractKeyframes,
    requestReferenceFrameAnalysis,
    resetKeyframes,
    selectableKeyframes,
    selectedKeyframeKeys,
    selectedKeyframes,
    setFrameAnalysis,
    setFrameAnalysisBusy,
    setFrameAnalysisFrames,
    setSelectedKeyframes,
    toggleAllKeyframes,
    toggleKeyframe,
    useDefaultKeyframes,
  };
}
