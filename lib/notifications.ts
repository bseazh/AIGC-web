import type { PoolClient } from "pg";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export async function enqueueTaskNotification(
  client: PoolClient,
  task: { id: string; userId: string; email: string | null; workflowKey: string; points: number },
  outcome: "SUCCEEDED" | "FAILED" | "REJECTED",
) {
  if (!task.email) return;
  const labels = {
    SUCCEEDED: { event: "TASK_COMPLETED", subject: "你的创作任务已完成", result: "已通过审核，可以下载。" },
    FAILED: { event: "TASK_FAILED", subject: "你的创作任务未完成", result: `执行失败，${task.points} 积分已退回。` },
    REJECTED: { event: "TASK_REJECTED", subject: "你的创作任务未通过审核", result: `结果未通过内容审核，${task.points} 积分已退回。` },
  } as const;
  const label = labels[outcome];
  const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>任务 <strong>${escapeHtml(task.id)}</strong>（${escapeHtml(task.workflowKey)}）${label.result}</p><p><a href="${escapeHtml(process.env.PUBLIC_APP_URL || "https://aigc.bigapple.store")}/tasks/${escapeHtml(task.id)}">查看任务详情</a></p></div>`;
  await client.query(
    `INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (idempotency_key) DO NOTHING`,
    [task.userId, task.email, label.event, label.subject, html, `${label.event.toLowerCase()}:${task.id}`],
  );
}

export async function enqueueComplaintNotification(
  client: PoolClient,
  complaint: { id: string; complaintNo: string; userId: string; email: string | null; status: string },
) {
  if (!complaint.email) return;
  const html = `<div style="font-family:Arial,sans-serif;color:#283241;line-height:1.7"><h2>芭乐AIGC</h2><p>投诉单 <strong>${escapeHtml(complaint.complaintNo)}</strong> 状态已更新为 ${escapeHtml(complaint.status)}。</p><p><a href="${escapeHtml(process.env.PUBLIC_APP_URL || "https://aigc.bigapple.store")}/complaints">查看处理进度</a></p></div>`;
  await client.query(
    `INSERT INTO notification_outbox (user_id, recipient, event_type, subject, html_body, idempotency_key)
     VALUES ($1, $2, 'COMPLAINT_UPDATED', '投诉处理进度已更新', $3, $4) ON CONFLICT (idempotency_key) DO NOTHING`,
    [complaint.userId, complaint.email, html, `complaint:${complaint.id}:${complaint.status}`],
  );
}
