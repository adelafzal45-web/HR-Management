# HRMS — Auth Screens

Frontend for the TechnoCues HRMS authentication flow: **Login, Sign Up, Forget Password,
Reset Password, and Change Password**. Built with React, TypeScript, Vite, Tailwind CSS,
and React Router, matching the provided Figma designs (brand color `#F1B344`) and ready to
plug into the NestJS backend described in `final_documentation_of_hrms.pdf`.

> **Status:** frontend-only. The backend isn't wired up yet — see
> [Backend connectivity](#backend-connectivity) for how the app handles that gracefully.

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) — dev server & build
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [React Router](https://reactrouter.com/) — routing
- [lucide-react](https://lucide.dev/) — icons
- [oxlint](https://oxc.rs/docs/guide/usage/linter.html) — linting

## Getting started

```bash
npm install
cp .env.example .env   # set VITE_API_BASE_URL to your NestJS API
npm run dev
```

Other scripts:

```bash
npm run build     # type-check and build for production
npm run preview   # preview the production build locally
npm run lint       # run oxlint
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the NestJS backend. The app polls `{VITE_API_BASE_URL}/health` to detect whether the backend is attached. | `http://localhost:3000/api` |

## Routes

| Path | Screen |
|---|---|
| `/` | Redirects to `/login` |
| `/login` | Login |
| `/signup` | Sign Up |
| `/signup-success` | Sign Up confirmation |
| `/forget-password` | Forget Password |
| `/reset-password?token=...` | Reset Password |
| `/change-password` | Change Password |
| `*` | Redirects to `/login` |

## Backend connectivity

Since the backend isn't always running, every screen needs to behave sensibly whether the
API is reachable or not — and keep re-checking, since it may come online mid-session while
backend work continues in parallel.

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

Once the NestJS backend adds a `GET /health` route (or any route returning < 500), the
banner disappears automatically and the real calls in `src/lib/api.ts` start working —
no frontend code changes needed.

### Wiring real endpoints

`src/lib/api.ts` → `authApi` currently expects:

| Function | Method | Path |
|---|---|---|
| `login` | POST | `/auth/login` |
| `signUp` | POST | `/auth/register` |
| `forgetPassword` | POST | `/auth/forget-password` |
| `resetPassword` | POST | `/auth/reset-password` |
| `changePassword` | POST | `/auth/change-password` |

Adjust the paths to match your actual NestJS controllers — loading states, error display,
and the backend-offline banner already work as-is.

Until the backend is connected, `src/lib/mockData.ts` provides placeholder data so screens
render fully in isolation.

## Fonts

The design calls for **Mont**, a commercial Fontfabric typeface — it isn't on Google Fonts
and can't be fetched automatically. `src/index.css` already declares the `@font-face` rules
(Regular/SemiBold/Heavy) pointing at `src/assets/fonts/Mont-*.woff2`. Drop your licensed
font files in there with those exact names and it just works. Until then, the app falls
back to Poppins, a close geometric-sans match, so nothing breaks in the meantime.

## Exact layout positioning

`AuthLayout.tsx` positions the logo, the faint background icon, and the robot artwork using
the exact Figma coordinates provided (measured against a 1440×1024 canvas), converted to
percentages so they hold their relative position at any screen size:

- Logo: 206.14×63.85, top 123.04 / left 63, opacity 1
- Background icon (faint): 492.46×492.37, top -195.52 / left 425.25, opacity 0.1
- Robot vector: 721.6×1024, left 720, opacity 0.9

## Project structure

```
src/
  assets/                     TechnoCues logo, icon badge, robot mascot, panel texture
  components/
    AuthLayout.tsx            shared split-screen layout (form + illustration)
    FormField.tsx             styled input + primary button
    BackendStatusBanner.tsx   online/offline/checking banner
  hooks/
    useBackendStatus.ts       polls backend health every 8s
  lib/
    api.ts                    fetch wrapper + health check + auth endpoints
    mockData.ts                placeholder data for offline/dev use
  pages/
    Login.tsx
    SignUp.tsx
    SignUpSuccess.tsx
    ForgetPassword.tsx
    ResetPassword.tsx
    ChangePassword.tsx
  App.tsx                     routes
  main.tsx                    entry point
  index.css                   Tailwind + font-face declarations
```

## Contributing

1. Create a branch off `main`.
2. Run `npm run lint` and `npm run build` before opening a PR.
3. Keep the backend-offline behavior intact when touching `src/lib/api.ts` or the auth
   screens — every request path should degrade gracefully when the API isn't reachable.

## License

Internal project for TechnoCues HRMS. Add a license here if this repo will be shared
outside the organization.
