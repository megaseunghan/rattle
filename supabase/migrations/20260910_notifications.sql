-- 화면 38(알림 센터) / 52(알림 설정)

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('attendance', 'stock', 'sales')),
  type       TEXT NOT NULL, -- 'late' | 'no_show' | 'low_stock' | 'stock_reported' | 'purchase' | 'cleaning_done' | 'daily_report' | 'margin_drop' 등
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  dedupe_key TEXT, -- 같은 이벤트 중복 생성을 막기 위한 키 (예: 'no_show:2026-09-10:emp123')
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, dedupe_key)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_store_member" ON notifications FOR ALL USING (
  is_store_member(store_id)
) WITH CHECK (
  is_store_member(store_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_store_created ON notifications (store_id, created_at DESC);

-- ── 알림 설정 (매장별, 토글 없으면 앱에서 기본값 사용) ──
CREATE TABLE IF NOT EXISTS notification_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (store_id, setting_key)
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_settings_select" ON notification_settings
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "notification_settings_write" ON notification_settings
  FOR ALL USING (is_store_admin(store_id)) WITH CHECK (is_store_admin(store_id));
