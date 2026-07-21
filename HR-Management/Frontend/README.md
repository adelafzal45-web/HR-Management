# HRMS — Auth Screens (Login, Sign Up, Forget Password, Reset Password, Change Password)

Frontend-only build of the TechnoCues HRMS auth flow, matching the provided designs
in structure and colors (brand color `#F1B344`). Built with React + TypeScript + Vite +
Tailwind CSS + React Router, ready to plug into the NestJS backend described in
`final_documentation_of_hrms.pdf`.

## Fonts

The design calls for **Mont**, a commercial Fontfabric typeface — it isn't on Google Fonts and
can't be fetched automatically. `src/index.css` already declares the `@font-face` rules
(Regular/SemiBold/Heavy) pointing at `src/assets/fonts/Mont-*.woff2`. Drop your licensed font
files in there with those exact names and it just works. Until then, the app falls back to
Poppins, a close geometric-sans match, so nothing breaks in the meantime.

## Exact layout positioning

`AuthLayout.tsx` positions the logo, the faint background icon, and the robot artwork using
the exact Figma coordinates you provided (measured against a 1440×1024 canvas), converted to
percentages so they hold their relative position at any screen size:

- Logo: 206.14×63.85, top 123.04 / left 63, opacity 1
- Background icon (faint): 492.46×492.37, top -195.52 / left 425.25, opacity 0.1
- Robot vector: 721.6×1024, left 720, opacity 0.9

## Run it

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL to your NestJS API
npm run dev
```

Routes:
- `/login`
- `/signup`
- `/forget-password`
- `/reset-password?token=...`
- `/change-password`

## How the "backend attached / not attached" check works

Since the backend isn't wired up yet, every screen needs to behave sensibly whether the API
is running or not — and keep re-checking, since it may come online mid-session (parallel
backend work).

- **`src/lib/api.ts`** — `checkBackendConnection()` pings `GET {VITE_API_BASE_URL}/health`
  with a 4s timeout. `apiRequest()` calls this before every real request and throws
  `BackendUnavailableError` if the API can't be reached, so every screen handles the
  "no backend" case the same way instead of throwing a raw network error.
- **`src/hooks/useBackendStatus.ts`** — polls that check every 8 seconds and exposes
  `"checking" | "online" | "offline"`.
- **`src/components/BackendStatusBanner.tsx`** — shown on every auth screen. While
  `"checking"` it shows a neutral spinner; while `"offline"` it shows an amber notice, and the
  submit button still works but returns a clear "Backend is not connected" message instead of
  a broken network error.

Once your NestJS backend adds a simple `GET /health` route (or any route returning < 500),
the banner disappears automatically and the real login/signup/reset calls in `src/lib/api.ts`
start working — no frontend code changes needed, so backend and frontend can keep
progressing in parallel.

### Wiring real endpoints

`src/lib/api.ts` → `authApi` currently expects:

| Function | Method | Path |
|---|---|---|
| `login` | POST | `/auth/login` |
| `signUp` | POST | `/auth/register` |
| `forgetPassword` | POST | `/auth/forget-password` |
| `resetPassword` | POST | `/auth/reset-password` |
| change password | POST | `/auth/change-password` |

Adjust the paths to match your actual NestJS controllers — everything else (loading states,
error display, the backend-offline banner) already works.

## Structure

```
src/
  assets/            TechnoCues logo, icon badge, robot mascot (from your uploads)
  components/
    AuthLayout.tsx           shared split-screen layout (form + illustration)
    FormField.tsx            styled input + primary button
    BackendStatusBanner.tsx  online/offline/checking banner
  hooks/
    useBackendStatus.ts      polls backend health every 8s
  lib/
    api.ts                   fetch wrapper + health check + auth endpoints
  pages/
    Login.tsx
    SignUp.tsx
    ForgetPassword.tsx
    ResetPassword.tsx
    ChangePassword.tsx
```
