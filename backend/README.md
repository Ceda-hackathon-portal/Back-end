# CEDA backend

Use Node 24.22.2 from .node-version and run commands from backend/. The Express server builds to dist/src/server.js. PostgreSQL 17 supplies readiness and session storage. The frontend remains a separate project.

## Local startup

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Configure your own development PostgreSQL database in .env.
npm.cmd run dev
```

The development command reads .env at startup. Production npm start uses the process environment. Export the reviewed DATABASE_URL before running npm run db:migrate; Prisma configuration reads process.env and falls back to an intentionally unreachable URL. Never run migrations on server startup. Build once with npm run build; rebuild after TypeScript edits when watching compiled output.


Local authentication is opt-in and development-only. To use it, run `npm run auth:hash-local-password` in an interactive terminal, set `AUTH_MODE=local`, `AUTH_LOCAL_EMAIL`, the generated `AUTH_LOCAL_PASSWORD_HASH`, and a random 64-hex `AUTH_ENCRYPTION_KEY` in ignored `backend/.env`. Keep `HOST=127.0.0.1`; use loopback API/frontend origins and include the frontend origin in `ALLOWED_ORIGINS`. This mode uses the existing PostgreSQL sessions, cookies and CSRF flow, makes no Cognito/AWS calls, and grants no roles. It fails startup outside `NODE_ENV=development` or with any non-loopback listener/origin. Do not deploy it.

GET /health/live reports the process state. GET /health/ready checks PostgreSQL and returns 503 while draining or when the database check fails. The default listener is 127.0.0.1:3001. For browser auth use the same hostname for frontend and API, matching the configured exact origins. Set AUTH_ENABLED=true only after supplying approved provider configuration and server secrets. Staff provisioning and backend business routes await domain integration.

## Verification

```powershell
npm.cmd run db:validate
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:smoke
npm.cmd run test:database
```

On Windows, install the locked test tools per spikes/prisma7/README.md for the disposable database suite. The harness ignores incoming database URLs, creates its own loopback cluster, replays migrations twice, runs three PostgreSQL integration tests and stops the cluster. The phase-4 verification entry point runs this same suite. GitHub Actions uses a separate ephemeral PostgreSQL 17 service on Linux and checks the compiled server on Linux and Windows. For local portable Node, prepend spikes/prisma7/node_modules/node-win-x64/bin to PATH; if the system npm launcher chooses its adjacent Node executable, invoke npm-cli.js directly with the portable node.exe.

Build a container from this directory with docker build --target runtime -t ceda-backend . and supply approved runtime environment values externally. The non-root runtime starts compiled JavaScript and never runs migrations. The separate migration image target defaults to migration status; deployment is an explicit operator command. Production requires verified database TLS. Run `node tests/container-smoke.mjs` on a disposable Linux Docker host to verify the container and staging Compose configuration without AWS calls. Hosted CI runs this check; see its actual result before deployment.

See [AWS staging preparation](docs/AWS_STAGING.md) for costs, authorization gates, restricted database roles, explicit migrations and rollback; see [implemented frontend API handoff](docs/FRONTEND_API_HANDOFF.md) for browser sessions, CSRF and applicant DTOs. No AWS infrastructure or shared database changes are authorized by this preparation.

See [OpenAPI](docs/openapi.yaml), [browser authentication](docs/AUTH_CONTRACT.md) and the [joint schema and eligibility contract proposal](docs/DOMAIN_HANDOFF.md).
