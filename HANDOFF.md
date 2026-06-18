# Kita + Metro — Handoff

A non-technical rider's daily log (driver UI) + a desktop admin/superadmin
console. Built on TanStack Start v1 + Supabase (via Lovable Cloud).

## Roles

- **driver** — default for every new signup. Sees only their own data.
- **admin** — can view & edit any driver's records, manage fee categories,
  app settings, account access, and trigger password resets. Cannot
  promote/demote roles.
- **superadmin** — everything admin can do. Seeded on first boot from
  `SUPERADMIN_DEFAULT_PASSWORD` (env). Email/username from `app_settings`
  keys `superadmin_email` and `superadmin_username`.

Role storage: `public.user_roles (user_id, role)`. Checked via
`public.has_role(uuid, app_role)` SECURITY DEFINER function (referenced
from every RLS policy that gates by role).

## Database schema (public)

| Table | Purpose | Owner column |
| --- | --- | --- |
| `profiles` | One row per auth user. `is_enabled`, `access_mode`, `access_starts_at`, `access_ends_at` control sign-in window. `avatar_url` stored in `avatars` bucket. | `id = auth.uid()` |
| `user_roles` | Role assignments. | `user_id` |
| `security_questions` | Catalog of questions for self-serve password reset. | — |
| `user_security_answers` | Hashed answers (`pgcrypto` bcrypt). | `user_id` |
| `shifts` | Driver shift envelope: odometer in/out, gas rate. Partial unique index enforces one active shift per driver. | `driver_id` |
| `trips` | Trips inside a shift: `service_type` enum (`angkas`/`pabakal`/`padala`), distance, fare. | `driver_id` |
| `fuel_logs` | Mid-shift refuels: cost, liters, rate. | `driver_id` |
| `fee_categories` | Catalog (`income` / `expense`). Seeded with Tip, Tariff, Toll, Other (all income). | — |
| `fee_entries` | Income/expense entries per shift. | `driver_id` |
| `app_settings` | Key-value JSONB store for configurable defaults. | — |
| `audit_log` | Admin edit trail: `actor_id`, `entity_type`, `entity_id`, `action`, `before`, `after`. Insert-only for admins; admins/superadmin can read. | `actor_id` |

### RLS posture

- Drivers: every `*_select/insert/update/delete` policy scopes to
  `driver_id = auth.uid()`.
- Admins: extra `*_admin_update` / `*_admin_delete` policies on `shifts`,
  `trips`, `fuel_logs`, `fee_entries`, `profiles`, `fee_categories`,
  `app_settings`.
- Superadmin: covered by the same `has_role(..., 'superadmin')` clauses.
- `audit_log`: only admins/superadmin SELECT; INSERT requires
  `actor_id = auth.uid()` AND admin role.

### Buckets

- `avatars` — public read; owner-only write (path-scoped by `auth.uid()`).

## Server-side surface

All server-side logic lives in TanStack server functions
(`createServerFn`) — **no Supabase Edge Functions**.

- `src/lib/auth.functions.ts` — `getSecurityQuestionsForEmail`,
  `resetPasswordWithAnswers`, `ensureSuperadminSeeded`, `seedSampleDrivers`.
- `src/lib/shift.functions.ts` — driver-facing shift/trip/fuel/fee CRUD
  scoped by `requireSupabaseAuth`.
- `src/lib/admin.functions.ts` — admin/superadmin CRUD, dashboard
  aggregation, export rowset. Every handler calls `assertAdmin()` and
  writes to `audit_log` on mutation.
- `src/lib/wizard.functions.ts` — first-sign-in setup.

## Routes

Driver (mobile, big tap targets):
- `/login`, `/forgot-password`, `/setup`
- `/shift`, `/shift/start`, `/shift/trip`, `/shift/end`, `/shift/summary/$id`
- `/fuel`, `/fees`, `/profile`

Admin/Superadmin (desktop layout under `_admin` pathless route, redirects
non-admins to `/shift`):
- `/dashboard` — KPI cards + bar/line charts (Recharts), 7/30/90 day windows
- `/drivers` — driver table, enable/disable, access window, password reset
- `/records` — shift records with date filter + edit modal + audit panel
- `/fees` — fee category CRUD with income/expense toggle
- `/settings` — `app_settings` key-value editor
- `/export` — date-range CSV + Excel download

## PWA

Manifest at `/public/manifest.json` (linked from `__root.tsx`). No service
worker — install works via Add-to-Home-Screen on the published site
(per Lovable PWA guidance). `display: standalone`, `theme_color: #E22A2A`.

## Secrets

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — client/server publishable.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by `client.server.ts`
  for `supabaseAdmin`.
- `SUPERADMIN_DEFAULT_PASSWORD` — used by `ensureSuperadminSeeded` and
  as fallback password for resets.
- `LOVABLE_API_KEY` — Lovable AI Gateway, unused currently.

## Remaining stubs / nice-to-have

- **Notifications**: no SMS/email to drivers when their account is disabled
  or their password is reset. Hook these into `setDriverEnabled` /
  `resetDriverPassword` server fns.
- **Pagination**: admin lists currently cap at 500 rows; add cursor
  pagination once you cross that threshold.
- **Access-window enforcement on sign-in**: `is_enabled` is enforced by
  banning the auth user, but `access_starts_at` / `access_ends_at` are
  stored and shown but not yet automatically applied. Add a scheduled job
  (TanStack server route + pg_cron) that bans/unbans users when their
  window opens/closes.
- **Role management UI**: currently roles are managed via DB. Add a
  superadmin-only screen to promote a driver to admin.
- **Charts**: weekly/monthly buckets currently approximated by day count
  windows. Add real ISO-week / month group-bys if needed.
- **Audit-log viewer**: per-shift audit is shown in the record modal;
  a global audit page (filter by actor or entity) is not built yet.
- **Service-worker PWA**: only manifest-based install is wired. Add a
  cache-first service worker if real offline support becomes a requirement
  (see Lovable PWA guidance for the iframe-safe pattern).
- **Localization**: copy is English + a few Tagalog touches. Centralize
  strings if you go bilingual.

## Known external warnings (not blocking)

The Supabase linter currently flags:
1. `avatars` bucket allows listing (intentional — public profile photos).
2. `has_role` security-definer function callable by signed-in users
   (intentional — standard role-check pattern).
3. Leaked-password protection disabled (account-level Supabase auth setting;
   enable in Cloud auth config if desired).
