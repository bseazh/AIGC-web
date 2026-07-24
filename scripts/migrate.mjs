import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT,
      phone TEXT,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '芭乐用户',
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING', 'DELETED')),
      token_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (email IS NOT NULL OR phone IS NOT NULL)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone) WHERE phone IS NOT NULL;

    CREATE TABLE IF NOT EXISTS wallets (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      available_points INTEGER NOT NULL DEFAULT 0 CHECK (available_points >= 0),
      frozen_points INTEGER NOT NULL DEFAULT 0 CHECK (frozen_points >= 0),
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      business_type TEXT NOT NULL,
      business_id TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      workflow_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELED')),
      points INTEGER NOT NULL DEFAULT 0,
      input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS generation_tasks_user_created_idx ON generation_tasks (user_id, created_at DESC);
    ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS request_id TEXT;

    ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    ALTER TABLE generation_tasks DROP CONSTRAINT IF EXISTS generation_tasks_status_check;
    ALTER TABLE generation_tasks ADD CONSTRAINT generation_tasks_status_check
      CHECK (status IN ('DRAFT', 'PENDING_INPUT_REVIEW', 'QUEUED', 'RUNNING', 'PENDING_REVIEW', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELED'));
    CREATE UNIQUE INDEX IF NOT EXISTS generation_tasks_idempotency_unique ON generation_tasks (idempotency_key) WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      byte_size BIGINT NOT NULL CHECK (byte_size >= 0 AND byte_size <= 104857600),
      audit_status TEXT NOT NULL DEFAULT 'PENDING',
      original_name TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE assets ADD COLUMN IF NOT EXISTS original_name TEXT;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    UPDATE assets SET audit_status = 'PENDING_REVIEW' WHERE audit_status = 'PENDING';
    ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_audit_status_check;
    ALTER TABLE assets ADD CONSTRAINT assets_audit_status_check CHECK (audit_status IN ('UPLOADING', 'PENDING_REVIEW', 'READY', 'REJECTED'));
    ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_byte_size_check;
    ALTER TABLE assets ADD CONSTRAINT assets_byte_size_check CHECK (byte_size >= 0 AND byte_size <= 104857600);

    CREATE TABLE IF NOT EXISTS content_review_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
      phase TEXT NOT NULL CHECK (phase IN ('UPLOAD', 'GENERATED_OUTPUT')),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'NEEDS_MANUAL', 'APPROVED', 'REJECTED')),
      review_source TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (review_source IN ('SYSTEM', 'MANUAL')),
      risk_level TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (risk_level IN ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH')),
      reason_code TEXT,
      note TEXT,
      reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS content_review_records_status_created_idx ON content_review_records (status, created_at);
    CREATE INDEX IF NOT EXISTS content_review_records_asset_idx ON content_review_records (asset_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS content_review_records_active_asset_unique
      ON content_review_records (asset_id) WHERE status IN ('PENDING', 'NEEDS_MANUAL');

    CREATE TABLE IF NOT EXISTS content_violations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL REFERENCES content_review_records(id) ON DELETE CASCADE,
      asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CONFIRMED', 'DISMISSED')),
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS content_violations_status_created_idx ON content_violations (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS complaints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      complaint_no TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id),
      task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
      issue_type TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED')),
      admin_note TEXT,
      assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS complaints_user_created_idx ON complaints (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS complaints_status_created_idx ON complaints (status, created_at);

    CREATE TABLE IF NOT EXISTS complaint_attachments (
      complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
      PRIMARY KEY (complaint_id, asset_id)
    );

    CREATE TABLE IF NOT EXISTS complaint_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL CHECK (actor_role IN ('USER', 'ADMIN', 'SYSTEM')),
      from_status TEXT,
      to_status TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS complaint_events_complaint_created_idx ON complaint_events (complaint_id, created_at);

    CREATE TABLE IF NOT EXISTS login_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      revoke_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS login_sessions_user_active_idx ON login_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_digest TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      requested_ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_created_idx ON password_reset_tokens (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS notification_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      recipient TEXT NOT NULL,
      event_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox (next_attempt_at, created_at) WHERE status IN ('PENDING', 'FAILED');

    ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identifier_required_check;
    ALTER TABLE users ADD CONSTRAINT users_identifier_required_check
      CHECK (status = 'DELETED' OR email IS NOT NULL OR phone IS NOT NULL);

    CREATE TABLE IF NOT EXISTS prompt_config_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_key TEXT NOT NULL,
      version INTEGER NOT NULL,
      variant_key TEXT NOT NULL DEFAULT 'control',
      rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
      config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workflow_key, version, variant_key)
    );
    CREATE INDEX IF NOT EXISTS prompt_config_versions_active_idx ON prompt_config_versions (workflow_key, enabled, version DESC);

    CREATE TABLE IF NOT EXISTS provider_call_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      response_status INTEGER,
      response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS provider_call_logs_task_created_idx ON provider_call_logs (task_id, created_at DESC);
    ALTER TABLE provider_call_logs ADD COLUMN IF NOT EXISTS provider_request_id TEXT;

    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_id TEXT PRIMARY KEY,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details_json JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS payment_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_no TEXT NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL CHECK (provider IN ('WECHAT_NATIVE')),
      status TEXT NOT NULL CHECK (status IN ('CREATED', 'PENDING', 'PAID', 'CLOSED', 'FAILED', 'REFUNDED')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      points INTEGER NOT NULL CHECK (points > 0),
      package_key TEXT NOT NULL,
      description TEXT NOT NULL,
      provider_prepay_id TEXT,
      provider_transaction_id TEXT UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx ON payment_orders (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS payment_orders_status_expires_idx ON payment_orders (status, expires_at);

    CREATE TABLE IF NOT EXISTS payment_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      order_no TEXT,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payment_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      refund_no TEXT NOT NULL UNIQUE,
      order_id UUID NOT NULL REFERENCES payment_orders(id),
      provider_refund_id TEXT UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('REQUESTING', 'PROCESSING', 'SUCCESS', 'CLOSED', 'ABNORMAL', 'FAILED')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      points INTEGER NOT NULL CHECK (points > 0),
      reason TEXT NOT NULL,
      requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
      failure_reason TEXT,
      success_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_refunds_order_created_idx ON payment_refunds (order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS payment_refunds_status_created_idx ON payment_refunds (status, created_at);

    CREATE TABLE IF NOT EXISTS payment_reconciliation_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_date DATE NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
      local_count INTEGER NOT NULL DEFAULT 0,
      provider_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      mismatch_count INTEGER NOT NULL DEFAULT 0,
      report_path TEXT,
      error_message TEXT,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_reconciliation_runs_created_idx ON payment_reconciliation_runs (created_at DESC);

    CREATE TABLE IF NOT EXISTS payment_reconciliation_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES payment_reconciliation_runs(id) ON DELETE CASCADE,
      order_id UUID REFERENCES payment_orders(id) ON DELETE SET NULL,
      order_no TEXT,
      provider_transaction_id TEXT,
      issue_type TEXT NOT NULL,
      local_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      provider_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_reconciliation_items_run_idx ON payment_reconciliation_items (run_id, created_at);
    CREATE INDEX IF NOT EXISTS payment_reconciliation_items_unresolved_idx ON payment_reconciliation_items (created_at DESC) WHERE resolved_at IS NULL;

    CREATE TABLE IF NOT EXISTS content_authorizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
      source_url TEXT,
      consent_version TEXT NOT NULL,
      consent_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS content_authorizations_user_created_idx ON content_authorizations (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_storage_quotas (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      quota_bytes BIGINT NOT NULL DEFAULT 1073741824 CHECK (quota_bytes >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL, resource_type TEXT, resource_id TEXT,
      ip_address TEXT, user_agent TEXT, details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_events_user_created_idx ON audit_events (user_id, created_at DESC);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_style TEXT NOT NULL DEFAULT 'ocean';

    CREATE TABLE IF NOT EXISTS operations_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operation TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED')),
      summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS operations_runs_created_idx ON operations_runs (created_at DESC);

    CREATE TABLE IF NOT EXISTS recharge_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code_digest TEXT NOT NULL UNIQUE,
      code_hint TEXT NOT NULL,
      points INTEGER NOT NULL CHECK (points > 0),
      max_redemptions INTEGER NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
      redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0 AND redeemed_count <= max_redemptions),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
      note TEXT,
      expires_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS recharge_codes_status_created_idx ON recharge_codes (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS recharge_code_redemptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code_id UUID NOT NULL REFERENCES recharge_codes(id),
      user_id UUID NOT NULL REFERENCES users(id),
      points INTEGER NOT NULL CHECK (points > 0),
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (code_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS recharge_code_redemptions_user_created_idx ON recharge_code_redemptions (user_id, created_at DESC);

    INSERT INTO prompt_config_versions (workflow_key, version, variant_key, rollout_percent, config_json)
    VALUES
      ('product-ad-video', 1, 'control', 100, '{"template":"将输入的产品图片制作成高品质商品广告大片。综合识别全部图片中的材质、颜色、细节与卖点，围绕商品设计开场、细节、使用或氛围镜头和收束镜头。","watermark":false}'),
      ('recreate-video', 1, 'control', 100, '{"template":"参考视频只用于提取镜头节奏、景别、运镜与转场结构。不得复制原视频中的人物、品牌、商品、文案或具体画面；使用输入商品生成原创带货短片。参考音频仅用于节奏参考，生成全新的声音内容。","watermark":false}'),
      ('seedance-video', 1, 'control', 100, '{"template":"按用户脚本和全部参考素材生成原创 15 秒短片，优先遵循首帧、尾帧、参考视频与参考音频的角色定义。","watermark":false}')
    ON CONFLICT (workflow_key, version, variant_key) DO NOTHING;
  `);
  await client.query("COMMIT");
  console.log("Database migrations completed");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
