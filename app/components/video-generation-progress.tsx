"use client";

import { Check, Clock3, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  phase: "uploading" | "generating";
  taskStatus?: string;
  title: string;
  durationSeconds: number;
  overlay?: boolean;
};

const steps = ["上传素材", "创建任务", "队列等待", "AI 生成", "保存结果"];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function expectedSeconds(durationSeconds: number) {
  if (durationSeconds <= 5) return 4 * 60;
  if (durationSeconds <= 10) return 6 * 60;
  return 8 * 60;
}

export function VideoGenerationProgress({
  phase,
  taskStatus,
  title,
  durationSeconds,
  overlay = false,
}: Props) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const currentStep =
    phase === "uploading"
      ? 0
      : taskStatus === "RUNNING"
        ? 3
        : taskStatus === "QUEUED"
          ? 2
          : 1;
  const estimate = expectedSeconds(durationSeconds);
  const remaining = Math.max(0, estimate - elapsedSeconds);
  const overtimeSeconds = Math.max(0, elapsedSeconds - estimate);
  const stageFloor = [4, 20, 32, 44, 96][currentStep];
  const stageCeiling = [18, 30, 42, 94, 99][currentStep];
  const timedProgress = Math.min(
    stageCeiling,
    stageFloor + (elapsedSeconds / estimate) * (stageCeiling - stageFloor),
  );
  const statusText =
    currentStep === 0
      ? "正在上传并校验素材"
      : currentStep === 1
        ? "正在创建视频任务"
        : currentStep === 2
          ? "任务排队中"
          : "模型正在生成视频";

  return (
    <section
      className={`video-generation-progress ${overlay ? "overlay" : ""}`}
      role="status"
      aria-live="polite"
    >
      <header>
        <LoaderCircle className="generation-spinner" size={22} />
        <div>
          <strong>{title}</strong>
          <small>{statusText}</small>
        </div>
      </header>
      <div className="video-progress-times">
        <div>
          <span>{overtimeSeconds > 0 ? "超过预估" : "预计剩余"}</span>
          <strong>{overtimeSeconds > 0 ? formatTime(overtimeSeconds) : formatTime(remaining)}</strong>
        </div>
        <div>
          <span>已处理</span>
          <strong>
            <Clock3 size={14} />
            {formatTime(elapsedSeconds)}
          </strong>
        </div>
      </div>
      <div
        className="video-progress-track"
        role="progressbar"
        aria-label="视频任务估算进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(timedProgress)}
      >
        <i style={{ width: `${timedProgress}%` }} />
      </div>
      <ol>
        {steps.map((step, index) => (
          <li
            className={
              index < currentStep
                ? "complete"
                : index === currentStep
                  ? "current"
                  : ""
            }
            key={step}
          >
            <i>{index < currentStep ? <Check size={12} /> : index + 1}</i>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p>
        {overtimeSeconds > 0
          ? "已超过预估时间，模型仍在处理；实际返回会受模型队列、视频复杂度和参考素材审核影响。"
          : `预计总耗时约 ${Math.round(estimate / 60)} 分钟，实际时间会受模型队列和视频复杂度影响。`}
      </p>
    </section>
  );
}
