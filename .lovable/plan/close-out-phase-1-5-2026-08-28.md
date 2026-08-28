# Close out Phase 1.5

The security check passed. Two small items remain before Phase 2 work begins.

## 1. Make the lint gate meaningful

The only lint failures are formatting complaints inside auto-generated backend
files (`src/integrations/supabase/types.ts`, `previewAuthStorage.ts`). These are
regenerated automatically and must not be hand-edited, so they will keep failing
forever and hide real problems in our own code.

- Add both generated files to the lint ignore list.
- Confirm the lint run then reports zero errors across authored code.

## 2. Prove the hardening against real data

Everything is verified at the policy and code level, but the system has only one
account and the audit log is still empty, so nothing has been exercised at
runtime. Using a second, non-privileged test account:

- Deactivate it and confirm it is locked out of pages, data and mutations.
- Grant and remove a role and confirm both appear in the audit log with
  before/after values.
- Confirm the last remaining administrator cannot be demoted or deactivated.
- Confirm the test account cannot read the audit log or other users' profiles.

No schema changes and no new migrations are required for either item.

## Technical notes

- Lint ignores go in `eslint.config.js` (the generated Supabase integration
  files only).
- Runtime verification is done through the preview using a second auth user; the
  existing `setUserActive` / `grantRole` / `revokeRole` server functions and the
  Users screen are the surfaces under test.
- Expected audit actions: `user.activated`, `user.deactivated`, `role.assigned`,
  `role.removed`, `profile.created`, `profile.updated`.
