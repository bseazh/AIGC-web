"use client";

import { Clock3, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  phase: "uploading" | "generating";
  taskStatus?: string;
  title: string;
  outputCount: number;
};

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function expectedDuration(outputCount: number) {
  if (outputCount <= 1) return "通常需要 1-3 分钟";
  if (outputCount >= 5) return "通常需要 3-6 分钟";
  return "通常需要 2-5 分钟";
}

export function GenerationProgress({ phase, taskStatus, title, outputCount }: Props) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const uploading = phase === "uploading";
  const queued = phase === "generating" && taskStatus !== "RUNNING";
  const resultTitle = title.endsWith("生成") ? title.slice(0, -2) : title;
  const progress = uploading
    ? Math.min(18, 5 + elapsedSeconds * 1.5)
    : queued
      ? Math.min(36, 22 + elapsedSeconds * 0.35)
      : Math.min(92, 38 + elapsedSeconds * 0.42);
  const heading = uploading
    ? "正在上传并校验素材"
    : queued
      ? "任务已提交，正在排队"
      : `正在生成${resultTitle} · ${outputCount} 张`;
  const detail = uploading ? "上传完成后将自动进入生成队列" : `${expectedDuration(outputCount)}，高峰期可能稍久`;

  return <div className="generation-overlay" role="status" aria-live="polite">
    <LoaderCircle className="generation-spinner" size={30} />
    <strong>{heading}</strong>
    <div className="generation-elapsed"><Clock3 size={15} /><span>已等待 {formatElapsed(elapsedSeconds)}</span></div>
    <div className="generation-progress-track" role="progressbar" aria-label="任务估算进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div>
    <small>{detail}</small>
  </div>;
}
