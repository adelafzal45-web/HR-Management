# HRMS — Frontend

React + TypeScript + Vite frontend for the HRMS platform, covering Employees,
Attendance, Leave, Payroll, Appraisal/Performance Management, Team, Settings,
and Admin Ops — with role-based access control (RBAC) wired throughout the
routes and UI.

## Stack

- React 19, React Router 7, TypeScript, Vite
- Tailwind CSS
- Feature-based module structure under `src/modules/*`

## Getting started

```bash
npm install
npm run dev       # start dev server
npm run build     # type-check (tsc -b) + production build
npm run lint       # oxlint
npm run preview    # preview the production build
```

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to point at the
backend API (default `http://localhost:3000/api`).

## Auth & RBAC (dev mode)

There's no JWT auth wired up yet, so sign-in currently goes through
`/dev-login`, where you pick a backend Role/employee record to impersonate.
That selection is stored under the `hrms.devSession` key and its user ID is
sent as an `x-user-id` header on every API request — this is what the
backend's permission guard reads server-side. Route- and component-level
permission checks live in:

- `src/lib/rbac.ts` — permission helpers
- `src/app/providers/DevAuthContext.tsx` — current dev session/role state
- `src/components/permission/Can.tsx`, `src/components/permission/PermissionRoute.tsx`

## Project structure

```
src/
  app/            # providers, router, layouts, config
  api/            # low-level API client + shared HR API calls
  lib/            # apiClient + rbac helpers
  components/     # shared UI (tables, dialogs, forms, permission gates)
  modules/        # one folder per feature area (employees, attendance,
                  # leave, payroll, performance, team, settings, ...),
                  # each with its own pages/, api/, and mocks/ (demo-data
                  # fallback used when the backend route isn't reachable)
```

## Notes

- API calls fall back to demo/mock data per-module when the backend is
  unreachable, so the UI stays usable during backend development.
- Run `npm run build` before shipping — it type-checks the whole project.
