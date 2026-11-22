# CEDA Innovation Platform — shared Codex instructions

**Read before any task:** `README.md`, `docs/BACKEND_ARCHITECTURE_HANDOFF.md`, `docs/FRONTEND_ROADMAP.md`, `docs/codex/PROJECT_CONTEXT.md`, `docs/codex/TECH_STACK.md`, `docs/codex/TEAM_CONTRACT.md`, `docs/codex/REPO_AUDIT.md`, and the assigned developer prompt. Read `API_CONTRACT_V0.md` and `SCHEMA_HANDOFF.md` for contracts.

## Confirmed repo baseline
- Uploaded snapshot dated 17 Nov 2026 is **frontend-only**: React 19, Vite 8, React Router 7, JSX, Tailwind CSS 4. No backend, Prisma database or real authentication exists in this snapshot.
- `src/context/AuthContext.jsx`: role-selectable in-memory demo identity. `ProtectedRoute.jsx`: UI-only gate, never authorization.
- `src/context/PortalContext.jsx`: browser localStorage `ceda.prototype.v1` with draft/ideas. `src/data/portal.js`: fixtures, not policy.
- `docs/BACKEND_ARCHITECTURE_HANDOFF.md` is a proposed design whose previous approval was pending. This setup asks agents to audit and obtain authorization before building.

## Development objective
Ship a safe six-day prototype demonstrating: public programme -> authenticated applicant -> saved draft -> validated immutable submission -> eligibility and officer review -> assigned/conflict-cleared independent evaluations -> authorized adjudication -> released feedback/status -> aggregate reporting/audit. CEDA official requirements also include FAQ, notifications, and a minimal live-chat demonstration as time permits. Use fictional data. Distinguish prototype features from future production commitments.

## Technology policy
Backend **target**, not yet installed: Node.js 24, Express, strict TypeScript, PostgreSQL 17, Prisma (target 7, verify compatibility), Zod, REST `/api/v1`, OpenAPI, tests with real PostgreSQL, GitHub Actions, Docker-compatible deployment. Structure: modular monolith under `backend/` with independent package/tsconfig and clear modules. Preserve existing Vite frontend and its root package files. No mandatory NestJS/Keycloak/RabbitMQ/K3s/Jenkins migration for the hackathon; those belong to the longer-term proposal.

## Absolute ownership boundaries
- Backend implementation only in `backend/`; do not edit `src/`, `public/`, root `package.json`/lockfile, `vite.config.js`, `vercel.json`, or frontend UI files without an independently approved integration task.
- Developer A owns platform foundation, auth, users/grants, programmes, applications/drafts, attachments/storage adapter, audit/outbox foundation, Prisma schema/migrations, backend package/scripts, deployment, CI, and published OpenAPI contract.
- Developer B owns eligibility, workflow/stage transitions, assignments/conflicts, evaluations/score locking, decisions, feedback/revision handling, notifications, reporting, and optional FAQ/chat, with tests for each. Do not edit A-owned shared code/schema directly; request small interface changes.
- Both may add tests within owned modules. A is **single migration integrator**, not a blocker to B's designs; review proposed fields from B promptly.
- No direct writes to live GitHub, merges, pushes, force pushes, branch switches, history rewriting, deployments or secret management without explicit approval.
- Never share personal Codex credentials; use separate user accounts and independent checkouts or worktrees.

## Contracts and correctness
- Freeze shared API and database contracts through review. Proposed `/api/v1` schemas live in `docs/codex/API_CONTRACT_V0.md`; finalize before frontend integration. Add changes additively or with coordinated versioning.
- Existing frontend IDs: `submitter`, `evaluator`, `adjudicator`, `administrator`, `management`, `system-administrator`; do not self-register elevated roles. The backend must map these to verified grants, programme scopes, ownership, assignments, conflicts, stage and record audience; deny by default.
- Initial frontend draft keys: `title`, `theme`, `problem`, `solution`, `impact`, `team`. Preserve DTO compatibility. `theme` is not the same as `programme`. Frontend stage strings and criteria are fixtures and must not become irrevocable rules.
- Use server-generated ownership, immutable submission/version snapshots, idempotent submission and decision commands, transactions for state+event+audit+outbox, restricted read serializers, and negative authorization tests.
- No AI-generated decisions, no unapproved external ID systems, no production data, no production-hosting/compliance claims.

## Agent workflow
1. Start every task by confirming current branch, clean working state, actual dependencies and assigned module. State assumptions; never invent existing functionality.
2. Produce a small implementation plan, touched-file list, dependencies on other developer, test plan and acceptance criteria. **Wait for explicit authorization** before implementation.
3. Work in one small branch created from updated `develop`, no mixing unrelated fixes. A owns shared files; B requests contract/schema changes as a separate handoff.
4. For each implemented API: input validation, authorization, persistence, error codes, tests and OpenAPI; no stub/mock can be described as production functionality.
5. Before PR: typecheck, build, unit/integration/security tests as applicable, verify migrations against clean PostgreSQL and update docs. Report actual commands and pass/fail status; never claim unrun tests passed.
6. PR into `develop`, not `main`; human review/CI required. Sync at least daily, preferably after each vertical slice. Keep deployment and secrets manual.
7. Stop immediately and report if another developer's file, incompatible migration, unexpected rebase/merge, credentials, or protected frontend changes are encountered.
