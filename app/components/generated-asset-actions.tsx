"use client";

import { Check, Download, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";

export type GeneratedTaskOutput = {
  assetId: string;
  url: string;
  mimeType?: string;
  name?: string;
  savedToLibrary?: boolean;
  expiresAt?: string | null;
};

export type GeneratedTaskResult = {
  taskId: string;
  status: string;
  outputs: GeneratedTaskOutput[];
  errorCode?: string;
  expiredOutputCount?: number;
  originalOutputCount?: number;
  workflowKey?: string;
};

export async function loadProjectTaskResult(projectId: string) {
  if (!projectId) return null;
  const draftResponse = await fetch(`/api/workflow-drafts/${projectId}/`, { cache: "no-store" });
  const draftBody = await draftResponse.json().catch(() => null);
  const taskId = draftResponse.ok && typeof draftBody?.draft?.taskId === "string" ? draftBody.draft.taskId : "";
  if (!taskId) return null;
  const taskResponse = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" });
  const taskBody = await taskResponse.json().catch(() => null);
  if (!taskResponse.ok || !taskBody?.taskId) return null;
  return taskBody as GeneratedTaskResult;
}

export function restoredTaskPhase(task: GeneratedTaskResult) {
  if (task.status === "SUCCEEDED") return "succeeded" as const;
  if (["FAILED", "REJECTED", "CANCELED"].includes(task.status)) return "failed" as const;
  return "generating" as const;
}

export function watchProjectTaskResult(projectId: string, onResult: (result: GeneratedTaskResult) => void) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = async () => {
    const result = await loadProjectTaskResult(projectId).catch(() => null);
    if (cancelled || !result) return;
    onResult(result);
    if (!["SUCCEEDED", "FAILED", "REJECTED", "CANCELED"].includes(result.status)) {
      timer = setTimeout(tick, 5000);
    }
  };
  void tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export function temporaryResultText(output?: GeneratedTaskOutput) {
  if (output?.savedToLibrary) return "已保存到素材库，将长期保留";
  if (output?.expiresAt) return `临时结果，将于 ${new Date(output.expiresAt).toLocaleString("zh-CN")} 过期`;
  return "生成完成，结果临时保留 48 小时";
}

export function TemporaryResultNotice({ result }: { result?: GeneratedTaskResult | null }) {
  if (!result || result.status !== "SUCCEEDED") return null;
  if (!result.outputs.length && (result.expiredOutputCount || 0) > 0) {
    return <p className="creator-result-expired">结果文件已过期并清理，项目和输入参数仍保留，可重新生成。</p>;
  }
  const unsaved = result.outputs.filter((output) => !output.savedToLibrary);
  return (
    <p className="creator-result-temporary">
      {unsaved.length ? temporaryResultText(unsaved[0]) : "生成结果已保存到素材库，将长期保留"}
    </p>
  );
}

type Props = {
  output: GeneratedTaskOutput;
  downloadLabel?: string;
  onSaved?: (assetId: string) => void;
};

export function GeneratedAssetActions({ output, downloadLabel = "下载", onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(output.savedToLibrary === true);
  const [error, setError] = useState("");

  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/${output.assetId}/save/`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "添加到素材库失败");
      setSaved(true);
      onSaved?.(output.assetId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加到素材库失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="generated-asset-actions">
      <a href={`/api/assets/${output.assetId}/download/`}>
        <Download size={15} />
        {downloadLabel}
      </a>
      <button type="button" onClick={save} disabled={saving || saved}>
        {saving ? <LoaderCircle className="generation-spinner" size={15} /> : saved ? <Check size={15} /> : <Plus size={15} />}
        {saving ? "保存中" : saved ? "已保存到素材库" : "添加到素材库"}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
