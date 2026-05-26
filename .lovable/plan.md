# Trusted Riders — Phase 1 Build Plan

A mobile-first PWA for Filipino motorcycle drivers to log shifts and see real earnings after fuel. This phase delivers the foundation: backend, auth, schema, and the first-time setup wizard. Trip logging, fuel logs, and earnings reports come in later phases.

---

## 1. Foundation

- **Enable Lovable Cloud** (Postgres + Auth + Storage + Server Functions).
- **Brand theme** in `src/styles.css` using the supplied palette as semantic tokens (oklch):
  - primary red `#E22A2A`, accent amber `#F5961E`, secondary teal `#1C8A9E`, charcoal `#1E1F22`, silver `#C7CCD1`, off-white surface `#F7F8FA`.
  - Rounded corners (lg = 14px), generous spacing, large tap targets (min 48px), large body text (16–18px base), high contrast.
  - Light mode default; optional dark mode toggle wired but not pushed.
- **Mobile-first layout shell** with a Facebook-style bottom nav (4 tabs: Home / Shifts / Earnings / Account). Tabs are stubbed in Phase 1 — only Home + Account are functional.
- **Installable web app**: ship a `manifest.json` with app name, icons, theme color, `display: "standalone"`, and a maskable icon. **No service worker** in Phase 1 — see "PWA note" below.

### PWA note (important)
You asked for an installable PWA. A *manifest-only* install (Add to Home Screen, standalone display, splash screen, icon) works reliably and is what most "installable" apps actually need. A *full* PWA with offline support requires a service worker, which is known to cause stale-cache and preview issues inside Lovable's editor and can lock users to old builds. **Recommendation:** ship manifest-only now (fully installable on iOS/Android), and add offline support as a deliberate later phase once the app is stable. I'll proceed manifest-only unless you tell me otherwise.

---

## 2. Database Schema (Supabase / Postgres)

All tables under `public`, all with RLS enabled, all GRANTed to `authenticated` + `service_role`.

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | One row per user, linked to `auth.users` | `id` (FK→auth.users), `full_name`, `phone`, `motorcycle_brand`, `motorcycle_model`, `fuel_tank_liters`, `first_sign_in_completed`, `created_at` |
| `app_role` (enum) | `driver`, `admin`, `superadmin` | — |
| `user_roles` | Roles kept in a separate table (security best-practice — never on profiles) | `user_id`, `role`, unique(user_id, role) |
| `security_questions` | Catalog of pickable questions (seeded ~8 options in Filipino-friendly English) | `id`, `question_text`, `is_active` |
| `user_security_answers` | A user's chosen Q+A pairs; **answers stored hashed (bcrypt via pgcrypto)**, never plain text | `user_id`, `question_id`, `answer_hash`, `created_at` |
| `shifts` | A driver's work session | `id`, `driver_id`, `started_at`, `ended_at`, `starting_odometer_km`, `ending_odometer_km`, `notes` |
| `trips` | Individual jobs within a shift | `id`, `shift_id`, `driver_id`, `service_type` (angkas/pabakal/padala), `gross_fare_php`, `distance_km`, `started_at`, `ended_at`, `notes` |
| `fuel_logs` | Refuels | `id`, `driver_id`, `shift_id` (nullable), `liters`, `price_per_liter_php`, `total_cost_php`, `odometer_km`, `logged_at` |
| `fee_categories` | Types of expenses (toll, parking, commission, etc.) — seeded | `id`, `name`, `is_active` |
| `fee_entries` | Individual expense entries | `id`, `driver_id`, `shift_id` (nullable), `category_id`, `amount_php`, `note`, `logged_at` |
| `app_settings` | Key/value config (default password, fuel-economy defaults, etc.) — admin-managed | `key`, `value` (jsonb), `updated_at` |

**Security-definer helper** `has_role(user_id, role)` to avoid recursive RLS, used in every policy.

**RLS summary:**
- `profiles`, `shifts`, `trips`, `fuel_logs`, `fee_entries`, `user_security_answers`: driver can SELECT/INSERT/UPDATE/DELETE only `WHERE driver_id = auth.uid()` (or `user_id`); admin + superadmin can read all; superadmin can write all.
- `security_questions`, `fee_categories`: any authenticated user can SELECT; only admin/superadmin can write.
- `app_settings`: only superadmin reads/writes; the default-password value is read server-side via a server function, never exposed to clients.
- `user_roles`: user can read their own roles; only superadmin can write.

**Trigger:** on `auth.users` insert → auto-create matching `profiles` row + default `driver` role.

---

## 3. Authentication & First-Sign-In Flow

- **Sign-in page** (`/login`): single username/email field + password field, one big primary button. Friendly copy ("Welcome back, kabayan!"). No social logins this phase.
- **Default password** "Welcome312" stored in `app_settings` (`default_driver_password`) — readable only by server functions, never bundled into client JS. New drivers seeded by admin start with this; on first sign-in the wizard forces a change.
- **First-sign-in wizard** (`/setup`) — gated by `profiles.first_sign_in_completed = false`. One step per screen, each with one big primary button:
  1. **Change password** — new password + confirm, with simple strength hint.
  2. **Pick 3 security questions** — tappable list, then one screen per chosen question to type the answer. Answers hashed server-side (`crypt()` + `gen_salt('bf')` via pgcrypto) before insert.
  3. **Bike details** — Fuel tank size (numeric keypad, liters) and Motorcycle brand + model (two short text fields).
  - Final screen: "You're all set!" → marks `first_sign_in_completed = true`, routes to Home.
- **Self-service password reset** (`/forgot-password`):
  1. Enter username/email.
  2. Server returns the user's chosen security questions (no PII leaked if user not found — generic message).
  3. User answers each on its own screen; server verifies hashes.
  4. On success, server function resets the user's password back to the default (`Welcome312`) and clears `first_sign_in_completed` so they're forced through the wizard again.

All sensitive operations (default-password read, password reset, hashed-answer verification) go through `createServerFn` with the admin Supabase client — the service-role key never reaches the browser.

---

## 4. Seed Data

- **Superadmin account** "Admin" — email `admin@trustedriders.ph`, password pulled from a configurable secret (`SUPERADMIN_DEFAULT_PASSWORD`), seeded via a one-shot server function on first boot if missing. Username, email, and password are all configurable, not hard-coded in client code.
- **2 sample drivers** with the default password, pre-filled wizard data on one of them so you can see a "completed" profile.
- **8 security questions**, **6 fee categories** (Toll, Parking, Commission, Food, Phone load, Other).
- **Sample shifts / trips / fuel logs** for the completed driver, so Phase 2's earnings screen has data to display.

---

## 5. What's NOT in this phase

To keep Phase 1 shippable and the spec honest:
- Trip logging UI, fuel logging UI, earnings/reports screens — schema is ready, UI lands in Phase 2.
- Offline support (service worker) — see PWA note.
- Admin dashboard UI — superadmin can sign in but the admin tools come later.
- Dark mode toggle UI (tokens defined, switch ships in a later phase).

---

## Technical details (for the record)

- React + TanStack Start, TanStack Router file-based routes, TanStack Query for reads.
- Supabase clients: browser `client.ts` for auth/session, `auth-middleware` for user-scoped server fns, `client.server` for admin-only operations (password reset, default-password read, superadmin seed).
- `createServerFn` for all sensitive flows; no Supabase Edge Functions.
- `pgcrypto` extension enabled for bcrypt hashing of security answers.
- One migration creates extensions, enum, all tables, GRANTs, RLS, policies, trigger, and seed data.
- TypeScript strict; Zod validation on every server-fn input; all colors via semantic tokens.

---

**Two quick confirmations before I build:**
1. **PWA scope** — OK to ship manifest-only (installable, no offline) now and add a service worker later? (Strongly recommended.)
2. **Superadmin email** — OK to use `admin@trustedriders.ph` as the seeded address, with the password held in a `SUPERADMIN_DEFAULT_PASSWORD` secret you'll set after Cloud is enabled?

Approve the plan and I'll start with Cloud + schema + theme in parallel.