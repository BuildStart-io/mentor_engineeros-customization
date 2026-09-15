-- ============================================================================
-- 02_seed.sql — clean start seed (no tenant data).
-- Run AFTER 01_schema.sql.
-- ============================================================================

-- Plan limits used by the dashboard and by the quota checks inside the
-- edge functions. Edit freely from Super Admin → Settings later.
INSERT INTO mentor_engineeros_customization.platform_settings (key, value)
VALUES (
  'plan_limits',
  '{
    "free":       {"max_products": 5,   "max_faqs": 10,  "max_orders_per_month": 50,   "contacts_per_month": 50,   "ai_messages_per_month": 100,   "max_images_per_product": 1,  "max_staff": 0},
    "pro":        {"max_products": 50,  "max_faqs": 100, "max_orders_per_month": 500,  "contacts_per_month": 300,  "ai_messages_per_month": 2000,  "max_images_per_product": 5,  "max_staff": 0},
    "enterprise": {"max_products": 999, "max_faqs": 999, "max_orders_per_month": 9999, "contacts_per_month": 1500, "ai_messages_per_month": 99999, "max_images_per_product": 10, "max_staff": 2}
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- First admin account.
--
-- 1. Create the auth user first (Studio → Authentication → Add user, email +
--    password, "Auto Confirm User" ON), then copy its UUID.
-- 2. Replace <USER_UUID> and <EMAIL> below and run this block.
-- ----------------------------------------------------------------------------
-- INSERT INTO mentor_engineeros_customization.profiles (user_id, email, full_name, plan_tier, billing_cycle_start)
-- VALUES ('<USER_UUID>', '<EMAIL>', 'Owner', 'enterprise', now())
-- ON CONFLICT (user_id) DO NOTHING;
--
-- INSERT INTO mentor_engineeros_customization.user_roles (user_id, role)
-- VALUES ('<USER_UUID>', 'super_admin')
-- ON CONFLICT (user_id, role) DO NOTHING;
--
-- INSERT INTO mentor_engineeros_customization.settings (user_id, key, value) VALUES
--   ('<USER_UUID>', 'welcome_message', '{"text": "Welcome! How can I help you today?"}'::jsonb),
--   ('<USER_UUID>', 'payment_info',    '{"accounts": []}'::jsonb),
--   ('<USER_UUID>', 'auto_responses',  '{"enabled": true}'::jsonb)
-- ON CONFLICT DO NOTHING;
