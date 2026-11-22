# CEDA Innovation Portal

Phase 1 frontend skeleton for the hackathon, adapted from the BOCRA React + Vite website.

## Run locally

Use Node.js 20.19+ or 22.12+ as required by the inherited Vite 8 tooling.

```powershell
cd C:\Users\user\Documents\BAC\Ceda\frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. Build with `npm run build`.

## What this phase includes

- CEDA logos in the compact navigation, hero and account screens; a text wordmark in the footer.
- The original BOCRA fullscreen hero, scroll morph, dot/progress loader, service rows and footer layout, adapted to CEDA.
- Public services, sample programmes, concise guidance, help and privacy pages.
- Guest browsing with a sign-in popup for protected actions.
- Six proposed demo roles: Applicant, Evaluator, Adjudicator, Programme administrator, CEDA management and System administrator.
- A required-field idea form, an explicitly saved local draft and local demo submissions.
- Submission details, a status display, example feedback and an initial version record.
- Review and adjudication screen skeletons, programme administration, aggregate demo reports and technical controls.

On the sign-in page, select a role under **Demo access**, then choose **Open**. Demo identity is held in memory and ends on refresh. Drafts and demo submissions remain in this browser when local storage is available. No passwords are stored.

## Current boundary

This is a frontend prototype. Account forms do not authenticate, register users or send reset emails. Review scores, decisions, notifications, attachments, audit logs and configuration are not connected to services. The role gates organise the demo UI; the future server must enforce permissions and per-record ownership independently.

Use fictional information. Local demo data is shared between roles in the same browser. Clear this site's browser storage to remove it.

The next development work, owning files and requirements coverage are in [the frontend roadmap](docs/FRONTEND_ROADMAP.md).

## Source and assets

- CEDA repository: [Batoli19/CedaHackathon](https://github.com/Batoli19/CedaHackathon), branch `main`.
- Adapted from [Batoli19/Bocra](https://github.com/Batoli19/Bocra), baseline commit `63bb954`. The original source and README are retained in Git history.
- The floating navigation, footer structure, guest popup, route guard and layout patterns were adapted for this portal. BOCRA telecom pages, chatbot, backend and unrelated assets were removed from this local copy.
- The unmodified CEDA logo comes from [CEDA's official site](https://www.ceda.co.bw/sites/default/files/logo_2.png).
- The abstract hero and CEDA brain-and-hands banner were generated for this adaptation. The latter follows the original BOCRA banner with CEDA lettering.
- The floating CEDA guide routes visitors to services locally. AI is not connected.
- Typography: Plus Jakarta Sans and Inter, loaded from Google Fonts.

The supplied competition notice is the official functional source. The additional 18-slide requirements deck is the team's proposed baseline. Programme rules, role delegation, criteria and deadlines in that deck still require CEDA validation.
