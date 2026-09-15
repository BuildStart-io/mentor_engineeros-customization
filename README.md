# BuildStart.io — Mentor Engineers Workshop Customization Edition

Everything in this bundle runs on **your** infrastructure. Customized specifically for **Mentor Engineers Automotive Service & Mechanical Workshop**, providing a WhatsApp AI booking assistant, workshop jobs pipeline, and customized dashboard.

The only thing left on
Lovable is a single stateless function, `ai-generate`, which forwards prompts to
the Lovable AI Gateway and returns text. It touches no database and stores nothing.

```
┌──────────── your server ────────────────────────────────────────────────────────┐
│  frontend (Vite workshop dashboard)                                            │
│        │ supabase-js                                                           │
│  self-hosted Supabase                                                          │
│    postgres + auth + kong + edge-runtime                                       │
│      ├ webhook-wsender ─► message_queue                                        │
│      ├ process-message  (queue drainer, cron)                                  │
│      ├ ai-chat  ── workshop prompt, standalone oil, add-ons upsell, bookings ──┼──► Lovable ai-generate ──► AI Gateway
│      ├ send-whatsapp ──► WAHA / WhatsApp Web                                   │
│      ├ media-storage ──► MinIO                                                 │
│      └ send-push ──────► Firebase                                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

`ai-chat` stays local on purpose: catalog, FAQs, plan quotas, order extraction and
`ai_usage_logs` never leave your database. The prompt, model
(`google/gemini-3-flash-preview`) and `max_tokens` (500) are byte-identical to the
Lovable-hosted version, so reply quality is unchanged.

### Key Workshop Customizations

1. **5 Workshop Branches**: General/Full Service, Standalone Oil Change, Vehicle Wash, Mechanical Repair & Diagnostic Intake, Detailing & Polish.
2. **Standalone Oil Change**: Independent flow with Labour LKR 1,200 + oil price.
3. **Full Service Engine Oil Lock**: Confirms if engine oil change is needed before displaying oil grades.
4. **Mandatory Workshop Add-On Upsell**: Proactively presents popular add-ons (Caliper Pin Greasing, Cabin AC Filter, Wiper Blades, Underbody Wax, Coolant Flush, etc.) before booking.
5. **Physical Workshop Mode**: Eliminates delivery/shipping address queries.
6. **Order Custom Fields Schema**: Automatically extracts vehicle registration number, model, appointment date/time slot, and service category into `orders.custom_fields`.
7. **Bookings & Workshop Jobs Dashboard**: Table and Calendar view with vehicle details and status updates (`confirmed`, `received`, `in_progress`, `finished`).

## Layout

```
db/01_schema.sql        full public schema: tables, enums, RLS, GRANTs, functions, triggers
db/02_seed.sql          plan limits + first-admin template (no tenant data — clean start)
db/03_cron.sql          pg_cron jobs (queue drainer, follow-ups)
supabase/functions/     all 12 edge functions (ai-generate is NOT here — it lives on Lovable)
frontend/               the full dashboard, including super-admin and billing pages
.env.example            every variable, split by process
```

## Boot order

1. **Start Supabase self-hosted** (the official `docker/docker-compose.yml` from
   `supabase/supabase`). Keep `db`, `auth`, `rest`, `kong`, `storage`, `studio`,
   `functions` (edge-runtime).
2. **Schema**
   ```bash
   psql "$DB_URL" -f db/01_schema.sql
   psql "$DB_URL" -f db/02_seed.sql
   ```
3. **Auth**: disable public sign-ups (`GOTRUE_DISABLE_SIGNUP=true`) — this product is
   login-only. Create your first user in Studio, then run the commented block at the
   bottom of `02_seed.sql` to give it a profile + `super_admin` role.
4. **Edge functions**: mount `supabase/functions` into the edge-runtime container and
   give it the function env vars from `.env.example`. All functions verify JWTs in
   code, so run the runtime with `--no-verify-jwt`.
5. **Cron**: fill in the placeholders in `db/03_cron.sql` and run it.
6. **WAHA**: point its webhook at
   `http://<your-host>:8000/functions/v1/webhook-wsender`.
7. **MinIO**: one public bucket per business, named `biz-<user_id>`; `media-storage`
   creates them on demand.
8. **Frontend**
   ```bash
   cd frontend && cp ../.env.example .env   # keep only the VITE_ lines
   npm install && npm run dev
   ```
9. **Regenerate DB types** after any schema change:
   ```bash
   npx supabase gen types typescript --db-url "$DB_URL" > frontend/src/integrations/supabase/types.ts
   ```

## The Lovable side

One function, `ai-generate`:

```
POST https://<lovable-ref>.supabase.co/functions/v1/ai-generate
x-bot-key: <bot key>
{ "systemPrompt": "...", "messages": [{"role":"user","content":"hi"}],
  "model": "google/gemini-3-flash-preview", "maxTokens": 500 }

200 { "text": "...", "model": "...", "usage": { "promptTokens": 812, ... } }
```

Errors: `401` bad bot key, `400` bad request, `429` rate limited (retry with
backoff), `402` credits exhausted, `502` upstream failure.

## Running many bots against the same gateway

This is the point of the split, and it works without changes:

- Each bot is its own self-hosted stack (own Postgres, own WAHA session, own MinIO
  bucket) with its own `BOT_API_KEY`.
- `ai-generate` is stateless, so N bots hitting it concurrently is just N HTTP
  requests; nothing is shared, nothing collides.
- Add a bot: append a new key to the gateway's `BOT_API_KEYS` (comma-separated),
  set `BOT_API_KEY` on the new bot, done. No redeploy of the Lovable function needed
  beyond the secret update.
- Revoke a bot: remove its key from `BOT_API_KEYS`; it starts getting `401`.
- Quotas stay **local** to each bot (`ai_usage_logs`, `contact_usage`, plan tiers).
  The gateway deliberately enforces no per-key ceiling, so all bots draw from the
  same Lovable credit pool. Watch total credits, and if one tenant must be capped,
  cap it in that bot's `platform_settings.plan_limits`.
- Only shared cost centre is AI credits. Everything else scales per bot.

## Security notes

- `LOVABLE_API_KEY` never leaves Lovable. Bots only ever hold a bot key.
- Bot keys are bearer credentials: keep them in the edge-runtime env, never in
  frontend code.
- All tables are RLS-protected and scoped by `user_id`; roles live in `user_roles`
  and are checked with the `has_role()` security-definer function.
