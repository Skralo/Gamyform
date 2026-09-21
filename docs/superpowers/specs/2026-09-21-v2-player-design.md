# Gamyform v2 — design spec (slice 1: player)

**Status:** approved direction (owner "go", 21 September 2026). Slice 1 in build on `feat/v2`.
**Owner:** Anže Skralovnik / SKRALOVNIK · **Branch:** `feat/v2` from `main` @ `66c0ed2`.
**Scope of this document:** the whole v2 direction in short, and slice 1 (the player) in full. Slices 2–4 get their own specs.

## Povzetek (SL)

v2 je produkt, s katerim brandi dolgočasne forme spremenijo v igro. Najprej gradimo **predvajalnik**: velik steklen panel v Apple/visionOS slogu, ki lebdi v low-poly 3D svetu, in pravi občutek streljanja (viden metek, pljusk, odtis, odsun). Samo desktop. Brez sloganov in šumnih gumbov. Ime in e-mail se natipkata normalno. Tri orodja: vodna pištola, milni mehurčki, met z roko. Backend MVP-ja ostane nespremenjen.

---

## 1. Decisions from the v2 interview (21 Sept 2026)

| # | Question | Owner decision | Consequence |
|---|---|---|---|
| D1 | What v2 is for | A product brands use to upgrade their boring forms | Brand look is data (theme), never hard-coded |
| D2 | Devices | Desktop only | Mouse aim + pointer lock stay; no touch controls |
| D3 | "Pop-up" meaning | Embedded section on a brand's site (Typeform-style) or its own page by link | Player must be self-contained and embeddable (embed script in slice 3) |
| D4 | Timeline | Now | Build in slices; slice 1 playable first |
| D5 | First priority | Glass UI + game feel | Slice 1 = player |
| D6 | Hero art style | Low poly | Flat-shaded world; pixel/line later as filters |
| D7 | Tools in first release | Water & bubble guns, throw by hand | Three tools in slice 1 |
| D8 | 3D assets | Free CC0 packs now, custom later | See §5.6: slice 1 world is code-built; CC0 kits join in slice 2 |
| D9 | Brand tab | Website URL → auto theme → 3 presets | Slice 4 |
| D10 | Accounts | One workspace for now | No brand sign-up in v2 |

## 2. What v2 fixes (MVP review)

1. About 50 slogan lines ("PLAYFUL BY DESIGN", "CRAFTED FOR CONNECTION"…) that tell the user nothing.
2. Nine HUD elements around the question during play.
3. Question text is painted on a 2D canvas (Arial/Georgia) and glued onto a 3D plane, so it can never look native or premium.
4. No juice: a hit shrinks a card by 3% for 140 ms. No visible projectile, impact or mark.
5. Friction before play: 7-element intro card → practice shot → pointer lock → question 1. Email is shot letter by letter.
6. The builder reads like a marketing page; manual Save; preview leaves the editor; one fixed scene (slice 3).

**Kept unchanged:** server, database, versioned publication, idempotent submissions, CSV, auth, domain validation, analytics events and their privacy rules.

## 3. Product direction

1. **Glass panel, game world.** The question lives on one large glass window floating in the 3D world, built from real HTML. The answers on it are the targets.
2. **Loadout per form.** Every game part is a slot: tool → projectile → impact → world → style → colors. Presets are ready combinations. (Slice 1 ships the tool slot and the accent color.)
3. **Art style as a filter.** Low poly is the hero. Pixel and line art become post-processing on the same world (slice 2). The glass panel stays sharp in every style.
4. **Real game feel.** Same-frame tool response, visible projectile, impact particles, decals that linger, a short hit-stop, recoil.
5. **Zero-friction player.** No intro wall, no practice round, crosshair + progress line only, normal typing for text.
6. **One-screen builder** with live preview, autosave, embed code and Brand-from-URL (slices 3–4).

## 4. Slices

| Slice | Contents | Spec |
|---|---|---|
| **1 · Player v2** | Three-layer renderer, glass panel, 3 tools with full game feel, one low-poly world, minimal HUD, native typing, restyled standard mode, copy purge, tool + accent in settings | This document |
| 2 · Loadout | Preset system, 2+ more worlds, CC0 prop kits, pixel + line filters | Later |
| 3 · Builder + embed | One-screen builder, autosave, live preview, share link + embed script (inline section / own page), hosting | Later |
| 4 · Brand from URL | Safe website fetch → logo, colors, fonts → 3 preset suggestions | Later |

## 5. Slice 1 — player

### 5.1 Three-layer renderer

Three stacked, full-size layers inside the player container, sharing **one camera** and **one frame loop**:

| Order | Layer | Technology | Contains | Pointer events |
|---|---|---|---|---|
| back | World | WebGL (`three` WebGLRenderer) | Environment, lights, world decals, projectiles that have passed behind the panel | receives pointer lock |
| middle | Panel | `CSS3DRenderer` (`three/addons`) | One `CSS3DObject` holding the React-rendered glass panel | yes (hit-testing) |
| front | FX | WebGL, transparent | Tool viewmodel, projectiles in flight in front of the panel, impact particles | none |

- **Validated by spike (21 Sept):** `backdrop-filter` on the CSS3D panel blurs the WebGL world behind it; a WebGL object on the FX layer renders in front of the glass; `document.elementFromPoint` at screen centre returns the card under the crosshair through the 3D transform; 120 fps in the app's browser.
- **Plain three.js engine, not React Three Fiber.** One explicit `requestAnimationFrame` loop renders world → panel → FX in order with the same camera. React renders only the panel content (via a portal into the `CSS3DObject` element) and never re-renders per frame. `@react-three/fiber` is removed when the old runner is deleted.
- Camera: fixed position, free yaw, pitch clamped to ±75°, `PointerLockControls` (existing behaviour, A07). Pixel ratio capped at 1.5 for both WebGL layers.
- Panel scale: design width 1000 CSS px; world scale `S` chosen so the panel spans ~62% of the viewport width from the start heading. `CSS px = panel-local world units / S`.

### 5.2 Aiming, firing and hit resolution

- **Aim:** while locked, once per frame, `elementFromPoint(centre)` → nearest ancestor with `data-target` → that element gets `data-aim` (CSS hover state). Elements under the FX canvas are reachable because the FX canvas has `pointer-events: none`.
- **Fire:** `mousedown` while locked → existing `ShotGate` (one shot per press, 150 ms cooldown, generation check; A08/A09) → `preventDefault` (keeps text focus) → the tool fires this frame (kick + sound).
- **Resolution is immediate and deterministic** (MVP spec §6.3): the target under the crosshair at `mousedown` is the answer. The projectile is cosmetic.
- **Hit point:** ray from the camera through the centre vs. an invisible plane matching the panel transform. Inside the panel → panel-local px → DOM impact effect at that point. Otherwise → raycast world meshes → world decal. Nothing hit → projectile flies into the sky and fades.
- **Timing:** tool kick + sound at t=0; projectile lands at the tool's flight time (§5.4); card reaction plays on landing; question transition starts after landing + 300 ms (existing lock, A08). Input stays locked from `mousedown` until the next question is shown.
- **Layering rule:** a projectile is drawn on the FX layer while it is in front of the panel plane. If its end point is behind the panel plane (a miss past the panel edge), it moves to the world layer when it crosses that plane, so the glass covers it correctly.

### 5.3 The glass panel

One `CSS3DObject`, fixed in world space in front of the start heading (billboard not needed: the camera never moves). React components render its content:

| State | Content (top → bottom) |
|---|---|
| Start | Form title · description (if set) · **Start** (accent pill) · sound toggle icon |
| Choice / boolean | Progress line · Back (if index > 0) · Skip (if optional) · question · help (if set) · 2–6 answer cards in a 2-column grid |
| Number | Progress · Back/Skip · question · help · large value between round **−** and **+** targets · **Continue** |
| Short text / email | Progress · Back/Skip · question · help · large input with caret · **Continue** |
| Review | "Check your answers" · rows (question → answer; each row is a target that edits that question and returns to Review) · **Send** |
| Sending / error | Send shows progress; recoverable error text + **Retry** (same idempotency key; A18) |
| Success | Completion title · message · one small accent flourish |
| Closed / unavailable | One sentence + (standard) link back where applicable |

- **Pop-in:** each new state enters with a spring (scale 0.96 → 1, opacity 0 → 1, blur 6 px → 0); answer cards stagger by 35 ms. Reduced motion: opacity only.
- **Native typing (D2 friction rule):** text questions focus a real `<input>` inside the panel with `focus({ preventScroll: true })`. Pointer lock stays active; the keyboard types normally, paste works, **Enter** continues, shooting **Continue** also continues. No shootable keyboard in slice 1.
- **Pause:** pointer unlock (Esc, tab switch) opens a screen-space glass sheet with **Resume**, **Sound** (on/off + volume), **Use standard form**. Resume re-locks; if the panel is more than 35° off-centre the view eases back to it. Reduced motion follows the OS setting.

### 5.4 Tools, projectiles and impacts

| | Water gun (default) | Bubble gun | Throw |
|---|---|---|---|
| Viewmodel | Chunky low-poly toy water blaster; tank in accent color | Rounded bubble blaster with a ring nozzle | Low-poly hand holding a ball |
| On `mousedown` | Pump kick (spring), nozzle spray puff | Soft recoil, ring wobble | Wind-up → release arm swing |
| Projectile | 12 instanced droplets on a slight arc, stretched along velocity | 6 iridescent bubbles (fresnel shader), gentle wobble | One ball on a ballistic arc ending exactly at the hit point |
| Flight time | 140 ms | 220 ms | 260 ms |
| Panel impact (DOM) | Splash burst + wet spot that fades in 1.2 s | Pop ring + tiny droplets | Ripple ring; ball bounces off in the FX layer and drops |
| World impact | Wet-stain decal (fades over 8 s) + splash particles | Soap-ring decal + pop | Scuff decal + ball bounces, rests, fades |
| Sound | Squirt + splash | Blip + pop | Whoosh + thud |

Decals use `DecalGeometry` with procedurally drawn textures (no image files), pooled at 24. Particles are instanced and pooled.

### 5.5 Game-feel rules

| Rule | Source |
|---|---|
| Response in the same frame as the click (kick + sound) | "Juice it or lose it" (Jonasson & Purho, 2012) |
| Hit-stop: FX time freezes 50 ms on a valid answer hit | Fighting-game hit-stop; "The Art of Screenshake" (Nijman, 2013) |
| Card squash & settle: 0.96 → 1.02 → 1 | Squash/stretch, animation principles |
| Permanence: decals linger, then fade | "The Art of Screenshake" |
| Variation: ±6% pitch per shot, randomised particle spread | "Juice it or lose it" |
| Weapon sway (lags look slightly) + idle bob | FPS viewmodel convention |
| **No camera shake** | MVP spec §6.8 comfort rule |
| Equal reinforcement for every answer | MVP spec §6.8 |

### 5.6 World (slice 1)

- **"Terrace":** a bright low-poly outdoor space. Gradient sky dome, flat-shaded ground with gentle hills, low-poly trees, rocks, a shallow pool, and an open frame behind the panel so shots have surfaces to hit. One sun with one 1024 px shadow map, one hemisphere light, soft fog.
- **Palette roles** (theme tokens): `skyTop`, `skyBottom`, `ground`, `foliageA`, `foliageB`, `stone`, `water`, `accent`. Recoloring = updating role colors.
- **Deviation from D8, stated openly:** slice 1 builds the world in code (no downloads, no licensing, instant recolor). CC0 prop kits (Kenney, Quaternius) arrive in slice 2 with richer props; their download list will be confirmed with the owner then.

### 5.7 Data model

The definition gains an **optional** `experience` object. It is additive, so `schemaVersion` stays `1`; existing drafts and published versions validate unchanged and render with defaults.

```json
"experience": { "tool": "water", "accent": "#4FD1FF", "world": "terrace" }
```

| Field | Values | Default |
|---|---|---|
| `tool` | `water` · `bubbles` · `throw` | `water` |
| `accent` | `#RRGGBB` | `#4FD1FF` |
| `world` | `terrace` | `terrace` |

Server validation stays strict (unknown keys/values rejected). AI drafts leave it out (defaults apply). The editor's settings tab gets **Tool** (3 options) and **Accent color**; no other builder change in slice 1.

### 5.8 HUD

- **Crosshair:** 6 px dot + 22 px ring, white with a thin dark outline. Over a target: ring tightens to 16 px and turns accent. On shot: ring pulses out in 120 ms.
- **Progress:** 3 px accent line along the top edge inside the panel.
- **First-shot hint** under the crosshair: "Click to shoot · Esc for menu". Fades after the first shot or 6 s.
- Nothing else on screen during play. No logo, no scene name, no footer.

### 5.9 Copy rule

Every visible string is an instruction or a state. Creator content (title, description, help, completion) is shown as written. Player strings are EN/SL pairs; the full list lives in one module (`src/player/copy.ts`).

### 5.10 Standard mode

The same panel components, rendered flat (no 3D) and centered over a soft, blurred gradient in the brand accent. Normal mouse and keyboard; Enter continues. It is both the no-WebGL fallback and the accessible path (A16, A25).

### 5.11 Accessibility and comfort

- `prefers-reduced-motion`: opacity-only transitions, no hit-stop, no sway/bob, half the particles.
- White text on regular glass with a dimming tint (Apple: dim bright backdrops); target ≥ 4.5:1 for question text over the brightest part of the world, checked on screenshots.
- Rounded targets, ≥ 16 px margins, target centres ≥ 60 px apart (Apple visionOS gaze guidance).

### 5.12 Performance budget

60 fps at 1440×900 on the reference Mac. One blurred element (the panel). Instanced particles, pooled projectiles and decals. If `backdrop-filter` is unsupported or frame time stays above 25 ms for 2 s, the panel switches to a solid tinted glass (no blur).

### 5.13 Testing

- **Unit:** `experience` defaults and validation; target resolution from an element; projectile flight math (arrival time; arc ends at the hit point); `ShotGate` (existing).
- **UI (jsdom, standard mode):** no double advance during a choice transition (ported from the MVP test); Enter continues a text question; editing from Review returns to Review.
- **Existing** server, domain and persistence tests stay green.
- **Manual in a real browser:** start → pointer lock; aim highlight; each tool's shot → impact → advance; world decals; pause/resume; typing while locked; review → send in preview; fps; reduced motion.

### 5.14 Out of scope for slice 1

Presets and loadout UI beyond tool + accent · more worlds · pixel/line styles · CC0 kits · builder redesign · embed script and hosting · Brand from URL · shootable keyboard · mobile.

### 5.15 Risks

| Risk | Mitigation |
|---|---|
| `backdrop-filter` cost on weak GPUs | Auto-degrade to solid glass (§5.12) |
| Safari quirks with CSS3D + blur | Test; same degrade path |
| Focus lost on click while locked | `preventDefault` on `mousedown`; re-focus on state entry |
| Pointer lock inside an iframe embed | Handled in slice 3 (`allow` attributes, open-in-page fallback) |

## 6. Reference lock

Refero MCP was not connected in this session; research used Apple's Human Interface Guidelines (Materials, Windows, Eyes, Typography, Color, Layout), established game-feel talks, and the UI Layouts `liquid-glass` component (reviewed; its layered edge-highlight idea is borrowed, its SVG turbulence distortion and drag behaviour are not).

```text
Primary direction: Apple visionOS window on Liquid Glass (regular variant) — one upright glass
                   window floating in a world, white text, bold type, rounded targets, gaze-style hover.
Preserve:          1 one glass window per view; regular variant (blur + luminosity shift), never clear glass behind text
                   2 bolder type: question as an extra-large title, heavy weights, white on glass
                   3 rounded interactive shapes; ≥16 px margins; target centres ≥60 px apart
                   4 hover = subtle highlight + lift, no motion near the target in the periphery
                   5 color sparingly: accent only on the primary action and the selected answer
Borrow only:       game-feel canon (same-frame response, hit-stop, particles, permanence) · UI Layouts
                   liquid-glass edge layer (inner highlight + soft outer glow)
Role rules:        glass = panel + pause sheet only; cards inside are standard fills, not nested glass;
                   accent = primary button background, selected card, crosshair on target — never panel tint
Media strategy:    code-native low-poly 3D; procedural decal/particle textures; no bitmap imagery
Reject:            slogans, eyebrows, footers, logos in play, nested blur layers, gradients on text, neon glow,
                   small targets, square corners, camera shake, confetti storms, letter-by-letter shooting
```

### Tokens (panel design size 1000 px)

| Token | Value | Role |
|---|---|---|
| `--gf-font` | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable", "Segoe UI", Roboto, sans-serif` | All player text (brand font override in slice 4) |
| Question | 56/60 px, 700, −0.022em, `text-wrap: balance` | Extra-large title |
| Answer | 28/34 px, 600 | Card label |
| Body / help | 20/28 px, 500, 72% white | Secondary |
| Meta (step, hints) | 15 px, 600, 60% white | Tertiary |
| Button | 20 px, 650 | Pills |
| Radius | panel 44 · card 28 · pill 999 | Rounded targets |
| Spacing | panel padding 48 · grid gap 16 · stack gaps 12/24/32 | ≥16 px margins |
| Glass | `rgba(18,24,32,.30)` + `blur(32px) saturate(170%)`; 1 px `rgba(255,255,255,.26)` border; inset top highlight `rgba(255,255,255,.38)`; shadow `0 40px 120px rgba(0,0,0,.28)` | Regular glass + dimming |
| Card | `rgba(255,255,255,.10)` fill, 1 px `rgba(255,255,255,.18)`; aim: `.20` fill, lift −2 px, scale 1.02 | Standard fill inside glass |
| Accent | `--gf-accent` (default `#4FD1FF`) with `--gf-on-accent` `#04121A` | Primary pill, selected card, crosshair on target |
| Motion | enter `cubic-bezier(.2,.9,.25,1.12)` 420 ms · hover 160 ms · squash 90 ms in / 260 ms spring out · stagger 35 ms | Springs, not linear |

## 7. Decision ledger

| Decision | Source | Role preserved | Why |
|---|---|---|---|
| One glass window, regular variant, dimming tint | Apple HIG Materials: regular variant for text-heavy components; dim bright backdrops | Glass = functional layer only | Legible question text over a bright low-poly world |
| No nested glass on cards | HIG Materials: Liquid Glass not in the content layer; use standard materials | Cards = standard fills | Hierarchy + one blur for performance |
| Aim highlight like gaze hover | HIG Eyes: highlight on look; rounded shapes are easier to target; spacing 16 pt / 60 pt | Hover = confirmation, not decoration | Crosshair targeting works like gaze targeting |
| Big bold question | HIG Typography (visionOS): bolder styles, extra-large titles, white text on glass | Title role | "Bigger, more focus" (owner brief) |
| Accent only on primary action + selection | HIG Color (Liquid Glass): color sparingly, on the background of prominent buttons | Accent = emphasis only | Brand color reads as intent, not noise |
| Three-layer renderer | Spike 21 Sept; owner brief (visible bullet, Apple panel) | — | Only option with native text, real blur and projectiles in front |
| Same-frame response, hit-stop, permanence, variation | Juice it or lose it; The Art of Screenshake | — | "Real game experience, smooth" (owner brief) |
| No camera shake, equal reinforcement | MVP spec §6.8 | — | Comfort; no answer bias |
| Native typing | MVP spec risk note; owner "less friction" | — | Shooting email letters is the biggest drop-off risk |
| Code-built low-poly world in slice 1 | D6, D8 (deviation stated in §5.6) | — | Zero downloads, instant recolor, playable now |
