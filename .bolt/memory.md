# Project memory

## Product intent & audience

- Production-ready task management CRM web app: real-time sync, role-based access control, client management, team workspaces.
- Admin-facing panels: `ControlPanel`, `MasterPanel`, `MasterControlCenter` for settings, master-level operations, and employee/team management.

## Brand personality & voice

- Inferred: professional, production-grade CRM aesthetic; no explicit voice guidelines provided yet.

## Visual design & UX direction

- Stack: Vite + React + Tailwind CSS + Lucide React icons; `@/` path alias → `src/`.
- UI patterns: tabbed admin panels, toggle cards for settings, employee detail views with per-row actions, chat widget (`CrmAssistantWidget`).
- Auth UX: startup spinner must always resolve — try/catch/finally + 8-second timeout, then show login or dashboard (never infinite spinner).

## Decisions, constraints & rationale

- Maintenance Mode, Closure Mode, CRM Down, and Kapil Master Access features fully removed (build-breaking orphaned imports and dead code).
- Deleted files: `useMaintenanceMode.ts`, `useClosureMode.ts`, `MaintenanceScreen.tsx`, `ClosureModeScreen.tsx`, `UserDownScreen.tsx`.
- `useAccessControl.ts` retains only `useTaskManagerAccess`; `useUserCrmDown`, `useKapilMasterAccess`, `useAllUserAccessSettings` removed.
- `App.tsx`: `Protected` wrapper no longer carries maintenance/closure guards; `/reset-password` renders directly.
- DB: `settings` table rows `maintenance_mode` and `closure_mode` set to `false` via SQL; no schema/RLS/function changes.
- `AbsentLockScreen.tsx`: absent-reason flow retained but no longer reads `maintenance_mode` setting.
- Build must pass with zero errors before publish.

## Open questions & assumptions

- `settings` table is a key-value store with text keys and boolean-ish values (assumed from usage).
- `user_access_settings` table still exists in Supabase but per-user CRM-down toggles are no longer surfaced in UI.