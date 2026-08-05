import { useRef, useState } from "react";

import { getTaskStatus } from "../api";
import type { Result, WorkflowStep } from "../types";

export type RecreateTaskPhase = "idle" | "uploading" | "generating" | "succeeded" | "failed";

type UseRecreateTaskOptions = {
  setStep: (step: WorkflowStep) => void;
  setNotice: (notice: string) => void;
};

export function useRecreateTask({ setStep, setNotice }: UseRecreateTaskOptions) {
  const [phase, setPhase] = useState<RecreateTaskPhase>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const restoringTaskRef = useRef<string | null>(null);

  const clearTaskState = () => {
    setError("");
    setResult(null);
    setPhase("idle");
  };

  async function poll(taskId: string) {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const task = await getTaskStatus(taskId);
      setResult(task);
      if (task.status === "SUCCEEDED") {
        setPhase("succeeded");
        return;
      }
      if (["FAILED", "REJECTED", "CANCELED"].includes(task.status))
        throw new Error(task.errorCode || "视频生成失败，积分已退回");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error("视频仍在生成中，请稍后在任务中心查看");
  }

  const restoreProjectTask = async (taskId: string | null | undefined) => {
    if (!taskId || restoringTaskRef.current === taskId) return;
    restoringTaskRef.current = taskId;
    try {
      const task = await getTaskStatus(taskId);
      if (!task?.taskId) throw new Error();
      setResult(task);
      if (["SUCCEEDED"].includes(task.status)) {
        setPhase("succeeded");
        setStep("generate");
      } else if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) {
        setPhase("failed");
        setStep("generate");
        setError(task.errorCode || "任务已结束");
      } else {
        setPhase("generating");
        setStep("generate");
        await poll(taskId);
      }
    } catch {
      setNotice("项目已恢复，任务状态稍后可在任务中心查看");
      window.setTimeout(() => setNotice(""), 2200);
    } finally {
      restoringTaskRef.current = null;
    }
  };

  return {
    clearTaskState,
    error,
    phase,
    poll,
    restoreProjectTask,
    result,
    setError,
    setPhase,
    setResult,
  };
}
