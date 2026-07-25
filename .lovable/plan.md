## Goal

Reset the superadmin account password to `Welcome01!` and make sure the browser/system password manager is offered a chance to save it the next time you sign in.

## Steps

1. **Identify the admin account.** Read `app_settings.superadmin_email` (falls back to `admin@kitametro.ph`) to get the exact email of the account to reset.

2. **Reset the password.** Run a one-off script in the sandbox using the service-role Supabase admin client:
   - Look up the auth user by that email.
   - Call `supabaseAdmin.auth.admin.updateUserById(id, { password: "Welcome01!" })`.
   - Print only success/failure — never echo the password back into logs.

3. **Password-manager autofill on the login page.** `src/routes/login.tsx` already sets `autoComplete="username"` on the email field and `autoComplete="current-password"` on the password field, which is what Chrome/Safari/1Password/etc. look for to offer "Save password?" and autofill on return. No code change needed unless you're seeing a specific case where the prompt doesn't appear — in which case tell me the browser/OS and I'll dig in.

4. **Verify.** Sign in at `/login` with `admin@kitametro.ph` (or the configured superadmin email) and `Welcome01!` to confirm the reset worked, and confirm the browser prompts to save the credentials.

## Notes / caveats

- `Welcome01!` is a weak, well-known password. Fine as a temporary reset, but I'd recommend changing it after first login. If you also want me to enable **Leaked Password Protection (HIBP)** so weak/breached passwords can't be set going forward, say the word — note that would then block re-setting to `Welcome01!` itself.
- This does not touch `SUPERADMIN_DEFAULT_PASSWORD` or the seed flow; it directly updates the existing auth user.
