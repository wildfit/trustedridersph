## Phase 2 Plan — Driver UI

Builds the working driver app on top of Phase 1 (auth, profile, roles, brand). UX rule stays: one big primary action per screen, big tap targets, large text, plain language, numeric keypads, confirmations on destructive actions.

### Navigation change

Replace the current 4-tab bottom nav (Home / Shifts / Earnings / Account) with the spec'd 4 tabs:

- **Profile** (`/profile`)
- **Shift** (`/shift`)
- **Fuel** (`/fuel`)
- **Fees** (`/fees`)

Delete `/`, `/shifts`, `/earnings`, `/account`. Index route redirects to `/shift` (the daily-use screen) when signed in, otherwise `/login`. Keep `/login`, `/forgot-password`, `/setup`.

### 1. Profile tab (`/profile`)

Read-only display of: Full name, Email, Phone, Motorcycle brand + model, Fuel tank size.
Only editable item: **profile photo**, uploaded to Supabase Storage bucket `avatars` (public read, owner write).
Adds `avatar_url` column to `profiles`. Tap photo → file picker → uploads to `avatars/{user_id}.jpg`, updates profile.
Sign-out button at the bottom. Theme switcher moves here.

### 2. Shift tab (`/shift`) — the core flow

**State A — no active shift:** big floating "Start Shift" button (full-width primary).
**Start Shift screen** (`/shift/start`): single numeric input for starting odometer (km), large numeric keypad-friendly input, big "Start" button. Creates a `shifts` row with `started_at = now()` and `starting_odometer_km`.

**State B — active shift in progress:** card showing started time + starting odo, two big buttons: **Add Trip** and **End Shift**, plus a compact running summary (trips count, distance so far, gross so far).

**Add Trip** (`/shift/trip`): one short form
- Distance (km) — numeric
- Base fare (₱) — numeric
- Service type — three big tappable tiles: Angkas, Pabakal, Padala
- Big "Save trip" button → inserts `trips` row tied to active shift.

**End Shift** (`/shift/end`): numeric input for ending odometer. Validate `ending >= starting`; if not, friendly inline error ("Ending reading must be at least your starting reading of X km"). Sets `ended_at` + `ending_odometer_km`. Then routes to **shift summary** showing:
- Total distance (ending − starting km), with sub-line: "Sum of trip distances: Y km" and a warning chip if they differ by >10%
- Number of trips
- Gross earnings (₱)
- Fuel cost (₱)
- Net earnings (₱) — large, prominent
- Fuel efficiency (km/L)
Encouraging headline like "Magaling, {name}! 💪". Big "Done" button → back to `/shift`.

**Persistence / single-active rule:** active shift = a `shifts` row for the current user with `ended_at IS NULL`. Loaded on tab mount so refresh/close resumes correctly. DB safeguard: partial unique index on `(driver_id) where ended_at is null`.

### 3. Fuel tab (`/fuel`)

Three sections, scoped to the active shift (or "no active shift" empty state with a button to start one):

- **Gas rate** (₱/L) — single field, saved as `app_settings` per-user or on the shift; we'll store it on the shift row as `gas_rate_php_per_liter` (new column) so each shift has its own rate.
- **Starting fuel cost** — single ₱ field at start of shift, stored as the first `fuel_logs` row marked as the start fill.
- **Mid-shift refuels** — list of refuels with "Add refuel" button. Each refuel: ₱ amount (required) + liters (optional). If liters blank, computed = amount / gas_rate at display time.

Shows running totals: total fuel ₱, total liters, current km/L (uses live odo from trips/distance so far).

### 4. Fees tab (`/fees`)

Clear banner: **"Extra money you collected on top of the base fare — this is income, not expense."**
Three sections:

- Fee category picker — large tiles pulled from `fee_categories` where `is_active = true` (Tip, Tariff, Toll, Other, plus whatever admin added).
- "Add fee" form: pick category tile → ₱ amount → optional note → save.
- List of fees logged this shift, with delete (with confirm).

Fee categories are also categorized as income vs expense; we add an `entry_type` column (`'income' | 'expense'`, default `'income'`) to `fee_categories` so the math can split them. Seed defaults: Tip/Tariff/Toll/Other all income.

### 5. Calculations (shared util `src/lib/shift-math.ts`)

```text
shiftDistanceKm    = ending_odo − starting_odo            // primary
tripDistanceSumKm  = sum(trips.distance_km)
mismatch           = |shiftDistanceKm − tripDistanceSumKm| > 10% of shiftDistanceKm

litersConsumed     = sum(fuel_logs.liters) if all rows have liters,
                     else sum(fuel_logs.total_cost) / gas_rate
fuelEfficiency     = shiftDistanceKm / litersConsumed     // km/L

grossEarnings      = sum(trips.gross_fare) + sum(fee_entries where category.entry_type='income')
totalExpenses      = sum(fuel_logs.total_cost) + sum(fee_entries where category.entry_type='expense')   // default 0
netEarnings        = grossEarnings − totalExpenses
```

Money formatted via `Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' })` everywhere.

### 6. Database migrations (one migration)

- `ALTER TABLE profiles ADD COLUMN avatar_url text`
- `ALTER TABLE shifts ADD COLUMN gas_rate_php_per_liter numeric`
- `ALTER TABLE fee_categories ADD COLUMN entry_type text NOT NULL DEFAULT 'income' CHECK (entry_type IN ('income','expense'))`
- Seed: insert Tip, Tariff, Toll, Other into `fee_categories` if missing.
- Partial unique index: `CREATE UNIQUE INDEX shifts_one_active_per_driver ON shifts(driver_id) WHERE ended_at IS NULL`
- Create storage bucket `avatars` (public) + RLS policies: anyone can read, owner can insert/update/delete their own `{user_id}.*` path.

### 7. Server functions (`src/lib/shift.functions.ts`, all `requireSupabaseAuth`)

- `getActiveShift()` — returns active shift + trips + fuel_logs + fee_entries (and category metadata) for live screens.
- `startShift({ starting_odometer_km, gas_rate, starting_fuel_cost })` — creates shift + first fuel log atomically.
- `addTrip({ shift_id, service_type, distance_km, gross_fare_php })`
- `addFuelLog({ shift_id, total_cost_php, liters? })`
- `addFeeEntry({ shift_id, category_id, amount_php, note? })`
- `deleteFeeEntry({ id })`
- `endShift({ shift_id, ending_odometer_km })` — validates, sets ended_at, returns full summary DTO.
- `uploadAvatar` handled client-side directly via the browser supabase client + Storage (RLS-scoped).
- `listFeeCategories()` — public list of active categories.

### 8. File changes summary

New: `src/routes/profile.tsx`, `src/routes/shift.tsx`, `src/routes/shift.start.tsx`, `src/routes/shift.trip.tsx`, `src/routes/shift.end.tsx`, `src/routes/shift.summary.tsx`, `src/routes/fuel.tsx`, `src/routes/fees.tsx`, `src/lib/shift.functions.ts`, `src/lib/shift-math.ts`, `src/components/MoneyInput.tsx`, `src/components/Money.tsx`.
Edit: `src/components/BottomNav.tsx` (new 4 tabs + icons), `src/routes/index.tsx` (auth-aware redirect).
Delete: `src/routes/shifts.tsx`, `src/routes/earnings.tsx`, `src/routes/account.tsx`.
Migration: one SQL migration covering everything in §6.

### Open questions
None blocking — proceeding with the choices above when you approve.
