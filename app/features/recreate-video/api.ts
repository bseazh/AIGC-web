import { recreateWorkflowKey } from "./constants";
import { sha256Hex } from "./media";
import type { Asset, Draft, Item, Result, ServerDraft } from "./types";

export async function listRecreateDrafts() {
  const response = await fetch(`/api/workflow-drafts/?workflowKey=${recreateWorkflowKey}`, { cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error("项目列表加载失败");
  return (body?.drafts || []) as ServerDraft[];
}

export async function getRecreateDraft(id: string) {
  const response = await fetch(`/api/workflow-drafts/${id}/`, { cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return (body?.draft || null) as ServerDraft | null;
}

export async function saveRecreateDraft(input: {
  id: string | null;
  title: string;
  payload: Draft;
}) {
  const response = await fetch("/api/workflow-drafts/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      workflowKey: recreateWorkflowKey,
      title: input.title,
      payload: input.payload,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.draft) throw new Error("项目保存失败");
  return body.draft as ServerDraft;
}

export async function deleteRecreateDraft(id: string) {
  const response = await fetch(`/api/workflow-drafts/${id}/`, { method: "DELETE" });
  if (!response.ok) throw new Error("项目删除失败");
}

export async function uploadRecreateItem(item: Item) {
  if (item.assetId) return item.assetId;
  if (!item.file) throw new Error("素材未找到");
  const contentHash = await sha256Hex(item.file);
  const response = await fetch("/api/uploads/presign/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: item.file.name,
      mimeType: item.file.type,
      byteSize: item.file.size,
      contentHash,
    }),
  });
  const presign = await response.json();
  if (!response.ok) throw new Error(presign.message || "上传失败");
  if (presign.duplicate && typeof presign.assetId === "string") return presign.assetId as string;
  if (
    !(
      await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": item.file.type },
        body: item.file,
      })
    ).ok
  )
    throw new Error("上传失败");
  const confirmed = await fetch("/api/uploads/confirm/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId: presign.assetId,
      contentHash,
      ...(item.file.type === "video/mp4" ? { videoDurationSeconds: item.durationSeconds } : {}),
    }),
  });
  if (!confirmed.ok) {
    const body = await confirmed.json().catch(() => null);
    throw new Error(body?.message || "素材校验失败");
  }
  return presign.assetId as string;
}

export async function resolveAssetPreviewUrl(assetId: string, fallbackUrl: string) {
  const response = await fetch("/api/assets/?kind=ALL", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return fallbackUrl;
  const body = await response.json().catch(() => null);
  const asset = Array.isArray(body?.assets)
    ? body.assets.find((item: Asset) => item.id === assetId)
    : null;
  return typeof asset?.url === "string" ? asset.url : fallbackUrl;
}

export async function sanitizeReferenceVideoAsset(assetId: string, aspectRatio: string) {
  const response = await fetch("/api/workflows/recreate-video-sanitize/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId, aspectRatio }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "合规参考视频生成失败");
  return body.assetId as string;
}

export async function getTaskStatus(taskId: string) {
  const response = await fetch(`/api/tasks/${taskId}/`, { cache: "no-store" });
  const task = await response.json().catch(() => null);
  if (!response.ok) throw new Error(task?.message || "任务查询失败");
  return task as Result & {
    errorCode?: string;
    outputs?: Array<{ assetId: string; url: string; name?: string }>;
  };
}

export async function createRecreateVideoTask(input: {
  draftId: string;
  assetIds: string[];
  prompt: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
}) {
  const response = await fetch("/api/tasks/recreate-video/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      draftId: input.draftId,
      assetIds: input.assetIds,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      duration: input.duration,
      resolution: input.resolution,
      scene: "镜头节奏复刻",
      style: "自然带货",
      usageAuthorized: true,
    }),
  });
  const created = await response.json().catch(() => null);
  if (!response.ok) throw new Error(created?.message || created?.code || "创建任务失败");
  return created as { taskId: string };
}
