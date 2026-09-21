# MVP execution ledger

Spec: docs/product-spec.md. Plan: docs/superpowers/plans/2026-09-21-mvp.md.

- Baseline: empty external repository; isolated local feat/mvp checkout, no existing tests.
- Source snapshot copied with MIT notice; implementation adapts only wrapper and field editor, not the whole demo site.
- Ruling: native execution continues under explicit build authorization without another permission round.
- Ruling: embedded PostgreSQL for local persistence; DATABASE_URL for hosted PostgreSQL. Deployment needs persistent storage if using embedded mode.
- Ruling: real AI route built, no fake generation; provider key/model unavailable in this session.
- Dependency resolution: React latest 19.3 conflicts with fiber 9.7 peer <19.3; pin React/ReactDOM 19.2.7 and resolve normally (no force).
- Browser verification uses the platform browser skill, which takes precedence over the standalone agent-browser skill.

- Used the supervised preview solely for internal QA of the external-repository app; no Sites project or deployment was created. The own-app architecture is retained.
- Fixed development preview compatibility: crypto UUID uses cryptographic getRandomValues when randomUUID is unavailable on HTTP; development CLI accepts forwarded --port; Vite allowedHosts includes terminal.local.
- Browser cannot create WebGL context; support detection disables play and exposes standard mode. Standard demo end-to-end passed; GPU gameplay remains a desktop release gate.
- Independent review: fixed Docker env hash quoting, optional-choice double progression, and mismatched draft revision adoption. Two UI regression tests verify reviewed failures and repaired behavior.
- No AI key, external PostgreSQL or hosting configured. Real provider integration is present, unavailable state is explicit.
