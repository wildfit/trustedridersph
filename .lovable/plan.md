# Phase 3 — Admin & Superadmin UI

A responsive desktop-first admin area gated to `admin` and `superadmin` roles, plus PWA install support, RLS verification, and a handoff summary.

## 1. Routing & layout

New pathless layout `src/routes/_admin.tsx`:
- `beforeLoad` calls `requireAdminAccess` server fn → redirects non-admins to `/shift`.
- Renders a responsive shell: top header (logo, user menu, sign out) + left sidebar nav (Dashboard, Drivers, Records, Fee Categories, Settings, Export). Sidebar collapses to a drawer below `md`.
- Hides the driver `BottomNav` (already conditional on auth route; will scope it to non-admin routes).

Routes:
- `/_admin/dashboard` — KPI cards + bar + line charts (Recharts).
- `/_admin/drivers` — driver table + per-row actions (enable/disable, access mode, reset password).
- `/_admin/records` — shift records table with filters; row → edit modal.
- `/_admin/fees` — fee category CRUD table with income/expense toggle.
- `/_admin/settings` — `app_settings` key/value editor (gas default rate, default password, etc.).
- `/_admin/export` — date range + CSV/XLSX download buttons.

Index route: if user is admin/superadmin, redirect `/` to `/dashboard`.

## 2. Database migration

```sql
-- Driver account access window + enabled flag
ALTER TABLE public.profiles
  ADD COLUMN is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN access_mode text NOT NULL DEFAULT 'indefinite'
    CHECK (access_mode IN ('indefinite','duration')),
  ADD COLUMN access_starts_at timestamptz,
  ADD COLUMN access_ends_at timestamptz;

-- Audit trail for admin edits
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  entity_type text NOT NULL,   -- 'shift' | 'trip' | 'fuel_log' | 'fee_entry' | 'profile' | 'fee_category'
  entity_id uuid NOT NULL,
  action text NOT NULL,        -- 'update' | 'delete' | 'enable' | 'disable' | 'reset_password'
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Allow admins/superadmin to manage fee_categories
CREATE POLICY fee_cat_admin_write ON public.fee_categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'superadmin'));

-- Admins can update/delete shifts, trips, fuel_logs, fee_entries
-- (existing policies already cover superadmin; add admin)
CREATE POLICY shifts_admin_update ON public.shifts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE POLICY trips_admin_update ON public.trips FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE POLICY fuel_admin_update ON public.fuel_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE POLICY fee_entries_admin_update ON public.fee_entries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'));
```

Plus a `is_admin_or_super(uid)` helper if useful.

## 3. Server functions (`src/lib/admin.functions.ts`)

All gated by `requireSupabaseAuth` + an internal `assertAdmin(context)` helper that throws unless `has_role admin|superadmin`. Audit log written via `supabaseAdmin` after each mutation.

- `listDrivers`, `setDriverEnabled`, `setDriverAccessWindow`, `resetDriverPassword` (uses `supabaseAdmin.auth.admin.updateUserById` with `SUPERADMIN_DEFAULT_PASSWORD` env).
- `listFeeCategories`, `createFeeCategory`, `updateFeeCategory`, `deleteFeeCategory`.
- `listAppSettings`, `upsertAppSetting`.
- `listShiftRecords({from,to,driverId})`, `getShiftDetail(shiftId)`, `updateShift`, `updateTrip`, `updateFuelLog`, `updateFeeEntry`, `deleteRecord`.
- `getDashboardSummary({granularity})` returns daily/weekly/monthly aggregates.
- `exportRecords({from,to,format})` returns rows; CSV/XLSX built client-side via `papaparse` + `xlsx` (bun add).

## 4. UI components

- `src/components/admin/AdminShell.tsx` — sidebar + header.
- `src/components/admin/DataTable.tsx` — light wrapper around shadcn Table with sort/pagination.
- Per-page CRUD modals using shadcn `Dialog` + `react-hook-form` + `zod`.
- Charts via `recharts` (already in shadcn template set; install if missing).
- Audit panel on shift detail modal listing recent edits.

## 5. PWA

- Add `public/manifest.webmanifest` with name, short_name, icons (use existing brand logo), `display: standalone`, `start_url: /`, theme colors from palette.
- Add `<link rel="manifest">` and theme-color meta in `__root.tsx` head().
- No service worker (per guidance — manifest-only install support, works in published site).

## 6. RLS verification

After migration, run `supabase--linter` and a manual review:
- Drivers: every `*_select/insert/update/delete` policy scoped to `driver_id = auth.uid()` ✓ (already in schema).
- Admins: new admin-update policies added.
- Superadmin: existing policies cover all tables.
- `audit_log`: admins read-only; inserts must be `actor_id = auth.uid()`.

## 7. Handoff summary
Output a `HANDOFF.md` at repo root listing: schema tables, roles, key server fns, remaining stubs (e.g. SMS/email notifications, deeper analytics, mobile-app packaging), and any TODOs.

## Files to create
- `supabase/migrations/<ts>_admin_phase3.sql`
- `src/lib/admin.functions.ts`, `src/lib/admin-guard.ts`, `src/lib/export.ts`
- `src/routes/_admin.tsx`, `_admin.dashboard.tsx`, `_admin.drivers.tsx`, `_admin.records.tsx`, `_admin.fees.tsx`, `_admin.settings.tsx`, `_admin.export.tsx`
- `src/components/admin/AdminShell.tsx`, `DataTable.tsx`, modal components per page
- `public/manifest.webmanifest`, icons
- `HANDOFF.md`

## Files to edit
- `src/routes/__root.tsx` — manifest + theme-color
- `src/routes/index.tsx` — redirect admins to `/dashboard`
- `src/components/BottomNav.tsx` — hide on admin routes

## Packages to add
`recharts`, `papaparse`, `@types/papaparse`, `xlsx`, `react-hook-form`, `@hookform/resolvers`, `date-fns` (if not already).

Approve to proceed and I'll build it in one pass.
