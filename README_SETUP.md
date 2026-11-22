# CEDA Innovation Platform — verified Codex setup

Source inspected: user-supplied ZIP `CedaHackathon-main(1).zip` of `Batoli19/CedaHackathon`, 17 November 2026. This pack contains **instructions only**; no backend implementation is claimed or included. The ZIP snapshot does not contain Git metadata; inspect the live clone before editing.

## Repository facts
- The repository is a React 19 / Vite 8 frontend with JavaScript/JSX pages, React Router 7, Tailwind CSS 4, and browser-only demo state.
- No `backend/`, PostgreSQL schema, Prisma migrations, API server, authentication service or automated tests are present in the uploaded snapshot.
- Read `README.md`, `docs/FRONTEND_ROADMAP.md`, and `docs/BACKEND_ARCHITECTURE_HANDOFF.md` before implementation.
- The 8 November backend handoff was **analysis only** and explicitly marked architecture approval pending. The Codex prompts request a read-only audit first; implementation requires explicit authorization.
- React demo roles and `src/data/portal.js` fields are integration facts, **not** server-authoritative roles, policy or CEDA-approved rules.

## Install the pack
1. Make a clean clone of the repository. Do not copy the pack over any existing changed files without reviewing differences.
2. Copy `AGENTS.md`, `.github/`, and `docs/codex/` from this pack into the repository root. Do **not** replace the existing README, frontend or existing docs.
3. Commit the instruction files in a short-lived `chore/codex-team-setup` branch. Create a PR into `develop` (create `develop` from a known-good `main` snapshot first if absent), review it, and merge after approval.
4. Both developers pull updated `develop` and start separate small branches. **Do not** work for six days on two long-lived feature branches.
5. Developer A opens `docs/codex/DEVELOPER_A_PROMPT.md`. Developer B opens `docs/codex/DEVELOPER_B_PROMPT.md`. Each uses their own GitHub/Codex login and local database.
6. Run an initial read-only audit in Codex; confirm architecture/stack and obtain approval before changing code. Developer A should create a tested backend foundation PR before Developer B integrates API-dependent business modules; B can build pure unit-tested policy logic with fixtures in parallel.

## Documents included
- `AGENTS.md` — common instructions automatically discoverable by Codex in the repo root
- `docs/codex/REPO_AUDIT.md` — observed snapshot, evidence, unknowns
- `docs/codex/PROJECT_CONTEXT.md` — business goals, scope, demo story
- `docs/codex/TECH_STACK.md` — verified frontend and **planned** backend stack
- `docs/codex/TEAM_CONTRACT.md` — file ownership, cross-developer dependencies and Git rules
- `docs/codex/API_CONTRACT_V0.md` — **proposed** endpoints, DTOs, status/role mapping; requires agreement
- `docs/codex/SCHEMA_HANDOFF.md` — single migration writer and versioned data boundaries
- `docs/codex/SIX_DAY_PLAN.md` — dated daily tasks, owners, gate checks
- `docs/codex/DEVELOPER_A_PROMPT.md` and `DEVELOPER_B_PROMPT.md` — copy-and-use agent instructions
- `docs/codex/INTEGRATION_CHECKLIST.md` — PR and end-to-end checks
- `.github/pull_request_template.md` — reviewer checklist

## Integration principle
Short-lived branches -> reviewed, tested PRs -> `develop` -> staging smoke test -> `main` for demo. All backend work in `backend/`; the root frontend stays unchanged unless the frontend owner independently requests and reviews integration work.

## Not done automatically
No changes were made to the actual GitHub repository. No backend files, branches, cloud resources, dependencies, migrations, or accounts were created. No build/test run is claimed for the uploaded snapshot.
