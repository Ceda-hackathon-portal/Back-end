# Hosted submission repair

## Cause

The frontend submits privacy consent before sending the application. The deployed
`Ceda-hackathon-portal/back-end` API had no `/api/v1/service/privacy/consent`
route. It therefore returned 404 and stopped submission for both supplied demo
accounts and newly registered applicants. This is not an account-type restriction.
The separate `backend-api` repository already had a consent route, but deploying
that repository would omit the current hosted email-registration implementation.

## Repair

This change keeps the current registration/email implementation and restores the
existing frontend contract. No frontend configuration change is required.

- POST `/api/v1/service/privacy/consent` accepts exactly
  `{ "version": "2026-11-23", "accepted": true }` and returns 204.
- A live session and valid CSRF token are required. The account comes from the
  session, never the request body.
- The database records the notice version, server timestamp and request ID.
  Repeated consent is deduplicated; existing records cannot be modified/deleted.
- Submission requires the authenticated account's consent to the current notice.
  Application ownership, upload checks, revision checks and idempotency remain in force.
- A missing/false/outdated declaration fails; it is never silently bypassed.

## Deploy on the current server

Deploy this revision from **Ceda-hackathon-portal/back-end**, with working directory
`backend`. Preserve the existing private environment file, account file, SMTP
settings, database and private upload directory. Use Node.js 24.

From the updated checkout's `backend` directory:

```sh
npm ci
npm run build
npm run db:migrate
```

Run migrations using the existing migration-owner connection, not a restricted
runtime-only database account. Migration `202611230002_application_privacy_consent`
adds one table and grants SELECT/INSERT to `ceda_runtime` when that group exists.
It does not reset or delete applications, accounts, uploads or submissions.
Do not rerun the entire runtime-role provisioning script on an existing server.

Restart the actual API process/container using the rebuilt `dist/src/server.js`.
The process-manager/service name must be taken from the server's existing setup.

## Required live verification

Sign in with the supplied applicant credentials, reopen the saved draft, check the
declaration, and submit. Verify consent returns 204, submission returns 200, a saved
receipt appears and the same record is restored after reload. Repeat with a newly
registered applicant. Confirm each account only sees its own applications and that
retrying Submit produces one submission, not duplicates.

No hosted deployment or hosted recovery is claimed by publishing this repair.
Local tests use real disposable PostgreSQL and a captured email transport for the
verification code; they do not prove delivery through the production SMTP server.
