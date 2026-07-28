# Frontend Architecture — Refactor Notes

This codebase was restructured into a feature-based, modular architecture.
**All existing functionality was preserved** — this was a structural refactor,
not a rewrite. Verified with `tsc -b`, `oxlint`, and `vite build` before and
after (see "Verification" below).

## New structure

```
src/
 ├── app/
 │   ├── router/AppRouter.tsx       # all routes, lazy-loaded, extracted from App.tsx
 │   ├── providers/AppProviders.tsx # composes Auth/Branding/Notifications/Toast
 │   ├── providers/{Auth,Branding,Notifications,Toast}Context.tsx
 │   ├── layouts/{AuthLayout,DashboardLayout}.tsx
 │   └── config/endpoints.ts
 │
 ├── modules/                        # one folder per feature/domain
 │   ├── auth/            (login, signup, password flows, edit-profile)
 │   ├── dashboard/
 │   ├── employees/
 │   ├── professionals/
 │   ├── attendance/
 │   ├── leave/
 │   ├── payroll/
 │   ├── appraisal/
 │   ├── team/             (Team Lead workspace)
 │   ├── notifications/
 │   ├── settings/         (company, departments, designations, roles, permissions, branding…)
 │   └── shared/           (ComingSoon and other cross-feature pages)
 │   Each module has its own pages/, components/, api/, mocks/, utils/ as needed.
 │
 ├── components/
 │   ├── common/    (BackButton, EmptyState, LoadingOverlay, StatusBadge,
 │   │               BackendStatusBanner, ProtectedRoute, ErrorBoundary — new)
 │   ├── dialogs/   (Modal, ConfirmDialog)
 │   ├── forms/     (FormField)
 │   └── tables/    (DataTable)
 │
 ├── api/         client.ts (fetch wrapper), hrApi.ts — used across many modules
 ├── mocks/       hrMockData.ts — paired with the shared hrApi
 ├── hooks/       useBackendStatus.ts
 ├── utils/       csv.ts, exportUtils.ts, formatDate.ts, auth.ts — used across 2+ modules
 ├── constants/   roles.ts — ROLES enum, replaces hardcoded role strings
 ├── styles/      index.css
 └── assets/
```

Barrel `index.ts` files were generated for every module/component subfolder
(e.g. `modules/employees/pages/index.ts`) so consumers can do
`import { Employees } from "@/modules/employees/pages"`. Existing internal
imports were left pointing at concrete files rather than force-migrated to
barrels, to keep the diff mechanical and low-risk — new code is free to use
either.

## What changed under the hood

- **Deleted an entire dead `src/lib/` folder** (23 files) left over from a
  prior partial migration to `api/`/`utils/`/`context/`/`mocks/`. Two files in
  there (`professionalApi.ts`, `professionalMockData.ts`) were still the *only*
  copy of that logic and were relocated into `modules/professionals/`, not
  deleted.
- Rewrote **every import in every file** to absolute `@/...` alias paths
  (no more `../../../` chains).
- Split `App.tsx` into `AppProviders.tsx` (context composition) and
  `AppRouter.tsx` (routes), with every page now behind `React.lazy` +
  `Suspense`, each wrapped in a new `ErrorBoundary`.
- Replaced hardcoded `"hr_manager"` / `"team_lead"` / `"administrator"`
  role-string literals in the router with `ROLES` / `HR_ADMIN_ROLES` /
  `TEAM_LEAD_ROLES` from `constants/roles.ts`.
- Added a `.prettierrc.json` (the project already used `oxlint` for linting;
  this adds consistent formatting on top rather than replacing it).

## Verification performed

- `npx tsc -b`: identical error count before and after (2 pre-existing type
  errors in `EvaluateProfessional.tsx`, unrelated to this refactor — see below).
- `npx oxlint`: identical warning/error count before and after (109 errors,
  ~24.1k warnings — this is the project's existing strict ruleset flagging
  pre-existing patterns, not anything introduced here).
- `npx vite build`: succeeds, and now emits a separate chunk per lazy-loaded
  page (confirms code-splitting is actually working).

## Known pre-existing issues (not touched, flagging for visibility)

1. **`EvaluateProfessional.tsx`** references a `professionalId` field that
   doesn't exist on the `TeamMember`/evaluation payload types. This predates
   the refactor (confirmed against the original zip) and still fails
   `tsc -b`. Left as-is since fixing it means guessing at intended behavior.
2. **The "Professionals" feature has no routes.** `modules/professionals/`
   contains a full page set (list, add, edit, view) but nothing in
   `AppRouter.tsx` links to them — this was already true before the refactor.
   If this module should be reachable, routes need to be added deliberately
   (with the right role guard), which felt out of scope for a structural
   refactor to decide unilaterally.

## Suggested next phase (not done here, to keep this pass low-risk)

- A real shared UI kit (Button/Input/Select/Card/Badge/Pagination) — none
  currently exists; components inline their own styling. Introducing one
  touches nearly every page, so it's better done as its own reviewed pass.
- Extracting inline types scattered across components into `types/` — skipped
  here to avoid touching all 126 files a second time.
