import { readFile } from "node:fs/promises";

const checks = [
  [
    "content review disabled by default",
    ".env.example",
    "CONTENT_REVIEW_ENABLED=false",
  ],
  [
    "upload becomes immediately ready",
    "app/api/uploads/confirm/route.ts",
    'status: "READY"',
  ],
  [
    "worker directly settles when review is disabled",
    "scripts/worker.mjs",
    "contentReviewEnabled ? await submitForReview(task, savedAssets) : await settleSuccess(task, savedAssets)",
  ],
  [
    "lifecycle releases historical pending outputs",
    "scripts/lifecycle-maintenance.mjs",
    "settleBypassedOutputTask",
  ],
  [
    "manual review cannot be overwritten by automation",
    "scripts/moderation-worker.mjs",
    'review.review_source === "MANUAL"',
  ],
  [
    "download READY gate",
    "app/api/assets/[id]/download/route.ts",
    "audit_status = 'READY'",
  ],
  [
    "task list avoids pending output URL",
    "app/api/tasks/list/route.ts",
    'task.status === "SUCCEEDED"',
  ],
  [
    "asset library separates uploads and generated results",
    "app/assets/page.tsx",
    'title: "生成结果", assets: generatedAssets',
  ],
  [
    "asset thumbnails open media preview",
    "app/assets/page.tsx",
    '<button className="asset-media" type="button"',
  ],
  [
    "asset downloads remain explicit",
    "app/assets/page.tsx",
    "href={`/api/assets/${asset.id}/download/`}",
  ],
  [
    "ready generated assets can be reused as task inputs",
    "lib/task-creation.ts",
    "kind = 'OUTPUT' AND audit_status = 'READY'",
  ],
  [
    "administrator content assets entry",
    "app/admin/page.tsx",
    '<Link href="/assets"><Boxes',
  ],
  [
    "task outputs open media preview",
    "app/tasks/[id]/page.tsx",
    "setPreviewOutput(output)",
  ],
  [
    "image workflows show elapsed generation time",
    "app/components/image-workflow-page.tsx",
    "<GenerationProgress",
  ],
  [
    "model wear shows elapsed generation time",
    "app/create/model-wear/page.tsx",
    "<GenerationProgress",
  ],
  [
    "product ad video shows staged progress",
    "app/components/product-ad-video-page.tsx",
    "<VideoGenerationProgress",
  ],
  [
    "video workflows show staged progress",
    "app/components/video-workflow-page.tsx",
    "<VideoGenerationProgress",
  ],
  [
    "recreate video shows staged progress",
    "app/components/recreate-video-page.tsx",
    "<VideoGenerationProgress",
  ],
  [
    "recreate video accepts Douyin links",
    "app/components/recreate-video-page.tsx",
    'fetch("/api/imports/douyin/"',
  ],
  [
    "Douyin imports enforce a 15 second limit",
    "lib/douyin-import.ts",
    "DOUYIN_MAX_DURATION_SECONDS = 15",
  ],
  [
    "Douyin imports support server-validated time ranges",
    "lib/douyin-import.ts",
    "--download-sections",
  ],
  [
    "Recreate video keeps an ordered Douyin clip collection",
    "app/components/recreate-video-page.tsx",
    "douyinClips",
  ],
  [
    "Recreate video hands clips to video mix",
    "app/components/recreate-video-page.tsx",
    "aigc-video-mix-asset-ids",
  ],
  [
    "Recreate video saves account drafts",
    "app/components/recreate-video-page.tsx",
    'fetch("/api/workflow-drafts/"',
  ],
  [
    "Recreate video shows one current project",
    "app/components/recreate-video-page.tsx",
    "visibleDrafts = useMemo(() => serverDrafts.slice(0, 1)",
  ],
  [
    "Recreate video supports previous step navigation",
    "app/components/recreate-video-page.tsx",
    "goPreviousStep",
  ],
  [
    "Recreate video requires selected keyframes before replacement",
    "app/components/recreate-video-page.tsx",
    "selectedKeyframes.length >= 4",
  ],
  [
    "Recreate video clip step exposes keyframe picker",
    "app/components/recreate-video-page.tsx",
    "recreate-keyframe-picker",
  ],
  [
    "Recreate video supports fast keyframe extraction without AI",
    "app/components/recreate-video-page.tsx",
    "快速抽取关键画面",
  ],
  [
    "Recreate video frame endpoint can skip AI analysis",
    "app/api/workflows/recreate-video-analysis/route.ts",
    'body.mode === "frames"',
  ],
  [
    "Recreate video product step shows recreate command workflow",
    "app/components/recreate-video-page.tsx",
    "复刻口令与素材",
  ],
  [
    "Recreate video product step polishes recreate commands",
    "app/components/recreate-video-page.tsx",
    "AI润色口令",
  ],
  [
    "Recreate video material tags can be referenced in commands",
    "app/components/recreate-video-page.tsx",
    "recreate-material-tags",
  ],
  [
    "Recreate video material tags support @ mentions",
    "app/components/recreate-video-page.tsx",
    "recreate-mention-menu",
  ],
  [
    "Recreate video can convert portraits to privacy multi-view references",
    "app/components/recreate-video-page.tsx",
    "生成隐私化人物多视图",
  ],
  [
    "Recreate video exposes a clear material processing module",
    "app/components/recreate-video-page.tsx",
    "素材智能处理",
  ],
  [
    "Recreate video material module identifies uploaded assets",
    "app/components/recreate-video-page.tsx",
    "智能识别素材",
  ],
  [
    "Recreate video lets users actively tag material kind",
    "app/components/recreate-video-page.tsx",
    "主动标识",
  ],
  [
    "Recreate video material kind selector includes model product and scene",
    "app/components/recreate-video-page.tsx",
    "<option value=\"scene\">场景",
  ],
  [
    "Recreate video person multi-view prompt keeps full body instead of clothing only",
    "app/components/recreate-video-page.tsx",
    "禁止输出单件服装多视图",
  ],
  [
    "Recreate video material analysis prioritizes worn clothing as person",
    "app/api/workflows/recreate-material-analysis/route.ts",
    "只要图片中能看到完整人体、人体轮廓、穿着服装的人、模特试穿效果，就必须优先判为 person",
  ],
  [
    "Recreate video material module supports product multi-view references",
    "app/components/recreate-video-page.tsx",
    "生成商品多视图",
  ],
  [
    "Recreate video material module supports scene multi-view references",
    "app/components/recreate-video-page.tsx",
    "生成场景多视图",
  ],
  [
    "Recreate video material images open a zoom preview",
    "app/components/recreate-video-page.tsx",
    "setPreviewMedia({ url, name, mimeType: \"image/*\" })",
  ],
  [
    "Recreate video can submit MP4-only diagnostic tasks",
    "app/components/recreate-video-page.tsx",
    "仅 MP4 测试模式",
  ],
  [
    "Recreate video MP4-only mode skips keyframe collage submission",
    "app/components/recreate-video-page.tsx",
    "mp4OnlyTest ? null : await prepareKeyframeCollageReference()",
  ],
  [
    "Recreate video can create lightweight compliant reference videos",
    "app/components/recreate-video-page.tsx",
    "轻量合规参考视频",
  ],
  [
    "Recreate video compliant reference mode calls the sanitize endpoint",
    "app/components/recreate-video-page.tsx",
    "/api/workflows/recreate-video-sanitize/",
  ],
  [
    "Recreate video sanitize endpoint removes audio and adds grid blur",
    "app/api/workflows/recreate-video-sanitize/route.ts",
    "low-resolution-blur-grid-no-audio",
  ],
  [
    "Recreate video supports deterministic face mask strengthening",
    "app/components/recreate-video-page.tsx",
    "强化脸部遮盖",
  ],
  [
    "Recreate video face mask strengthening overlays a grid",
    "app/components/recreate-video-page.tsx",
    "privacy-masked-multiview.jpg",
  ],
  [
    "Recreate video face mask strengthening uses detected face regions first",
    "app/components/recreate-video-page.tsx",
    "analyzeFaceMaskRegions(source.assetId)",
  ],
  [
    "Recreate video face mask analysis endpoint calls SophNet",
    "app/api/workflows/recreate-face-mask-analysis/route.ts",
    "recreate_face_mask_analysis",
  ],
  [
    "Recreate video face mask analysis returns normalized face regions",
    "app/api/workflows/recreate-face-mask-analysis/route.ts",
    "faceRegions",
  ],
  [
    "Recreate video material analysis endpoint calls SophNet",
    "app/api/workflows/recreate-material-analysis/route.ts",
    "recreate_material_analysis",
  ],
  [
    "Recreate video privacy multi-view prompt masks face identity",
    "app/components/recreate-video-page.tsx",
    "所有出现脸部的位置都必须做隐私化处理",
  ],
  [
    "Recreate video submits keyframe collage as a reference image",
    "app/components/recreate-video-page.tsx",
    "createKeyframeCollageAsset",
  ],
  [
    "Recreate video prompt identifies the submitted keyframe collage",
    "app/components/recreate-video-page.tsx",
    "第${collageImageIndex}张参考图是一张由已选关键画面拼接而成的十二宫格参考板",
  ],
  [
    "Recreate video task allows one system keyframe collage image",
    "app/api/tasks/recreate-video/route.ts",
    "系统会额外提交一张十二宫格参考图",
  ],
  [
    "Recreate video prompt polish endpoint uses SophNet",
    "app/api/workflows/recreate-video-analysis/route.ts",
    'body.mode === "polish"',
  ],
  [
    "Recreate video prompt polish receives material labels",
    "app/api/workflows/recreate-video-analysis/route.ts",
    "materialLabels",
  ],
  [
    "Recreate video no longer forces forward navigation",
    "app/components/recreate-video-page.tsx",
    "workflowSteps.findIndex((item) => item.key === step) > unlockedIndex",
  ],
  [
    "Workflow drafts archive duplicate active records",
    "app/api/workflow-drafts/route.ts",
    "archiveDuplicateDrafts",
  ],
  [
    "Workflow drafts persist to database",
    "scripts/migrate.mjs",
    "CREATE TABLE IF NOT EXISTS workflow_drafts",
  ],
  [
    "Generated tasks archive source drafts",
    "lib/task-creation.ts",
    "UPDATE workflow_drafts",
  ],
  [
    "Video mix accepts an ordered dynamic material list",
    "app/components/video-workflow-page.tsx",
    "mixUploads",
  ],
  [
    "Video center exposes the model spokesperson module",
    "app/components/video-center-page.tsx",
    "/create/model-spokesperson-video",
  ],
  [
    "Model spokesperson starts with an editable script workflow",
    "app/components/model-spokesperson-script-page.tsx",
    "使用文案生成口播视频 · 下一阶段",
  ],
  [
    "Model spokesperson scripts are server generated and rate limited",
    "app/api/workflows/model-spokesperson-script/route.ts",
    "spokesperson-script:attempts",
  ],
  [
    "Douyin import only accepts allowlisted hosts",
    "lib/douyin-import.ts",
    "hostname.endsWith(`.${domain}`)",
  ],
  [
    "Douyin import installs browser impersonation support",
    "scripts/install-yt-dlp.sh",
    "yt-dlp[default,curl-cffi]",
  ],
  [
    "Douyin import can reuse a headless browser profile",
    "lib/douyin-import.ts",
    'args.push("--cookies-from-browser"',
  ],
  [
    "Douyin analyze creates temporary source cache",
    "app/api/imports/douyin/route.ts",
    "createSourceCache",
  ],
  [
    "Douyin import can reuse temporary cache",
    "app/api/imports/douyin/route.ts",
    "importCachedDouyinVideo",
  ],
  [
    "Douyin temporary caches expire through lifecycle",
    "scripts/lifecycle-maintenance.mjs",
    "cleanupExpiredDouyinCaches",
  ],
  [
    "Recreate video previews cached Douyin source",
    "app/components/recreate-video-page.tsx",
    "原视频临时预览",
  ],
  [
    "Recreate video shows multi-frame reference prompt",
    "app/components/recreate-video-page.tsx",
    "十二宫格参考策略",
  ],
  [
    "Recreate video analysis extracts frames",
    "app/api/workflows/recreate-video-analysis/route.ts",
    "ffmpeg",
  ],
  [
    "Recreate video analysis calls SophNet Chat",
    "app/api/workflows/recreate-video-analysis/route.ts",
    "chat/completions",
  ],
  [
    "Expired Douyin cache cleanup removes frame images",
    "scripts/lifecycle-maintenance.mjs",
    "frameStorageKeys",
  ],
  [
    "Douyin search modal links become work links",
    "lib/douyin-import.ts",
    "modal_id",
  ],
  [
    "Douyin rejects non-work detail pages early",
    "lib/douyin-import.ts",
    "UNSUPPORTED_DOUYIN_PAGE",
  ],
  [
    "content rejection refund",
    "app/api/admin/reviews/[id]/route.ts",
    "CONTENT_REJECTED",
  ],
  ["server-side revocable sessions", "lib/session.ts", "login_sessions"],
  ["login failure limit", "app/api/auth/login/route.ts", "LOGIN_RATE_LIMITED"],
  [
    "task cancellation refund",
    "app/api/tasks/[id]/cancel/route.ts",
    "USER_CANCELED",
  ],
  [
    "lifecycle review timeout",
    "scripts/lifecycle-maintenance.mjs",
    "OUTPUT_REVIEW_TIMEOUT",
  ],
  [
    "deployment runs lifecycle maintenance",
    "scripts/deploy.sh",
    "systemctl start aigc-lifecycle-maintenance.service",
  ],
  [
    "account deletion finalization",
    "scripts/lifecycle-maintenance.mjs",
    "ACCOUNT_DELETION_FINALIZED",
  ],
  [
    "WeChat Native accepts code_url without prepay_id",
    "lib/wechat-pay.ts",
    "if (!response.ok || !payload?.code_url)",
  ],
  [
    "administrator login redirect",
    "app/api/auth/login/route.ts",
    'administrator ? "/admin" : "/workspace"',
  ],
  [
    "recharge code transaction lock",
    "app/api/recharge-codes/redeem/route.ts",
    "FOR UPDATE",
  ],
  [
    "recharge code idempotent ledger",
    "app/api/recharge-codes/redeem/route.ts",
    "recharge-code:${code.id}:${user.id}",
  ],
  [
    "production acceptance account bootstrap",
    "scripts/deploy.sh",
    "configure-production-acceptance.mjs",
  ],
  [
    "production acceptance review cleanup",
    "scripts/configure-production-acceptance.mjs",
    "ACCEPTANCE_CLEANUP",
  ],
  [
    "production recharge code acceptance",
    "scripts/ark-video-acceptance.mjs",
    "duplicate denial and disable",
  ],
  ["structured task logging", "scripts/worker.mjs", "task_started"],
  ["request correlation", "lib/task-creation.ts", "request_id"],
  ["administrator exempt billing", "lib/task-creation.ts", "ADMIN_EXEMPT_TASK"],
  [
    "administrator exempt failure settlement",
    "scripts/worker.mjs",
    'billingMode === "ADMIN_EXEMPT"',
  ],
  [
    "administrator exempt UI label",
    "app/components/app-shell.tsx",
    "管理员免积分",
  ],
  [
    "administrator exempt production acceptance",
    "scripts/admin-exempt-acceptance.mjs",
    "final wallet and ADMIN_EXEMPT_TASK audit",
  ],
  [
    "product hero production acceptance",
    "scripts/product-hero-acceptance.mjs",
    "real SophNet create/query/download protocol",
  ],
  [
    "real user product hero production acceptance",
    "scripts/real-user-product-hero-acceptance.mjs",
    "official recharge-code credit",
  ],
  [
    "real user account production preflight",
    "scripts/real-user-account-preflight.mjs",
    "publicEmailRegistration",
  ],
  ["SophNet provider logs", "scripts/worker.mjs", "create_image_task"],
  [
    "SophNet production preflight",
    "scripts/production-preflight.mjs",
    "SophNet access: OK",
  ],
  [
    "acceptance notification suppression",
    "scripts/worker.mjs",
    "notification_suppressed",
  ],
  [
    "routine task success email disabled by default",
    "lib/notifications.ts",
    'EMAIL_NOTIFY_TASK_SUCCEEDED !== "true"',
  ],
  [
    "wallet shows successful frozen-point settlement",
    "app/api/wallet/route.ts",
    "从冻结积分中正式扣除",
  ],
  [
    "direct email suppression",
    "lib/email.ts",
    "isNotificationRecipientSuppressed",
  ],
  [
    "systemd web failure alert",
    "deploy/aigc-web.service",
    "OnFailure=aigc-alert@%n.service",
  ],
  [
    "health timer production environment",
    "deploy/aigc-health-alert.service",
    "EnvironmentFile=-/home/ubuntu/project/AIGC_web/.env.production",
  ],
  [
    "health alert repeat suppression",
    "scripts/check-health-alert.sh",
    "HEALTH_ALERT_REPEAT_SECONDS",
  ],
  [
    "central log retention",
    "deploy/observability/loki-config.yml",
    "retention_period: 720h",
  ],
  [
    "registration rollout",
    "app/api/auth/register/route.ts",
    "PUBLIC_REGISTRATION_ROLLOUT_PERCENT",
  ],
  [
    "runtime Loki verification",
    "scripts/verify-observability.mjs",
    "Nginx request log was not found in Loki",
  ],
  [
    "SMTP alert fallback",
    "scripts/send-alert-email.mjs",
    "ALERT_EMAIL_TO || user",
  ],
  [
    "daily rollout report guard",
    "scripts/gray-rollout-report.mjs",
    "ELIGIBLE_FOR_25_PERCENT",
  ],
  [
    "rollout report reads configured traffic",
    "scripts/gray-rollout-report.mjs",
    "PUBLIC_REGISTRATION_ROLLOUT_PERCENT || 10",
  ],
];

let failed = false;
for (const [name, path, expected] of checks) {
  const source = await readFile(path, "utf8");
  const ok = source.includes(expected);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exitCode = 1;
