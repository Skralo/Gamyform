# Gamyform v2 — Slice 1 (Player) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MVP runner with the v2 player: a real-HTML glass panel floating in a low-poly 3D world, three tools with full game feel, native typing, minimal HUD and a matching standard mode.

**Architecture:** A plain three.js `Engine` owns three stacked layers (world WebGL → CSS3D glass panel → FX WebGL) that share one camera and one frame loop. React renders only the panel content (portal into the CSS3D element) and the HUD. Shots resolve the DOM target under the crosshair with `elementFromPoint`, fly a cosmetic projectile, and on landing call the target's `click()` — so game mode and standard mode share one set of button handlers.

**Tech Stack:** React 19, TypeScript, Vite, three r186 (`three/addons`: CSS3DRenderer, PointerLockControls, DecalGeometry, RoomEnvironment), react-hook-form, zod, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-v2-player-design.md`

## Global Constraints

- Desktop only. No touch controls.
- Copy rule: every visible player string is an instruction or a state; all player strings live in `src/player/copy.ts` (EN + SL).
- No new npm dependencies. Remove `@react-three/fiber` once the old runner is deleted.
- Server, API, database and domain validation rules stay unchanged except the optional `experience` field.
- `experience` defaults: `tool: "water"`, `accent: "#4FD1FF"`, `world: "terrace"`; `schemaVersion` stays `1`.
- Flight times: water 140 ms, bubbles 220 ms, throw 260 ms. Hit-stop 60 ms at 5% speed. Decal pool 24. WebGL pixel ratio cap 1.5.
- Reduced motion follows `prefers-reduced-motion`. No camera shake.
- Player CSS is scoped under `.gf-root`; imperative state on DOM targets uses attributes (`data-aim`, `data-hit`), never classes React owns.
- All existing tests stay green. Commit after each task; push `feat/v2` to `origin`.

## File map

| File | Responsibility |
|---|---|
| `src/domain.ts` (modify) | `TOOLS`, `ToolId`, `Experience`, `DEFAULT_EXPERIENCE`, `experienceOf`, optional `experience` in the definition schema |
| `src/player/copy.ts` | EN/SL player strings (`Copy`, `copyFor`) |
| `src/player/theme.ts` | `Palette`, `TERRACE`, `paletteFor`, `onAccent`, `themeVars` |
| `src/player/Panel.tsx` | Presentational panel for start / question / review / success, shared by both modes |
| `src/player/player.css` | Tokens and styles for panel, HUD, pause sheet, standard mode, DOM impact effects |
| `src/player/Player.tsx` | Loader + controller (answers, stages, validation, submission, analytics) — ported from MVP runner |
| `src/player/StandardView.tsx` | Flat panel over a soft gradient (fallback + accessible path) |
| `src/player/GameView.tsx` | Mounts `Engine`, portals the panel, crosshair, hint, pause sheet |
| `src/player/PauseSheet.tsx` | Resume · Sound · Use standard form |
| `src/player/engine/math.ts` | Pure helpers: `arcPoint`, `panelLocalToPx`, `insideRect`, `panelFit`, `closestTarget` |
| `src/player/engine/spring.ts` | Damped spring for recoil/sway |
| `src/player/engine/world.ts` | `buildTerrace(palette)` → sky, lights, fog, ground, arch, hedge, trees, pool, clouds, decal surfaces |
| `src/player/engine/tools.ts` | `TOOL_SPECS`, `Viewmodel` (water gun, bubble gun, throwing glove) |
| `src/player/engine/textures.ts` | Procedural decal textures (wet, soap, scuff) |
| `src/player/engine/effects.ts` | Projectiles, particles, balls, decals, DOM panel impacts |
| `src/player/engine/Engine.ts` | Renderers, camera, controls, loop, resize/fit, aim, fire, hit resolution, recenter, degrade, dispose |
| `src/audio.ts` (rewrite) | Synth kit: fire/impact per tool, select, tick, error, success; pitch variation; voice cap |
| `src/App.tsx`, `src/admin/Workspace.tsx`, `src/seed.ts`, `vite.config.ts`, `README.md` (modify) | Routing to the new player, Tool + Accent settings, v2 seed copy, chunking, docs |
| `src/game/*` (delete) | Old runner and R3F scene |

## Tasks

### Task 1: Experience in the domain
**Files:** Modify `src/domain.ts`; Test `tests/domain.test.ts`
**Produces:** `TOOLS`, `ToolId`, `Experience`, `DEFAULT_EXPERIENCE`, `experienceOf(d)`
- [ ] Add failing tests: missing `experience` → defaults; `{tool:"bubbles",accent:"#112233",world:"terrace"}` accepted; unknown tool, non-hex accent and extra keys rejected.
- [ ] Run `npx vitest run tests/domain.test.ts` → FAIL (`experienceOf` not exported).
- [ ] Implement a strict zod `experienceSchema` with defaults; add `experience: experienceSchema.optional()` to the definition schema; export `experienceOf`.
- [ ] Run tests → PASS. Commit `feat(domain): optional experience (tool, accent, world)`.

### Task 2: Copy, theme and pure engine helpers
**Files:** Create `src/player/copy.ts`, `src/player/theme.ts`, `src/player/engine/math.ts`, `src/player/engine/spring.ts`; Tests `tests/theme.test.ts`, `tests/player-math.test.ts`
**Produces:** `copyFor(locale): Copy`; `paletteFor(exp): Palette`; `onAccent(hex)`; `themeVars(exp)`; `arcPoint(a,b,t,lift)`; `panelLocalToPx(local, scale, size)`; `insideRect(p,size)`; `panelFit(viewport,fovDeg,distance)` → `{k, scale}`; `closestTarget(el)`; `class Spring { kick(v); update(dt,target?) }`
- [ ] Tests first: `onAccent("#4FD1FF") === "#04121A"`, `onAccent("#1A3A8F") === "#FFFFFF"`; arc endpoints exact and midpoint lifted; `panelLocalToPx({0,0}) === centre`; `panelFit({1440,900},55,4.4)` → `k≈0.8928`, `scale≈0.00509`; `closestTarget` climbs to enabled `[data-target]`, ignores disabled; spring kicks > 0.2 and settles < 0.01 within 1.5 s.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat(player): copy, theme and engine math`.

### Task 3: Panel, styles, controller and standard mode
**Files:** Create `src/player/Panel.tsx`, `src/player/player.css`, `src/player/Player.tsx`, `src/player/StandardView.tsx`, `src/player/PauseSheet.tsx`; Modify `src/App.tsx`, `src/seed.ts`; Test `tests/ui.test.tsx`
**Consumes:** Task 1–2. **Produces:** `default Player({path})`; `Panel({view, actions, t})`; `PanelView`, `PanelActions`, `Stage`.
- [ ] Port the MVP UI test to `Player` (Start → choice → Skip during transition must not double-advance).
- [ ] Add: text question continues on form submit (Enter), long text continues on Enter keydown, editing a review row returns to Review with the new value.
- [ ] Run → FAIL (module missing). Implement Panel (data-target on every shootable control; focus text/number inputs with `preventScroll` on mount), controller (return-to-review flag, trimmed text commits, frozen idempotent submit, analytics unchanged), StandardView, App route. Update seed help copy (no shooting-keys hint).
- [ ] Run all tests → PASS. Commit `feat(player): glass panel, controller and standard mode`.

### Task 4: Sound kit
**Files:** Rewrite `src/audio.ts`
**Produces:** `sound.play(kind: SoundKind)` with `fire-${ToolId}`, `impact-${ToolId}`, `select`, `tick`, `error`, `success`; `unlock()`, `settings()`, `pause()` unchanged.
- [ ] Implement tone + filtered-noise voices, ±6% pitch, max 14 voices. Typecheck. Commit `feat(audio): tool sound kit`.

### Task 5: World, tools, textures and effects
**Files:** Create `src/player/engine/world.ts`, `tools.ts`, `textures.ts`, `effects.ts`
**Produces:** `buildTerrace(p): WorldHandle {group, surfaces, fog, setPalette, update, dispose}`; `TOOL_SPECS`; `class Viewmodel {group; fire(); look(dx,dy); update(dt,t,camera); muzzleWorld(out); dispose()}`; `decalTexture(kind)`; `type Hit`; `class Effects {launch(tool, from, hit, onLand); panelImpact(tool, px, host); update(fxDt, dt); dispose()}`
- [ ] Implement (WebGL — verified manually in Task 7). Typecheck. Commit `feat(engine): terrace world, tools and effects`.

### Task 6: Engine and GameView
**Files:** Create `src/player/engine/Engine.ts`, `src/player/GameView.tsx`
**Consumes:** Tasks 2–5. **Produces:** `class Engine {panelElement; on(event, cb); setGeneration(g); setActive(on); lock(): Promise<boolean>; dispose()}`; dev-only `window.__gf` test hook (`aim(selector)`, `fire()`, `fakeLock()`).
- [ ] Implement the three-layer loop, fit, aim, fire → land → `target.click()`, layering rule, hit-stop, recenter on resume, solid-glass degrade, full dispose (listeners removed before context loss).
- [ ] Wire GameView: first lock failure → standard mode; later failure → "Click Resume again"; release pointer on success; re-focus inputs on resume.
- [ ] Typecheck + tests. Commit `feat(player): three-layer engine and game view`.

### Task 7: Settings, cleanup, docs and verification
**Files:** Modify `src/admin/Workspace.tsx`, `vite.config.ts`, `README.md`, `package.json`; Delete `src/game/Runner.tsx`, `src/game/Scene.tsx`; Test `tests/ui.test.tsx`
- [ ] Test: choosing Tool "Bubble gun" in Experience settings saves `definition.experience.tool = "bubbles"`. Implement Tool + Accent controls.
- [ ] Delete old runner, `npm uninstall @react-three/fiber`, simplify chunking, update README controls. `npm test`, `npm run build`.
- [ ] Browser verification (`/demo`, `?tool=bubbles`, `?tool=throw`): panel legibility, aim highlight, each tool's shot → impact → advance, decals, pause/resume, typing while locked, review → send, fps, reduced motion. Screenshots to the owner.
- [ ] Commit, push, open a draft PR `feat/v2 → main`.

## Self-review

- Spec coverage: §5.1 → T6 · §5.2 → T6 · §5.3 → T3/T6 · §5.4 → T4/T5 · §5.5 → T5/T6 · §5.6 → T5 · §5.7 → T1/T7 · §5.8 → T6 · §5.9 → T2/T3 · §5.10 → T3 · §5.11 → T3/T5 · §5.12 → T6 · §5.13 → T1–T3/T7 · §6 tokens → T3.
- Names are consistent across tasks (`experienceOf`, `panelFit`, `closestTarget`, `Engine.on/setGeneration/setActive/lock`, `Effects.launch/panelImpact`).
