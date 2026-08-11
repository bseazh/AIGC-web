import type { GeneratedTaskResult } from "@/app/components/generated-asset-actions";

export async function imageRequest<T = Record<string, unknown>>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.code || "请求失败");
  return body as T;
}

export async function uploadImageFile(file: File, label = "素材") {
  const presign = await imageRequest<{ assetId: string; uploadUrl: string }>("/api/uploads/presign/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }),
  });
  const upload = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!upload.ok) throw new Error(`${label}上传失败 (${upload.status})`);
  await imageRequest("/api/uploads/confirm/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetId: presign.assetId }),
  });
  return presign.assetId;
}

export async function pollImageTask(
  taskId: string,
  onUpdate: (task: GeneratedTaskResult) => void,
  timeoutMs = 6 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await imageRequest<GeneratedTaskResult>(`/api/tasks/${taskId}/`, { cache: "no-store" });
    onUpdate(current);
    if (current.status === "SUCCEEDED") return current;
    if (["FAILED", "REJECTED", "CANCELED"].includes(current.status)) throw new Error(current.errorCode || "生成失败，积分已退回");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("任务等待超时，请稍后在任务中心查看");
}
