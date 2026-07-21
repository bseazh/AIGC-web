const required = ["ARK_API_KEY", "ARK_MODEL", "COS_BUCKET", "COS_REGION", "COS_SECRET_ID", "COS_SECRET_KEY", "ARK_ACCEPTANCE_INPUT_URL"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`ARK acceptance failed: missing ${missing.join(", ")}`);

const durations = (process.env.ARK_ACCEPTANCE_DURATIONS || "5,10,15").split(",").map(Number).filter(Number.isFinite);
const resolutions = (process.env.ARK_ACCEPTANCE_RESOLUTIONS || "480p,720p,1080p").split(",").filter(Boolean);
const ratio = process.env.ARK_ACCEPTANCE_RATIO || "9:16";
const inputUrl = process.env.ARK_ACCEPTANCE_INPUT_URL;
const outcomes = [];

function findVideoUrl(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.video_url === "string") return value.video_url;
  if (typeof value.url === "string" && /\.(mp4|mov|webm)(\?|$)/i.test(value.url)) return value.url;
  return Object.values(value).map(findVideoUrl).find(Boolean) || null;
}

for (const duration of durations) {
  for (const resolution of resolutions) {
    const request = {
      model: process.env.ARK_MODEL,
      content: [
        { type: "text", text: `验收任务：使用输入图片生成原创电商商品短视频，${duration} 秒，${resolution}，${ratio}。` },
        { type: "image_url", image_url: { url: inputUrl }, role: "reference_image" },
      ],
      ratio,
      duration,
      resolution,
      generate_audio: true,
      watermark: false,
    };
    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", { method: "POST", headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(request) });
    const body = await response.json().catch(() => null);
    const result = { duration, resolution, status: response.status, taskId: body?.id || null, error: body?.error?.message || null };
    outcomes.push(result);
    console.log(JSON.stringify(result));
  }
}

const pending = outcomes.filter((outcome) => outcome.taskId);
const deadline = Date.now() + 20 * 60 * 1000;
while (pending.length && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const outcome = pending[index];
    const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${outcome.taskId}`, { headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}` } });
    const body = await response.json().catch(() => null);
    const status = String(body?.status || "").toLowerCase();
    if (["succeeded", "success", "completed"].includes(status)) {
      outcome.completed = true;
      outcome.outputReceived = Boolean(findVideoUrl(body));
      pending.splice(index, 1);
      console.log(JSON.stringify(outcome));
    } else if (!response.ok || ["failed", "rejected", "canceled", "cancelled", "expired"].includes(status)) {
      outcome.error = body?.error?.message || `task ${status || response.status}`;
      pending.splice(index, 1);
      console.log(JSON.stringify(outcome));
    }
  }
}

for (const outcome of pending) outcome.error = "timed out";
if (outcomes.some((outcome) => !outcome.completed || !outcome.outputReceived)) process.exitCode = 1;
