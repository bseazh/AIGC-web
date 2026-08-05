import { useMemo, useState } from "react";

import {
  sanitizeReferenceVideoAsset,
  uploadRecreateItem,
} from "../api";
import { readVideoDuration } from "../browser-media";
import type {
  Asset,
  DouyinAnalysis,
  Item,
  SourceKind,
  SourceMode,
  WorkflowStep,
} from "../types";

type UseRecreateSourceOptions = {
  clearTaskState: () => void;
  compliantReferenceVideo: boolean;
  ratio: string;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setStep: (step: WorkflowStep) => void;
};

export function useRecreateSource({
  clearTaskState,
  compliantReferenceVideo,
  ratio,
  setError,
  setNotice,
  setStep,
}: UseRecreateSourceOptions) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("douyin");
  const [videoSource, setVideoSource] = useState<"local" | "library" | "douyin">("douyin");
  const [libraryKind, setLibraryKind] = useState<SourceKind | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [sourceItem, setSourceItem] = useState<Item | null>(null);
  const [douyinClips, setClips] = useState<Item[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [douyinInput, setDouyinInput] = useState("");
  const [douyinBusy, setDouyinBusy] = useState<"analyzing" | "importing" | null>(null);
  const [douyinError, setDouyinError] = useState("");
  const [douyinCacheExpired, setDouyinCacheExpired] = useState(false);
  const [douyinAnalysis, setDouyinAnalysis] = useState<DouyinAnalysis | null>(null);
  const [douyinStart, setDouyinStart] = useState(0);
  const [douyinClipDuration, setDouyinClipDuration] = useState(15);

  const sourceSelection = useMemo(
    () => (activeClipId ? douyinClips.find((item) => item.assetId === activeClipId) : null) || sourceItem,
    [activeClipId, douyinClips, sourceItem],
  );
  const selectedClip = sourceSelection?.assetId
    ? douyinClips.find((item) => item.assetId === sourceSelection.assetId) || null
    : sourceSelection;

  const openLibrary = async (kind: SourceKind) => {
    setLibraryKind(kind);
    setAssetsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setAssets(
        (body.assets || []).filter((asset: Asset) =>
          kind === "video"
            ? asset.mimeType === "video/mp4"
            : asset.mimeType.startsWith("image/"),
        ),
      );
    } catch {
      setError("素材库加载失败，请稍后再试");
    } finally {
      setAssetsLoading(false);
    }
  };

  const selectVideoAsset = (asset: Asset) => {
    if (asset.durationSeconds && (asset.durationSeconds < 3 || asset.durationSeconds > 15))
      return setError("该视频需在 3–15 秒内，请重新上传后使用");
    const selected: Item = {
      assetId: asset.id,
      preview: asset.url,
      name: asset.originalName,
      byteSize: asset.byteSize,
      durationSeconds: asset.durationSeconds || undefined,
    };
    setSourceMode("library");
    setVideoSource("library");
    setSourceItem(selected);
    setClips([selected]);
    setActiveClipId(selected.assetId || null);
    setDouyinAnalysis(null);
    setDouyinInput("");
    clearTaskState();
    setStep("clip");
    setLibraryKind(null);
    return { durationSeconds: selected.durationSeconds };
  };

  const chooseVideo = async (files?: FileList | null) => {
    if (!files?.length) return;
    const file = Array.from(files)[0];
    if (file.type !== "video/mp4")
      return setError("对标视频仅支持 MP4 格式");
    if (file.size > 100 * 1024 * 1024)
      return setError("对标视频不能超过 100MB");
    try {
      const durationSeconds = await readVideoDuration(file);
      if (durationSeconds < 3 || durationSeconds > 15)
        return setError(
          `该视频 ${durationSeconds.toFixed(1)} 秒，当前仅支持 3–15 秒。超出部分请先截取后再上传。`,
        );
      const selected = {
        file,
        preview: URL.createObjectURL(file),
        name: file.name,
        byteSize: file.size,
        durationSeconds,
      };
      setSourceMode("upload");
      setVideoSource("local");
      setSourceItem(selected);
      setClips([selected]);
      setActiveClipId(null);
      setDouyinAnalysis(null);
      setDouyinInput("");
      clearTaskState();
      setStep("clip");
      return { durationSeconds };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取视频时长");
    }
    return null;
  };

  const analyzeDouyin = async () => {
    if (!douyinInput.trim() || douyinBusy) return;
    setError("");
    setDouyinError("");
    setDouyinCacheExpired(false);
    setDouyinBusy("analyzing");
    try {
      const response = await fetch("/api/imports/douyin/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: douyinInput, action: "analyze" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "ANALYZED")
        throw new Error(body?.message || "抖音链接解析失败");
      setDouyinAnalysis({
        title: body.title,
        durationSeconds: body.durationSeconds,
        clipRequired: body.clipRequired === true,
        clipDurations: body.clipDurations || [5, 10, 15],
        cacheId: body.cacheId,
        cachePreviewUrl: body.cachePreviewUrl,
        cacheByteSize: body.cacheByteSize,
        cacheExpiresAt: body.cacheExpiresAt,
        referencePrompt: body.referencePrompt,
        keyframeSeconds: body.keyframeSeconds,
      });
      if (body.cachePreviewUrl) {
        setSourceMode("douyin");
        setVideoSource("douyin");
        setSourceItem({
          preview: body.cachePreviewUrl,
          name: body.title || "抖音对标视频",
          byteSize: body.cacheByteSize || 0,
          durationSeconds: body.durationSeconds,
          source: "douyin",
          clipStartSeconds: 0,
          clipEndSeconds: Math.min(15, body.durationSeconds),
        });
        setClips([]);
        setActiveClipId(null);
      }
      setDouyinStart(0);
      setDouyinClipDuration(
        body.durationSeconds >= 15 ? 15 : body.durationSeconds >= 10 ? 10 : 5,
      );
      return { durationSeconds: body.durationSeconds };
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "抖音链接解析失败");
    } finally {
      setDouyinBusy(null);
    }
    return null;
  };

  const importDouyin = async () => {
    if (!douyinAnalysis || douyinBusy) return;
    if (douyinClips.length >= 10) {
      setDouyinError("已保留 10 个片段，请先移除一个片段再继续截取");
      return;
    }
    setError("");
    setDouyinError("");
    setDouyinCacheExpired(false);
    setDouyinBusy("importing");
    try {
      const response = await fetch("/api/imports/douyin/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: douyinInput,
          action: "import",
          cacheId: douyinAnalysis.cacheId,
          ...(douyinAnalysis.clipRequired
            ? {
                startSeconds: douyinStart,
                clipDurationSeconds: douyinClipDuration,
              }
            : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY")
        throw new Error(body?.message || "抖音视频导入失败");
      const importedClip: Item = {
        assetId: body.assetId,
        preview: body.url,
        name: body.name,
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds,
        source: "douyin",
        clipStartSeconds: body.clipStartSeconds,
        clipEndSeconds: body.clipEndSeconds,
      };
      setSourceMode("douyin");
      setVideoSource("douyin");
      setSourceItem(importedClip);
      setClips((current) =>
        current.some((item) => item.assetId === importedClip.assetId)
          ? current
          : [...current, importedClip].slice(0, 10),
      );
      setActiveClipId(importedClip.assetId || null);
      clearTaskState();
      setStep("clip");
      setNotice("片段已保存到素材库");
      window.setTimeout(() => setNotice(""), 1800);
      return {
        durationSeconds: body.durationSeconds,
        startSeconds: typeof body.clipStartSeconds === "number" ? body.clipStartSeconds : 0,
      };
    } catch (caught) {
      setDouyinError(caught instanceof Error ? caught.message : "抖音视频导入失败");
    } finally {
      setDouyinBusy(null);
    }
    return null;
  };

  const moveClip = (index: number, direction: -1 | 1) =>
    setClips((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeClip = (assetId?: string) => {
    if (!assetId) return;
    setClips((current) => current.filter((item) => item.assetId !== assetId));
    if (activeClipId === assetId) setActiveClipId(null);
    if (sourceItem?.assetId === assetId) setSourceItem(null);
    clearTaskState();
  };

  const prepareReferenceVideoAsset = async (item: Item) => {
    if (item.assetId) return item.assetId;
    if (item.source === "douyin" && douyinAnalysis?.cacheId) {
      const response = await fetch("/api/imports/douyin/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: douyinInput,
          action: "import",
          cacheId: douyinAnalysis.cacheId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "READY")
        throw new Error(body?.message || "参考视频准备失败");
      const importedClip: Item = {
        assetId: body.assetId,
        preview: body.url,
        name: body.name,
        byteSize: body.byteSize,
        durationSeconds: body.durationSeconds,
        source: "douyin",
        clipStartSeconds: body.clipStartSeconds,
        clipEndSeconds: body.clipEndSeconds,
      };
      setSourceItem(importedClip);
      setClips((current) =>
        current.some((clip) => clip.assetId === importedClip.assetId)
          ? current
          : [importedClip, ...current].slice(0, 10),
      );
      setActiveClipId(importedClip.assetId || null);
      return body.assetId as string;
    }
    return uploadRecreateItem(item);
  };

  const prepareCompliantReferenceVideoAsset = async (assetId: string) => {
    if (!compliantReferenceVideo) return assetId;
    setNotice("正在生成动作结构参考视频");
    const sanitizedAssetId = await sanitizeReferenceVideoAsset(assetId, ratio);
    setNotice("已生成动作结构参考视频，将用于提交给视频模型");
    window.setTimeout(() => setNotice(""), 2600);
    return sanitizedAssetId;
  };

  const returnToSourceForExpiredCache = () => {
    setDouyinCacheExpired(false);
    setDouyinError("");
    setDouyinAnalysis(null);
    setStep("source");
    setNotice("对标视频缓存已清除，请重新获取视频");
    window.setTimeout(() => setNotice(""), 2200);
  };

  const resetSource = () => {
    setSourceItem(null);
    setClips([]);
    setVideoSource("douyin");
    setSourceMode("douyin");
    setDouyinInput("");
    setDouyinError("");
    setDouyinAnalysis(null);
    setDouyinStart(0);
    setDouyinClipDuration(15);
    setActiveClipId(null);
    setLibraryKind(null);
    setDouyinCacheExpired(false);
  };

  return {
    activeClipId,
    analyzeDouyin,
    assets,
    assetsLoading,
    chooseVideo,
    douyinAnalysis,
    douyinBusy,
    douyinCacheExpired,
    douyinClipDuration,
    douyinClips,
    douyinError,
    douyinInput,
    douyinStart,
    importDouyin,
    libraryKind,
    moveClip,
    openLibrary,
    prepareCompliantReferenceVideoAsset,
    prepareReferenceVideoAsset,
    removeClip,
    resetSource,
    returnToSourceForExpiredCache,
    selectedClip,
    selectVideoAsset,
    setActiveClipId,
    setClips,
    setDouyinAnalysis,
    setDouyinCacheExpired,
    setDouyinClipDuration,
    setDouyinError,
    setDouyinInput,
    setDouyinStart,
    setLibraryKind,
    setSourceItem,
    setSourceMode,
    setVideoSource,
    sourceItem,
    sourceMode,
    sourceSelection,
    videoSource,
  };
}
