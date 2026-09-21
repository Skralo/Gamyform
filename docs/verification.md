# MVP verification — 2026-09-21

This is an implemented MVP candidate, not a claim of a production deployment.

## Automated checks

- `npm test`: 17 tests across shared validation, API authorization, persistence/versioning, AI provider-contract handling and React UI regressions.
- `npm run build`: strict TypeScript check and Vite production build.
- Shared validation covers invalid choices/email, required false and zero, blank numeric values, step/clamp rules, and CSV formula escaping.
- API tests cover unauthorized and cross-origin owner operations, draft revision conflicts, immutable publication, exact retry replay, changed-payload rejection and closed forms.
- Persistence integration test closes and reopens an on-disk PGlite database; verifies one stored response after concurrent duplicate attempts; verifies old-version labels survive a subsequent publication, safe CSV and deletion.
- AI unit tests use a mocked HTTP provider to test missing configuration, schema validation and one bounded repair attempt. These are not evidence of a live AI-provider request.
- UI regression tests reproduce rapid optional-choice/Skip double advancement and stale revision adoption after Close. Both fail against the reviewed pre-fix implementation and pass with the fixes.

## Browser observations

The actual application was loaded through the supervised development preview. Observed the login screen and public demo entrance. Completed the demo using the standard form: choice → number → name → email → optional skip → final review → explicit send → preview completion. Reviewed displayed answers including the entered number and confirmed the completion clearly states that no response was saved.

The cloud browser cannot create a WebGL context. The application now probes support before enabling play and visibly offers standard mode. The fallback screen was verified after this repair. Consequently **3D appearance, camera aiming, pointer lock, raycast hit feel, virtual-keyboard usability, frame rate and audible sound quality have not been browser-verified** here. Their source and TypeScript build are present; a real desktop GPU test remains a release gate.

Owner authorization/data endpoints were tested through real Fastify injection and a real PGlite database. Editor regression behavior was tested in React/jsdom. The authenticated owner workflow was not exercised end to end in the cloud browser; no authentication bypass was added for testing.

## Independent review and fixes

A separate reviewer inspected commit `56bb53e3` and identified:

1. Quoted bcrypt hashes conflict with Docker `--env-file`: setup now emits an unquoted hash, compatible with dotenv and Docker environment files.
2. Skip could advance during the delayed single-choice transition: all native progression now shares the transition guard; covered by a regression test.
3. Closing/reopening and publish refresh could import another tab's draft revision without its definition: publication updates now change publication metadata only; covered by a stale-tab regression test.

Also protected in-app navigation from accidental unsaved-draft loss and disabled editing while save/publication operations are in flight.

## Configuration and release gates

- Add an owner password through `npm run setup` on the actual deployment.
- Add server-side `AI_API_KEY` and `AI_MODEL` to enable real prompt-to-draft generation. This session had neither.
- Deploy behind HTTPS with exact `APP_ORIGIN`; configure a persistent volume for one embedded-database process or `DATABASE_URL` for a hosted PostgreSQL database.
- External `pg` connections, Docker execution, a production host and a live AI-provider request have not been tested in this environment.
- Complete one actual desktop game submission and inspect its stored row/CSV before real use. Exercise Back, numeric confirmation, virtual email keys, physical typing, Escape/resume, free look/recenter, mute, reduced motion, failed-network retry and closed form behavior.
- The procedural courtyard/blaster are the first visual implementation; final brand artwork and subjective audio tuning require that desktop playtest.

No production hostname or hosted public app is included in this delivery. `/demo` runs locally after the documented setup.
