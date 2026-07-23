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

    ALTER TABLE generation_tasks ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
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
    ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_byte_size_check;
    ALTER TABLE assets ADD CONSTRAINT assets_byte_size_check CHECK (byte_size >= 0 AND byte_size <= 104857600);

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

    CREATE TABLE IF NOT EXISTS operations_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operation TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED')),
      summary TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS operations_runs_created_idx ON operations_runs (created_at DESC);

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
