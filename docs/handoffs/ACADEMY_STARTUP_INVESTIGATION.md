# Academy Startup Investigation — Landing (`/`) → Living Hextech Orrery (`/lol`)

Evidence-only investigation, 2026-10-17/18. **No runtime source was changed. Nothing was committed, merged, published or
deployed, and no production configuration was touched.** The repository changes are this file and `docs/handoffs/academy-startup/`
(filmstrips, the full benchmark table, the scratch harness), all uncommitted. They sit on local branch `academy-startup/investigation`
(= `origin/main` **`67118b2b`**, worktree `mogsy/.worktrees/academy-core-v1`).

Labels: **[S]** source-verified on `67118b2b` · **[M]** measured here · **[I]** engineering inference · **[U]** unknown / not testable here.

---

## RC2. The Landing as the Academy's preloader: held veil, real readiness (2026-10-18)

**Verdict (updated 2026-10-19): RC2.2 `0c32c406` is the engineering candidate.** It is measured headless: no lift ever showed an
incomplete scene (except slow-4G caps), and phones now lift ~0.3–0.65 s after the hand-off.
- Measured: the hand-off is concealed and lifts on real readiness, with no timeouts on fast, 4G, direct or phone loads.
- The Orrery e2e passes.
- Still owed before release (none can be done in local headless):
  - the real-GPU check (desktop lift timing, post-lift frames);
  - the owner's visual approval of the veil (recording).

### RC2.1 re-measure (2026-10-19, authorised: 10 cold loads, RC2.1 only, bundled headless Chromium, one browser)

ms after the hand-off (direct: after navigation start); medians (min–max). Table: `rc2/headless-rc21-remeasure.md`; raw:
`rc2/raw/harness-runs-rc21.tgz`.

| | n | complete | signals all settled (`data-startup-pending` empty) | **veil lift** | reason | complete at lift | RC2 lift (cap) |
|---|---|---|---|---|---|---|---|
| H1 fast | 3 | 376 (300–402) | 367 / 526 / 518 | **968** (950–1493) | **ready ×3** | 3/3 | 1643 |
| H2 4G | 3 | 495 (436–572) | 695 / 736 / 706 | **1219** (995–1622) | **ready ×3** | 3/3 | 1601 |
| H4 direct /lol | 2 | 1045 (934–1155) | 1001 / 1255 | **1387** (1234–1539) | **ready ×2** | 2/2 | 2234 |
| H5 phone-emu 4G | 2 | 245 (228–261) | **1261 / 1444** | **1436** (1344–1528) | **ready ×2** | 2/2 | 1483 |

Reading:
- **The defect is fixed.** No reveal was a timeout. Every lift showed a complete scene: 0 frames without frames, covers, Mogzy
  or the Patch Report.
- **Headless-only cost:** on desktop, the 0.4–1.0 s between "all settled" and the lift is the frame-flow rule learning
  headless Chromium's ~10 fps software rhythm (3 frames), counting 4 more, and restarting on its 150–200 ms frames. On a real
  60 fps GPU the same rule needs ~67 ms. The real-GPU lift is therefore expected at ≈ "all settled" + ~0.07 s, which is
  ~0.45 s fast and ~0.75 s 4G. **This must be confirmed on a real GPU (CI or the owner).**
- **The phone's late signal is Lora** (Mogzy's speech-bubble face). The pending log shows `font:lora` alone from ~0.26 s to
  1.26–1.44 s; everything else settles by ~0.3 s. Lora comes from the async `media=print` stylesheet, then its own file, and
  on 4G it is the last thing in. Space Mono and the book frames were brief pending on desktop 4G (~0.4 s).
- **Lora: decided and implemented in RC2.2 `0c32c406`** (owner, 2026-10-19). Lora stays critical and is loaded during the
  Landing.
  - **Why the late part was the file, not the stylesheet.** The Lora stylesheet arrived ~2.4 s before the hand-off in every
    run. The file is fetched only once something uses the face, and nothing on the Landing does, so it started at the
    Orrery's mount and competed with the Patch art.
  - **Why not a URL preload.** Google Fonts serves user-agent-specific files (curl, 2026-10-19):

    | Browser | Lora latin | Inter latin |
    |---|---|---|
    | desktop Chrome / Edge / headless | `lora/v37/0QIvMX1D_JOuMwr7Iw` | `inter/v20/…ZL7` |
    | Firefox | `…Iw` | `…ZL7W0I5nvwU` |
    | iPhone Safari, Android Chrome | `…I_FMl_E` | `…ZL7W0Q5nw` |

    A static `<link rel=preload>` (the owner's first choice, option a) would have helped phones only and been a wasted
    download on desktop. The owner chose the FontFace warm instead.
  - **What was built:** `src/lib/academy-startup/font-warm.ts`, `warmAcademyFonts()`. It calls `document.fonts.load()` for
    Lora and Space Mono during the Landing's hold (and at a direct `/lol` boot), and waits for the stylesheet if its faces
    are not registered yet. Every browser fetches exactly its own file. `index.html` is unchanged; the entry chunk grew
    +108 B brotli.
  - **Tests:** 4 unit tests for the helper; the Landing and direct boot call it once. 342/342 across the related suites;
    `tsc` at baseline; `eslint` clean.
  - **Measured (2026-10-19, authorised: 4 cold loads of RC2.2, bundled headless Chromium, one browser):**
    `rc2/headless-rc22-remeasure.md`, `rc2/raw/harness-runs-rc22.tgz`.

    | | n | complete | `font:lora` pending | all settled | **veil lift** | reason | complete at lift |
    |---|---|---|---|---|---|---|---|
    | H5 phone-emu 4G | 2 | 95 / 214 | **never** (RC2.1: until 1261 / 1444) | 195 / 348 | **311 / 647** (RC2.1: 1344 / 1528) | ready ×2 | 2/2 |
    | H2 desktop 4G | 2 | 608 / 379 | **never** (RC2.1: until ~600–700) | 724 / 613 | 1657 / 1713 | timeout ×1, ready ×1 | 2/2 |

    - **Phone: fixed.** The veil now lifts ~0.3–0.65 s after the hand-off, close to visually complete, instead of ~1.4 s.
    - **Desktop 4G (headless only):** fonts are no longer pending either. Everything settled by 613–724 ms, then this run's
      headless frames came at ~7 fps (intervals 100–267 ms, at the 250 ms stall ceiling), so the frame-flow rule got only ~6
      frames before the 1.6 s cap. One reveal was `timeout`, one `ready` just at the cap. Both showed a complete scene.
    - On a real GPU the same rule needs ~67 ms after settling (≈ 0.7–0.8 s lift on 4G). This is the first thing the real-GPU
      check must confirm. If a real low-end device behaves like this headless run, the tuning knob is `FLOW_STALL_MS` / the
      1.5× factor in `readiness.ts`; don't tune it to headless software rendering.
  - **Pre-existing finding, separate owner item:** the existing Inter preload in `index.html` (`…ZL7W0Q5nw`) matches only
    mobile browsers. Desktop browsers download it and then fetch their own Inter file too. Remove it, or warm Inter the same
    way, in a separate reviewed change.

Local only: nothing pushed, no PR, no merge, no deploy. RC1.1 (Patch-icon deferral) is **not** included.

### Controlled validation run (2026-10-19, authorised)

Bundled headless Chromium, one browser at a time, no visible windows, cold profile per load. RC1 `84946017` vs RC2 `97189c51`,
served side by side over HTTP/2 with mogzy.lol's cache policy, real Railway/Supabase reads, writes stubbed in-page. **30 loads**.
The harness recorded the app's veil (`s0-harness` `9f52bad9`). Landing rows are ms after the hand-off; direct rows are after
navigation start. Medians, n = 3 (H1, H2) or 2. Full table: `academy-startup/rc2/headless-rc1-vs-rc2.md`; raw runs:
`rc2/raw/harness-runs-rc2.tgz`.

| | RC1 complete | RC2 complete | RC2 veil lift | lift reason | scene complete at lift | worst frame after lift* |
|---|---|---|---|---|---|---|
| H1 fast | 459 | 394 | **1643** | timeout ×3 | **3/3** | 167 |
| H2 4G | 564 (frame +564) | 501 | **1601** | timeout ×3 | **3/3** | 100 |
| H3 slow 4G | never (covers 8108) | never (covers 8119) | 1660 | timeout ×2 | 0/2 (expected: bandwidth, B3) | 92 |
| H4 direct /lol | **1592** | **934** (−41 %) | 2234 (mount 384 + cap) | timeout ×2 | **2/2** | 117 |
| H5 phone-emu 4G | 556 | 300 | **1483** | **ready ×2** | **2/2** | 42 |
| H6 reduced motion | 345 | 664 (201–1126) | **913** | **ready ×2** | **2/2** | 17 |

\* headless software rendering: frame columns are not smoothness evidence (§D).

What it shows:
- **The hand-off works as designed.** Startup-surface frames after the hand-off: 0 in every RC2 run. In every case except slow 4G,
  the scene was visually complete when the veil lifted: no frame without books, covers, Mogzy or the Patch Report was revealed.
  0 page errors.
- **The direct-visit boot warm is a large win by itself:** direct `/lol` completes at 934 ms vs 1592 ms. The Academy chunk is at
  128 vs 330 ms, the manifest at 352 vs 604 ms, the covers at 819 vs 1056 ms and the Patch detail at 633 vs 988 ms, because the
  manifest, art and Patch feed start at boot instead of after mount.
- **Defect (fixed in RC2.1):** on fast, 4G and direct desktop loads the scene was complete at ~0.4–0.9 s, but the veil held to
  the cap. In the window between "complete" and the cap, headless Chromium drew the full desktop scene at ~10 fps (median frame
  83–117 ms, 0–1 frames under 50 ms), so "4 frames under 50 ms" never held. Phone (17 ms frames) and reduced motion revealed on
  `ready`. Any real device rendering this scene below 20 fps would wait the full cap on every visit, and holding cannot make it
  faster.
  - **RC2.1 rule:** a frame counts when it is under max(50 ms, 1.5× the recent median) and never over 250 ms. Every frame feeds
    the rhythm; only frames after the signals settle count. A 0.5–1.1 s first-use stall still restarts the count. Unit tests:
    slow-steady flows, a 300 ms stall on a slow device restarts, > 250 ms never counts, pre-settle frames only teach the
    rhythm. All fail on the old rule.
  - Expected effect (not yet measured): headless fast/4G lift ≈ complete + ~0.4–0.7 s (4 counted frames plus 3 frames of
    rhythm at ~100 ms). On real 60 fps GPUs it is unchanged (~67 ms after settle).
- **Phone lift 1.2 s after the harness saw it complete.** The gate waits for something the harness does not check: Lora (the
  speech bubble) or the DOM `decode()`s. RC2.1 writes `data-startup-pending` on the page root and the harness now logs it
  (`s0-harness` `fbb4a307`), so the next run names the signal.
- Slow 4G: the cap lifts at 1.6 s with covers pending. This is the expected bandwidth limit (B3: right-size the first-screen
  images).

**Orrery e2e on RC2.1 `14eea7d8`** (`academy-core-v35.spec.ts` + `academy-core.spec.ts`, bundled headless Chromium, 1 worker,
test-owned dev server; the specs' `open()` waits for the startup veil): **79 passed, 10 skipped (opt-in evidence), 0 failed,
8.9 min.** This includes the Landing → Core hand-off test, direct `/lol`, the `#academy-commons` redirect, Hall links,
phones, reduced motion, quality tiers, drag, selector, crystal and Lux iris. No tracked file was rewritten; no browser,
server or dev-server process was left running.

### Branch and exact diff

- **`academy-startup/rc2-readiness-veil`** at **`14eea7d8`** (RC2.1, on RC2 `97189c51`, on RC1 `84946017`; worktree
  `C:\Users\mlmit\mogzy-wt\acore-startup-rc2`). Base re-checked: `origin/main` is still `2151fcd6`, and no open PR touches these
  files (§RC1 list).
- 19 files, +1468 / −10 vs RC1 (RC2.1 on RC2: `readiness.ts`, its test and the gate, +73 / −24):

| File | Change |
|---|---|
| `src/lib/academy-startup/veil-store.ts` (new) | the hold/reveal state machine and caps |
| `src/lib/academy-startup/readiness.ts` (new) | the pure contract: signal statuses, verdict, `FrameFlow`, critical fonts |
| `src/lib/academy-startup/veil-gradient.ts` (new) | the Landing veil's gradient, ONE constant for both veils |
| `src/pages/academy-core/useAcademyStartupGate.ts` (new) | reads the contract from the real page each frame while held; reveals |
| `src/components/startup/AcademyVeil.tsx` + `academy-veil.css` (new) | the overlay above the router; direct-visit boot hold |
| `src/App.tsx` | `<AcademyVeil />` in `AppRouterRoot` (+5) |
| `src/pages/dev/mogzy-entry-v2/MogzyEntryV2.tsx` | `holdAcademyVeil("entrance")` just before `navigate("/lol")`; shared gradient |
| `src/pages/academy-core/AcademyCorePage.tsx` | the gate; `data-startup` on the root; arrival cue at the reveal |
| `src/components/Layout.tsx` | no 300 ms shell fade-in beneath a held veil (no double fade) |
| `src/components/lol/AcademyHubBook.tsx` | `data-cover="art|failed|none"` on the book body (+3) |
| `e2e/academy-core-v35.spec.ts`, `e2e/academy-core.spec.ts` | `open()` waits for the startup veil before coordinate clicks (+5) |
| tests | `readiness.test.ts`, `veil-store.test.ts`, `AcademyVeil.test.tsx` (new); `AcademyCorePage.test.tsx`, `MogzyEntryV2.autoEnter.test.tsx`, `Layout.startup-shell.test.tsx` (extended) |

### The readiness contract (what "ready" means)

Read from the **real page**, once per frame, only while the veil is held. Each signal is `ok | error | pending`. An error
**settles** its signal (the page already has a fallback), so it never holds the veil; it makes the reveal `degraded`. `pending`
holds the veil and becomes `timeout` at the cap. `academyCoreSettled()` is **not** used for this: it is an image-preload
promise, not a statement about the drawn page.

| Signal | ok = | error = | Notes |
|---|---|---|---|
| `stage` | `.o35-stage[data-ready]` (the engine started after measuring) and a non-zero rect | — | implies the route chunk and the shell gate (the page cannot mount without them) |
| `frame:<book>` | the book's frame `<img>` loaded **and** `decode()` resolved | load error / zero pixels | every on-screen book: all four on desktop; on phones the books whose slot intersects the viewport (measured once) |
| `cover:<book>` | the splash `<img>` loaded and decoded | the manifest failed or names no splash (bare leather), the image failed, or the book marked `data-cover="failed"` | a manifest still loading keeps covers `pending` (no bare-leather flash) |
| `mogzy` | the rest plate loaded and decoded | load error | |
| `patch` (desktop only) | feed not `loading`, and every on-screen `<img>` in the open book decoded | an image failed | below the fold on phones, so not required there |
| `font:*` | `document.fonts.check()` for Cinzel 500/700, Space Mono 400, Lora 400 and Inter 400 | every matching face errored | no face registered yet = pending; an unused registered face is requested |
| then `framesFlowing` | 4 consecutive unstalled frames after every signal settled: each under max(50 ms, 1.5× the recent median), never over 250 ms (RC2.1; RC2 used a flat 50 ms) | — | absorbs the GPU first-use stall and decode-on-first-draw; a stall restarts the count; a slow but steady device is not made to wait for the cap |

Fast entry: if everything is already decoded when the Orrery mounts, the reveal starts after those 4 frames (~67 ms at
60 Hz), then a 300 ms fade. That is the only addition. There is no minimum hold.

### State machine (`veil-store.ts`)

```
idle ──Landing navigate("/lol"): hold(entrance)──► held           cap 1.6 s from here
idle ──boot on /lol (no #hash): hold(direct)─────► held           safety cap 10 s (page never mounts)
held ──Orrery mounted──────────────────────────► held           direct: cap re-armed to 1.8 s after mount
held ──contract met──► revealing(ready | degraded) ──300 ms fade──► revealed   (reduced motion: revealed at once)
held ──cap─────────────► revealing(timeout, pending=[…]) ──fade──► revealed
held | revealing ──visitor leaves /lol, or the page unmounts──► idle (no fade; reason "cancelled")
```

- A second hold while one is up is a no-op. The unmount cancel is deferred one tick and is bound to that hold, so a StrictMode
  re-mount or a later journey is never cancelled by a stale cleanup.
- Reveal side effects: the arrival cue `hub.application.enter` plays at the reveal (an in-app visit with nothing held still
  plays it at mount). `hub_entered` and `landing_viewed` are unchanged. The chime/music rules are untouched.
- `data-startup` on `.o35-root`: `none` (nothing held) | `pending` | `ready` | `degraded` | `timeout`.
- `academy_revealed` (owner decision 6) is **not** added. It changes the curated analytics contract, so it needs its own
  reviewed change; `data-startup` carries the same facts for tests and the harness meanwhile.

### The veil (`AcademyVeil`, in `AppRouterRoot`, z-index 70 above the HUD)

- **Entrance:** the Landing veil's exact gradient (shared constant) over the Landing's navy, so the hand-over is
  pixel-identical. If the hold lasts past 0.3 s, it eases (300 ms) into a calm gold-on-navy glow that breathes over 2.6 s.
  Opacity and transform only: no blur, no filters.
- **Direct:** the flat `/lol` startup surface (`#060c14`, today's first paint), crossfaded into the Orrery. At boot it also
  starts the chunk, settings and the Orrery warm (manifest, art, Patch feed) before the route renders. This is Slice 6's
  `begin()`. The warm is imported on demand, so the entry chunk grows only by the veil itself.
- Never fully opaque (alpha 0.985), because a fully covered page is not rasterised until revealed (measured 100 ms hitch).
- Blocks pointer events while held; `aria-hidden`; the real page stays in the DOM and accessibility tree.
- Reduced motion (OS or the app's setting): no breath, no flash-to-glow ease, no reveal fade.
- `Layout` skips its own 300 ms fade-in when it first renders beneath a held veil: the veil's fade is the transition.

### Timeout and failure behaviour

| Case | Result |
|---|---|
| everything cached | reveal after ~4 frames, `ready` |
| art arrives after the entrance | veil holds (calm glow), lifts the frame after the last signal settles plus 4 frames |
| slow decode | waits for the real `decode()` |
| a cover / frame / Mogzy image fails | settles; reveal `degraded`; bare leather or no Mogzy (no broken-image icon) |
| manifest fails | covers settle as errors at once; the rest still has to be drawn |
| manifest or Patch feed stalls | covers / `patch` stay pending → **cap** (1.6 s / 1.8 s) → `timeout` reveal; the page is fully usable |
| fonts never arrive (blocked Google Fonts) | pending → cap; fallback faces |
| Orrery never mounts (stalled chunk or settings read) | entrance cap 1.6 s; direct safety net 10 s; the shell's flat surface shows beneath |
| Back / link / `#academy-commons` redirect during the hold | veil dropped at once |
| hidden tab | rAF paused; the cap (timer) still lifts it |

### Tests (RC2 `97189c51`)

- New: contract 9, store 14, veil 9, Orrery gate 17 (in-app visit unchanged, ready-before-navigation, completing-after-entrance, slow decode,
  failed image, failed manifest, manifest still loading + cap, timeout recovery with a working book click, desktop Patch hold,
  phone Patch not required, fonts loading, late-registered face, direct cap from mount, direct ready, rapid unmount, reduced
  motion, early Lux hover + keyboard focus while held), Landing 5 (hold exactly at navigate, early click, reduced motion,
  unmount before navigate, `/welcome` holds nothing), Layout 2.
- Mutation checks: the Layout and late-face tests fail on the code without their refinements; the failed-cover case found and
  fixed a real defect (a cover failing before the gate's first frame used to hold until the cap).
- Related suites (Academy core, startup, broadcast/lol, Landing, App router, Layout, hooks): **762/762**.
- Full chunked Vitest (`rc1/scripts/vt-chunks.sh`) on the RC2 tree before the two final refinements: **114 failing, RC1 115;
  zero failures exist only on RC2.** Academy core 152/152. After the refinements the affected suites were re-run (762/762), the
  full suite was not.
- `tsc`: the 2 baseline errors only. `eslint` on every changed file: clean. `vite build`: exit 0. Entry chunk +816 B brotli
  (137.1 → 137.9 kB), same 6 modulepreloads, CSS +1.5 kB raw, no Academy art or warm in the entry.
- Browser: the controlled run and the Orrery e2e are above (2026-10-19). After RC2.1, the contract, Academy core and
  startup suites were re-run: 229/229.

### Comparison against RC1

| | RC1 | RC2 |
|---|---|---|
| Landing → /lol hand-off | the Landing veil unmounts at `navigate()`; the shell fades in from 0 over 300 ms while the Orrery mounts | the veil continues at identical pixels and lifts only on real readiness (≤ 1.6 s) |
| GPU first-use stall, decode-on-draw | visible at mount | under the veil (the 4-frame flow rule) |
| 4G bare book frame for ~0.3 s (B1) | visible | under the veil |
| Direct /lol | flat → scene assembling (bare covers, Patch, Mogzy) | flat surface held until ready (≤ 1.8 s after mount), warm starts at boot |
| Arrival cue | at mount | at reveal |
| Slow 4G (~1.3 MB first screen) | assembles over ~8 s | the veil lifts at the cap with covers still pending: it cannot fix bandwidth (B3) |
| Interaction | immediate | blocked by the veil while held (≤ cap); immediate after; hover/focus engagement still unlocks Lux at once |

Expected timings from the RC1 headless medians (not measured on RC2): fast network and 4G, reveal ≈ 0.55–0.7 s after the
hand-off (RC1 complete 523/563 ms + flow frames); slow 4G, the 1.6 s cap; direct /lol fast, ≈ 1.3 s after navigation.

### Performance risks

- **Probe cost while held:** one rAF callback per frame, about 15 selector reads, and rects only until each signal settles
  (settled signals are never re-read). It is bounded by the cap and stops at the reveal. It is unmeasured on real devices.
- **Veil compositing:** two full-viewport gradient layers plus one breathing layer (`will-change`), only while held.
- **Reveal frame:** the 300 ms veil fade starts on a scene that has already drawn 4 short frames. The 17 ms post-lift result
  came from the harness prototype; RC2's own post-lift worst frame is unmeasured.
- **Caps on slow links** reveal an incomplete scene (bare leather) by design. Image right-sizing (B3) remains the fix.
- **Blocked fonts** turn every load into a cap-length hold.
- **jsdom limits:** image decode, fonts and frame timing are mocked in unit tests; only a browser run proves the contract
  against real paint.

### Remaining browser validation (each needs explicit authorisation per AGENTS.md)

1. Done: the first controlled run (30 loads), the Orrery e2e on RC2.1, and the RC2.1 re-measure (10 loads, all `ready`,
   complete at lift 10/10), and the RC2.2 re-measure (4 loads: phone lift 311 / 647 ms, Lora never pending).
2. **Real GPU (CI or owner):**
   - worst frame in the 1 s after the lift ≤ 34 ms;
   - the owner's recording approval of the calm glow (decision 2);
   - Firefox, Safari/iOS, a real phone.

---

## RC1. Release candidate: S1+S2+S3 on current `main` (2026-10-18)

**Verdict: CONDITIONAL GO for S1+S2+S3 as a release (not the final landing-as-preloader).** Local only: nothing pushed,
no PR, no merge, no deploy. Evidence: `academy-startup/rc1/` (tables, raw runs, scripts, failure lists).

### Branch and exact integration diff

- Branch **`academy-startup/rc1`** (local, unpushed), worktree `C:\Users\mlmit\mogzy-wt\acore-startup-rc`, on `origin/main`
  **`2151fcd6`** (60 commits newer than the slices' base `20d89fcf`; none touches a startup file, and no open PR — #4 #13 #44
  #45 #46 #49 #59 #68 #76 #79 — touches any RC file).
- `7757da7a` merge of `academy-startup/s123-integration` `74fd1b8d` — **clean, no conflicts**; the merge result equals S1+S2+S3.
- `6afc9b27` **Lux fix**: an engaged book's projection art and Mogzy's reactions skip the deferral.
- `eaa97a03` **settings-cache audit fix**: generation-safe invalidation, 30 s revalidation.
- `84946017` **settle cap fix**: the whole first-screen settle is capped (stalled manifest), and the warm resolves.
- RC diff vs `main`: 19 files, +895 / −64 (S1–S3: +637/−64; RC fixes: 6 files, +283/−25). S0 (the harness, scripts only) is
  deliberately **not** in the RC; measurements ran from `academy-startup/s0-harness`.
- Measurement-only sibling `academy-startup/rc1-charts-trial` `3001385a` (worktree `mogzy-wt/acore-startup-rcx`): RC1 +
  `'clsx'` in `vendor-react` + the QPC1 lazy-chart prototype. **Not for release.**
- Detached baseline worktree `mogzy-wt/acore-startup-main` at `2151fcd6`.

### Fixes made in this pass

1. **Delayed Lux portrait (real regression, fixed).** S3 gated the Lux portrait, the Pro Play 5 v 5 icons and Mogzy's
   reaction poses on `academyCoreSettled()` + idle. On slow 4G the covers settle ~8 s after the hand-off (cap 20 s), so
   hovering Leaguecraft opened the iris onto empty glass for that long. Now the first engagement of a book (hover,
   keyboard focus, press, arrows, crystal) shows that book's projection art at once, requests it at `high`, and wakes the
   reactions; unengaged art and the destination chunks still wait. Measured (slow 4G, hover 0.8 s after mount, n=2):
   main never showed Lux before the click (gated on `warmed`, ≥ 8 s); RC sets the portrait with the focus (+167/+187 ms) and
   requests the icon at +81/+107 ms. **The icon itself still lands +4.9 s later**: slow 4G is bandwidth-bound behind
   ~1.3 MB of first-screen art (see blocker B3). Hover→focus is +167–188 ms on both builds (unchanged).
2. **Settle never resolving on a stalled manifest (real S3 bug, fixed).** The 20 s cap applied per image, but the manifest
   request has no timeout; a hung request held destination chunks, poses, shards/roles and the phone Patch warm forever,
   and `warmAcademyCore()` never resolved. Now the settle is capped at 20 s overall, and the warm resolves one critical
   budget (4 s) after the critical set. Measured with the manifest request paused forever (n=1 each): RC interactive
   (`data-ready`), reactions ready and poses requested at 20.2 s, Quiz chunk at 20.4 s, no page errors; main: reactions
   `pending` for the whole 24 s window. Stalled **book-frame** image on RC: covers, Patch Report (26.20) and Lux in; deferred
   work at the 20 s cap; no errors.
3. **S1 settings cache (audit).** Findings and outcome:
   - `app_settings` RLS is `FOR SELECT USING (true)` (migration `20260222065043`), so the shared copy is identical for anon,
     guest and signed-in sessions: no identity leakage across sign-in/out.
   - **Bug fixed:** `invalidateAppSettings()` joined a read already in flight from before the admin save; its pre-save result
     then became the cache. Each invalidation now starts its own read (generation counter); superseded reads neither write
     the cache nor notify (so they cannot release a waiting consumer onto defaults).
   - **Freshness tightened:** background revalidation after **30 s** (was 5 min). Before S1 every consumer mount re-read
     `require_auth` and the policy; the cache only needs to cover the Landing → /lol hand-off.
   - **Fail-closed:** with no copy, a failed read still settles on `require_auth: true` and `DEFAULT_PLATFORM_POLICY`
     (`premium.globalAccess: false`). A failed *revalidation* keeps the session's last server copy (marked stale; the next
     mount retries) instead of dropping a settled screen to defaults — a deliberate deviation from "defaults per mount".
   - **Not fixed (pre-existing, blocker B2 for the preloader):** a *stalled* settings request has no deadline. postgrest-js
     retries network failures 3× (1/2/4 s) and a hung socket hangs `Layout` on its `StartupSurface`. Also: no cross-tab
     invalidation and no revalidation while a long-lived screen stays mounted (same as before S1).
   - 13 unit tests (4 of them fail on the S1 version).

### Tests (RC `84946017` vs main `2151fcd6`)

- Full Vitest suite, chunked identically on both trees (`rc1/scripts/vt-chunks.sh`, 4 workers per chunk): **main 116
  failing tests, RC 115; zero failures exist only on RC.** The one main-only failure is a timing test
  (`LobbyPreviewPage.premiumAnalytics` › "performance: one expanded Daily …"). Lists: `rc1/vitest-failures-*.txt`.
  Academy-core 136/136 (main 124/124), hooks 189/189 (176/176).
- New/changed: AcademyCorePage +3 (engagement), academyCoreWarm +3 (stalls), useAppSettings +5 and 1 changed; each new test
  was checked to fail on the pre-fix code. 4 warm tests had exact microtask-tick flushes adjusted (assertions unchanged).
- `tsc -p tsconfig.app.json`: 2 errors on both (the known baseline: `OnboardingProfile.tsx:180`, `identity/connections.ts:263`).
  `eslint` on every changed file: clean. `vite build` of main, RC and the chart trial: exit 0; tracked files untouched.
- Orrery e2e (`academy-core-v35.spec.ts` + `academy-core.spec.ts`, bundled headless Chromium, 1 worker): see below.

### Measured: headless load timings (authorised run 2026-10-18)

Bundled headless Chromium, cold profile per load, one browser at a time, builds served over HTTP/2 + TLS with mogzy.lol's
cache policy, real Railway/Supabase reads (writes stubbed in-page). 38 harness loads + 7 probe loads. Landing rows: ms after
the hand-off to /lol; direct: after navigation start. Medians (min–max). Headless renders in software: **frame columns are not
evidence**. Full tables: `rc1/headless-report.md`, `rc1/headless-fcp-charts.md`.

| | n | main complete | **RC complete** | RC+charts complete | main / RC startup surface | main / RC book frame |
|---|---|---|---|---|---|---|
| H1 fast | 3 | 1032 | **523** (−49 %) | 499 | 234 / **0** | at mount / at mount |
| H2 4G | 3 | 1731 | **563** (−67 %) | 556 | 266 / **0** | at mount (331) / **+494** (mount 211) |
| H3 slow 4G | 2 | never (9 s) | covers **8134**; never complete | covers 8042 | 475 / **0** | never / never |
| H4 direct /lol | 2 | 1256 | 1272 (≈) | 1292 | — | — |
| H5 phone-emu 4G | 2 | 581 | **439** | — | 276 / **0** | before nav |
| H6 reduced motion | 2 | 896 | **339** | — | 84 / **0** | at mount |

- S1 removes the startup-surface gap in every landing scenario; S2 takes the Patch Report off the critical path (Patch done at
  mount on fast networks); S3 moves the Quiz chunk after the reveal (fast: −1907 → +738 ms; 4G: −1185 → +1713).
- **Known 4G defect (B1; the attempted fix was measured and rejected, see below):** on 4G the book frame now completes **~0.2 s later in absolute time** than on main
  (frames +494 after hand-off vs at mount) — the S2 desktop Patch icons are warmed at `high` and compete with it. The scene
  still completes 1.2 s sooner overall, but the books show without their frame for ~0.3 s after mount.
- Direct `/lol` is unchanged (Slice 6 is not built). Mount 513 vs 423 ms there is within this n=2 noise range; not concluded.

### S1+S2+S3 vs S1+S2+S3 + clsx/lazy charts

| | RC | RC+charts |
|---|---|---|
| landing FCP slow 4G / 4G / fast | 3810 / 1020 / 348 | **3318** / 952 / 284 |
| hand-off (navLol) slow 4G | 5680 | **5267** |
| same-origin JS before hand-off | 486 kB | 385 kB |
| `vendor-charts` request | at FCP (entry modulepreload) | after the reveal (Pro Play `GoldChart` via the idle destination warm), 3.1 s fast / 4.2 s 4G; not within 9 s on slow 4G |
| /lol complete fast / 4G | 523 / 563 | 499 / 556 (noise) |
| slow-4G covers | 8134 | 8042 (noise) |

**Decision: do not add the charts to this RC.** With S3, Quiz is no longer prefetched during the Landing, so the lazy-chart
half removes nothing from the Academy's critical window: the /lol readiness numbers do not move. The measurable gain
(−0.5 s slow-4G landing FCP and hand-off) belongs to the **one-line clsx manualChunks fix**, which changes every page's
preload set — ship it as its own reviewed change with its own measurement (clsx alone vs RC), not folded into the Academy RC.
The lazy charts can follow with the `/quiz` lobby work if ever wanted (no Academy benefit demonstrated). n=2–3; the direct
/lol FCP ordering (main 688, RC 760, RC+charts 876) is unexplained at n=2 and should be re-checked with the clsx-only build.

### Viewports, routes, reduced motion, Orrery interactions

- Desktop 1366×768 (H1–H3), phone emulation 390×844 @3 (H5), reduced motion (H6), direct `/lol` (H4): all loaded with 0 page
  errors on RC; reduced motion reached complete at 339 ms after the hand-off.
- Orrery e2e on RC (dev server, stubbed manifest/Patch/Supabase; bundled headless Chromium, 1 worker): **79 passed, 10
  skipped (the opt-in evidence suite), 0 failed, 8.5 min.** Covers desktop composition and orbit, hover/crystal/selector
  interaction (11 selector tests), drag and focus choreography, quality tiers and pausing, reduced motion, phones (composed
  arrangement), Leaguecraft roles + concealed Lux (7), Pro Play 5 v 5, `/lol` as the home, and the V3 desktop/mobile
  navigation contracts (23). No tracked file was rewritten; no browser or server process was left behind.
- Not testable locally: real GPU frame smoothness (needs CI headed runs), Safari/iOS, real devices, Firefox (policy: no local
  Firefox windows).

### Remaining blockers before release approval

- **B1 (4G bare book frame for ~0.3 s): tried, measured, REJECTED — RC1 stays the candidate.** Local branch
  `academy-startup/rc1.1-patch-icons` `499ef8f1` (worktree `mogzy-wt/acore-startup-rc11`) holds the S2 desktop Patch icons
  until the critical set settles. Second authorised run (2026-10-18, 12 cold loads, bundled headless Chromium, one browser,
  RC1 vs RC1.1 served side by side; `rc1/headless-rc11-report.md`, `rc1/raw/harness-runs-rc11.tgz`), ms after the hand-off:

  | | n | book frame done | fonts ready (per run) | Patch done | complete |
  |---|---|---|---|---|---|
  | H1 fast RC1 / RC1.1 | 3 | at mount / at mount | — | at mount / at mount | 481 / 474 (same) |
  | H2 4G RC1 | 3 | **499** (326–514); network +444 | 626, 416, 514 | 431 | **514** (499–626) |
  | H2 4G RC1.1 | 3 | **182 = at mount**; network −27 | 628, 1057, 1748 | 1248 (795–1474) | **1474** (795–1748) |

  It fixes the frame but the twelve icons, now starting just as the Orrery mounts, compete with the display-font files
  (Cinzel/Space Mono/Inter) instead: fonts and the Patch Report arrive 0.4–1.1 s later and the scene completes ~1 s later.
  The contention moves; it does not go away. Not taken. The 0.3 s bare frame on 4G is the cheaper defect: the S5 veil hides
  it, and B3 (fewer first-screen bytes) is what removes it. If it must be fixed before S5, try warming only the icons the
  open book shows above its fold at `low` priority — measure before adopting.
- **B4 (owner):** visual check of the RC on a real browser/GPU (CI or the owner's own session) — no headed local runs here.
- **B5 (process):** CI run of the Orrery e2e + frontend suites on the pushed branch once the owner approves pushing.

### What the landing-as-preloader goal still needs (Slices 4–7 + gaps found here)

1. **S4 readiness record** — per-signal `ok|error|timeout` from the warm (frame, covers, Mogzy, Patch feed + icons, fonts,
   manifest) feeding `data-startup` and one shared source for the page's `warmed`.
2. **B2: the shell gate needs a deadline.** A real critical-readiness gate cannot sit behind `Layout`'s unbounded settings
   read: a hung `app_settings` request leaves the StartupSurface up indefinitely. Proposal (owner decision): `/lol` renders
   after a short settings deadline on the fail-closed defaults (it is not a `ProtectedRoute`), while `ProtectedRoute` keeps
   waiting for a real answer.
3. **S5 veil in `AppRouterRoot`** with the 1.6 s cap, the calm glow (owner recording), arrival cue at reveal, and the
   deferred work keyed to **reveal + idle** instead of the 20 s settle cap; `academy_revealed` contract entry.
4. **S6 direct `/lol`**: `begin()` at boot (manifest + chunk + Patch feed before React renders the route), 1.8 s cap.
5. **S7 pre-reveal lite** from the frame-flow judge (needs CI GPU evidence to validate).
6. **B3: slow 4G is bandwidth-bound.** No veil inside 1.6 s can reveal a complete scene there: the first screen is ~1.3 MB
   (338 kB book frame drawn ~170 px wide, 329 kB Patch book, four ~150 kB splashes). Right-sizing those images is the only
   fix, and it also shortens Lux-on-hover (+4.9 s today).
7. Patch brief depends on the manifest: with a hung manifest the book says "Receiving transmission…" forever (pre-existing);
   R7 must count a feed timeout as settled.

### Recommended final implementation sequence

1. Owner release approval of **RC1** (`academy-startup/rc1` `84946017`; RC1.1 measured and rejected) → push the branch, PR,
   CI (Orrery e2e + frontend suites), owner visual check on a real GPU.
2. clsx one-line fix as its own PR, measured clsx-only vs RC.
3. Image right-sizing (frame, Patch book, splashes) — measured on slow 4G.
4. S4 readiness record (no visual change) + B2 shell-gate deadline (owner decision first).
5. S5 veil + reveal-keyed deferral + `academy_revealed` (owner recording approval).
6. S6 direct `/lol`; 7. S7 pre-reveal lite with CI GPU evidence.

---

## IMPL-1. Implementation pass: Slices 0–3 (2026-10-18)

The owner approved Slices 0–3. Each slice is one branch cut from `main` `20d89fcf`; all five were later pushed as feature
branches (no PR); none is merged or deployed.
All five branches below also merge cleanly onto the newer `main` `1394b7ae`, whose new commits touch none of these files.

| Branch | Tip | What it does |
|---|---|---|
| `academy-startup/s0-harness` | `318dfd43` | `scripts/academy-startup/` (serve / probe / run / report, README). Local runs: bundled headless Chromium only, Edge and visible windows refused unless `CI`, teardown on signals, run-time cap (AGENTS.md). |
| `academy-startup/s1-settings-cache` | `9c6312d0` | `useAppSettings`: one shared read per session (5-min background revalidation; failures not cached; a rejected request no longer hangs the shell); the Landing prefetches it; three admin writers invalidate. |
| `academy-startup/s2-patch-prefetch` | `210b27f0` | `prefetchPatchBrief` fills the Patch Report's own query keys during the Landing (desktop at once, phones after the critical art); its icons are warmed. |
| `academy-startup/s3-prioritise` | `8f96125d` | `/lol` prefetches only its own chunk, requested immediately; the manifest starts at Landing mount; decorative loads wait for the real settle, not the 4 s budget; destination chunks, poses and projection icons load at idle after mount; favicon 244 kB → 1.3 kB (plus a 9 kB apple-touch icon). |
| `academy-startup/s123-integration` | `74fd1b8d` | S1+S2+S3 merged, conflicts resolved (on phones the Patch feed follows the real settle). Measurement only; not a release branch. |

**Tests.**
- New and updated unit tests pass in every slice.
- Integration branch: the Academy, landing, settings, Patch Report, Layout, ProtectedRoute and funnel suites, 303/303.
- `tsc`: only the 2 baseline errors. `eslint`: clean on every changed file.
- Pre-existing failures, identical on `main`: the 3 `App.*` tests and `AdminPlatformPolicies` "no file outside…" (Windows path separators).

**Measured: headless load timings.** See `academy-startup/slices-0-3-headless.md`.
- The run was authorised: bundled Chromium, one worker, 50 loads.
- Timings are in ms after the hand-off; medians.
- Frame smoothness is **not** measured here: headless renders in software.

| | fast: startup surface | fast: complete | 4G: complete | 4G: book frame done | slow 4G: covers | direct /lol: complete |
|---|---|---|---|---|---|---|
| main | 283 | 1191 | 1715 | +142 | not in 9 s | 1234 |
| S1 | **0** | 1000 | 1689 | +244 | not in 9 s | 1286 |
| S2 | 250 | **637** | 820 | +661 | not in 9 s | 1286 |
| S3 | 150 | 1213 | 1851 | **−131** (before hand-off) | 8043 | 1317 |
| S1+S2+S3 | **0** | **534** (−55 %) | **565** (−67 %) | +381 | 7979 | 1231 |

**Reading.**
- S1 removes the dark startup-surface gap.
- S2 removes the Patch Report from the critical path; this is the largest single win.
- S3 moves the Quiz/Combat code after the reveal (Quiz chunk ~1.0–2.2 s after the hand-off instead of ~1.7 s before it) and puts
  the art first on 4G.
- Combined, the visible scene completes ~0.5–0.65 s sooner on fast networks and 4G.

**Two findings from the measurement:**
1. **S2's high-priority Patch icons compete with the book frame on 4G** (frame done +661 with S2 alone, +381 combined, vs −131 with S3
   alone). Small follow-up: warm the brief icons at low priority, or after the first-screen art settles.
2. **Slow 4G is still bandwidth-bound.** In no build did the book frame arrive within 9 s. The first screen is ~1.3 MB of images:
   - the 338 kB book frame (1024×1536, drawn ~170 px wide);
   - the 329 kB Patch book;
   - four ~150 kB splashes.

   Re-prioritising cannot fix that; right-sizing those images can. A new follow-up, not in the approved plan.

Direct `/lol` is unchanged by Slices 1–3 (expected: that is Slice 6). The veil (Slices 4–5) and pre-reveal lite (Slice 7) are not
started.

**Process note.**
- `main` added `AGENTS.md` browser-safety rules (`c0fca8de`) during this pass. My earlier slice measurements used headed Edge,
  which breaks them; I stopped those runs and discarded them.
- I stopped only harness-owned processes (local servers and one Playwright Edge instance with a temporary profile).
- The investigation's original scratch scripts in `academy-startup/harness/` are marked `DO_NOT_RUN_LOCALLY`. The investigation's
  own headed-Edge numbers (§D) predate the policy.

---

## 0. Objective

The animated Academy entrance at `/` should act as the Academy's preloader. When it ends, the Orrery should be revealed
visually complete, stable and interactive: at once if it is ready, otherwise behind a short, bounded veil. An occasional extra
1–2 s is acceptable; a mandatory delay is not. Static replicas, skeletons and visibly incomplete scenes are rejected as defaults.
The approved Orrery look is untouched by everything below.

---

## A. Executive finding

The "unfinished / stuttering" arrival has **five independent causes**. Ranked by measured impact:

| # | Cause | Evidence | Impact |
|---|---|---|---|
| 1 | **Bandwidth contention: the critical art loses to non-critical downloads** on constrained networks | [M] 4G: the 338 kB book frame completes **0.80 s after navigation**, 0.56 s after the Orrery mounted (books visibly missing). Slow 4G: the frame, the four covers, the Patch Report book and even the landing's own Mogzy had **not finished 14.6 s after load**. [S/M] Competing traffic: the `/lol` prefetch of the Quiz and Combat Lab trees (194 requests, ~540 kB JS before mount on a cold load); after the 4 s image budget, Docs + Pro Play chunks, reaction poses and projection icons; **the 244 kB favicon downloaded 3× per journey at High priority**; landing art at Low priority. | Dominant on any network slower than ~10 Mbps |
| 2 | **The entrance veil is not held across the route change** | [S] The veil lives inside `MogzyEntryV2` and unmounts at `navigate()`. [S/M] `Layout` then shows a flat `StartupSurface` while it re-reads Supabase `app_settings` (150–220 ms here, ~480 ms on slow 4G), then fades the whole shell in from opacity 0 over 300 ms. Filmstrips: gold flash → **black for 0.2–0.9 s** → scene. | Every landing journey |
| 3 | **GPU first-use stall at mount** (shader/program creation and first raster) | [M] Fresh browser profile: one frame of **0.80–1.12 s** (Edge), 0.52–0.72 s (Chromium), ~0.48 s (Firefox), right as the scene fades in. Warm GPU process: 100–250 ms. Trace: the main thread is idle (one 69 ms React commit). The GPU process spends ~1 s in raster flushes and creates ~71 new shader programs. No single effect group removes it (Core effects ≈ 250 ms, environment ≈ 180 ms, lite ≈ 80 ms). | Every first arrival in a browser; smaller on returning browsers |
| 4 | **The Patch Report is a serial chain that starts only at mount** | [S] list → detail → 4 icons → 12 lazy icons, none warmed. [M] It is the **last first-screen element to arrive in every desktop run**: 0.69 s (warm), 0.96 s (warm GPU) and 1.45 s (fresh profile) after navigation on fast links (medians), 1.76 s on 4× CPU. The book shows "Receiving transmission…" in the meantime. | Every desktop arrival |
| 5 | **Weak devices run the full tier janky for many seconds** | [M] 4× CPU throttle: 38–48 fps full tier, **no step-down within 8 s**. Firefox: 37–46 fps full, no step-down within 12 s. A ≤ 2-core hint starts lite: 58 fps. The engine's safeguard needs ≥ ~6 s by design, and the eventual full→lite switch is itself a visible change. | Weak CPUs/GPUs, Firefox |

Secondary, measured:
- [M] Even with cached bytes, the four books appear ~200 ms after the rest of the scene (warm-GPU filmstrip, +400 ms vs +600 ms).
  [I] This is image decode on first draw: `prepareImage` decodes, then drops its element.
- [S/M] **Direct `/lol`** fetches the champion manifest only after the Orrery mounts. Books show bare leather for 0.65–0.9 s,
  and Mogzy and the Patch Report arrive later still.

**Proven, not hypothesis:** a translucent veil held until the readiness contract below is met hides causes 2–4 completely. The
harness-only prototype (§D) lifted 0.56–1.05 s after navigation on fast networks. After the lift, the worst frame was **17 ms**
(Edge, fresh profile and warm GPU, desktop and phone).
**Also proven:** a veil alone cannot rescue constrained networks (cause 1). Under slow 4G it ran into its cap with the books still
missing. Re-prioritising the loads is mandatory, not optional.

---

## B. Current startup timeline (landing journey)

Source path **[S]**, with timings from Edge headed, 1366×768, a fresh profile and no throttling (median of 5) **[M]**:

| t (ms) | What happens | Notes |
|---|---|---|
| 0 | `index.html`. The render-blocking Cinzel CSS loads; the entry modulepreloads `vendor-charts` (422 kB raw), supabase, motion, sonner, query and react | The entry statically imports one symbol from `vendor-charts` (`import{c as Jl}from"./vendor-charts…"`), so recharts sits on every page's critical path [S]. Out of Academy scope; follow-up. |
| ~250 | `MogzyEntryV2` lazy chunk; landing mounts (`autoEnter`) | `prefetchRoute("/lol")` is **idle-scheduled** (`requestIdleCallback`, 1.5 s timeout; `setTimeout(200)` without rIC). It queues AcademyCore + **CombatLab + Quiz** [S] |
| ~250 | `prepareImages([Mogzy 512, skyline], high, timeout = hold 1100)` → then `warmAcademyCore()` | The landing Mogzy `<img>` was already requested at **Low** priority [M] |
| 380–700 | Academy chunk (18.8 kB gz) + Quiz (95 kB gz) + CombatLab (54 kB gz) trees download; manifest | The Academy chunk finished by ~0.7 s in all but one fast-link run (1.66 s) [M] |
| 400–1100 | `warmAcademyCore`: frame + Mogzy + Patch book (high, 4 s budget); manifest → 4 covers (high); then poses, shards, roles and the `/quiz /combat-lab /lol/docs /lol/pro-play` chunks | The serial step is **manifest (~250 ms) → covers (~350 ms)** [M]. Evaluating the prefetched modules costs long frames during the landing (41–53 ms LoAFs: `LeagueDocsProData`, `ProPlayHub`) [M] |
| ~1.3 s, ~2.3 s | Favicon refetched (244 kB each time, High) | Also at load: 3× per journey [M] |
| ~1500 | Hold ends (`AUTO_HOLD_MS` 1100 after mount) → `data-entering`; chime/music rules unchanged | |
| ~2300 | `navigate("/lol", {replace})` at `ENTRY_DURATION_MS` 780; **the veil unmounts with the landing** | |
| +0 → +150…220 | `Layout` mounts. **Flat `StartupSurface`** until `useAppSettings` (uncached `useState` + Supabase GET) answers | [S] Not cached and not prefetched; re-read on every `Layout` mount |
| +170…250 | Orrery commit: 69 ms task, 58 ms of it forced layout (stage `getBoundingClientRect` in the engine's layout effect); engine starts; `hub_entered`; arrival sound cue | [M trace] |
| +250…1100 | **`Layout` fade (300 ms from opacity 0) freezes in a 0.8–1.1 s GPU stall** (fresh profile) | [M] |
| +200 | Patch list request → +350 detail → +600 four icons → +950 twelve lazy icons; Pro Play/Lux projection icons (11, invisible at rest) requested at mount alongside | [M] |
| +1447 | **Visually complete** (median; 1429–2613) | [M] |

**Unnecessary serialisation [S/M]:** Supabase settings after the veil; Patch list → detail → icons after mount; manifest →
covers (unavoidable, but it could start at landing mount rather than after the landing art); on direct `/lol`, chunk → mount →
manifest → covers.
**Resource contention [M]:** Quiz/CombatLab/Docs/ProPlay chunk trees, favicon ×3, poses/projection icons and audio tables, all
during the critical window.

### Verification of the previously reported findings

| Finding | Status |
|---|---|
| `AUTO_HOLD_MS = 1100`, `ENTRY_DURATION_MS = 780` (≈ 1.88 s) | **Correct** [S] (`MogzyEntryV2.tsx:99,110`). Reduced motion: 450 + 220 ms. |
| `/lol` prefetch includes Academy Core, Quiz and Combat Lab | **Correct** [S] (`route-prefetch.ts`, `PATH_TO_KEYS`). |
| Route prefetch can be idle-scheduled | **Correct**: always idle unless `intent` [S]. |
| Landing art is prepared before the Academy warm | **Correct**, bounded by the hold [S]. But the landing Mogzy is fetched at Low priority, and on slow 4G it had not loaded before the hand-off [M]. |
| `warmAcademyCore()` prepares frame, covers, Mogzy, Patch book and extras | **Correct** [S]. It does **not** warm the Patch feed, its icons or app settings. It also triggers the four destination route prefetches. |
| Critical images use a 4000 ms budget | **Correct** [S]. When the budget expires, low-priority work and route chunks start while critical images are still downloading [M]. |
| `prepareImage()` returns `ok` / `error` / `timeout` | **Correct** [S]. Joining callers never raise an in-flight request's priority [S]. |
| `warmAcademyCore()` can resolve without every resource succeeding | **Correct** [S]: it resolves with splash URLs whatever the image results were. |
| The engine initialises on mount regardless of artwork | **Correct** [S] (`AcademyCorePage` layout effect). |
| Some projections are gated by `warmed` | **Correct** [S]: projection art, shards, roles and Mogzy reactions. At rest the crystal shows the idle sweep (no art), so this gate is invisible at first paint [S]. |

---

## C. Critical readiness contract

"Visually complete" = what is **on the first screen** of the current layout, drawn, with frames flowing. Required signals:

| Signal | Required for | Success | Settled on failure (reveal proceeds, degraded) |
|---|---|---|---|
| R1 Academy route chunk evaluated | all | module loaded | chunk error → the existing `lazyWithRetry` recovery (reload once per 60 s); the cap still releases the veil |
| R2 Shell gate passed (auth + app settings) | all | cached during the landing, so 0 ms at mount | read error → defaults (today's behaviour) |
| R3 Orrery mounted, stage measured, engine started (`data-ready`) | all | layout effect ran | — |
| R4 Book frame decoded | all | `prepareImage` `ok` | `error`/`timeout` → books render without the frame (today's behaviour) |
| R5 Visible covers decoded | desktop: 4; phone: the on-screen books (all 4 at 390×844 [M]) | `ok` each | `error` → bare leather (`AcademyHubBook` `onError`); manifest `null` → bare leather |
| R6 Mogzy rest plate decoded | all | `ok` | `error` → no Mogzy (as today) |
| R7 Patch Report settled + book art + first-screen icons | **desktop only** (below the fold on phones [M]) | feed `ready` and icons `ok` | feed fallback (`INITIAL_BROADCAST_FEED`) counts as settled; icon `timeout`/`error` → icon slot as today |
| R8 Display faces | all | `document.fonts.load` Cinzel 500/700 (already used by the landing), Space Mono 400 | `timeout` → `font-display: swap` fallback |
| R9 **Frames flowing** | all | after R1–R8 settle: **6 consecutive frame intervals < 50 ms** (absorbs the GPU first-use stall and decode-on-draw) | the cap |

**Optional (never gate a reveal):** Mogzy reaction poses, projection art (Lux icon, the 5 v 5 icons, Rift art), shards and role
marks, off-screen covers, the phone Patch Report, destination route chunks, Daily status, HUD art, radio.

**Timeout:** a hard cap per journey; there is never an infinite veil. Decided by the owner (2026-10-18): **1.6 s after navigation**
for the landing journey (total ≤ ~3.5 s from the start of the entrance) and **1.8 s after mount** for direct `/lol`. Measured:
first screen complete except the Patch Report at 0.44–0.55 s (warm GPU) and 0.75–1.25 s (fresh profile); the prototype veil lifted at 0.56–1.05 s with the Patch chain included (fast networks) and at 1.47 s under 4× CPU.

**Success vs failure:** every signal resolves to `ok | error | timeout`. "Settled" includes `error`, so a failed image never holds
the veil. A `Promise.all` resolving is not treated as success: the per-signal results are kept, and they are what decide `degraded`.

**Pre-reveal quality decision (R9 side-product):** while veiled, take the median frame interval over the frames after R1–R8
settle (≥ 12 frames). If it is > 25 ms, the Orrery starts in **lite before it is revealed**. The engine's post-reveal step-down stays as
the safety net. [M] This would have chosen lite for Firefox (37–46 fps full) and 4× CPU (38–48 fps), and full for Edge/Chromium.

---

## D. Benchmark results

**Method.** `npm run build` of `67118b2b` (exit 0; `public/sitemap.xml` restored afterwards). The build is served by a local
HTTP/2 + TLS server that mirrors mogzy.lol's measured cache policy (curl, 2026-10-18): hashed `/assets/*` immutable, HTML
`no-cache`, other `/public` files ETag-only, brotli. Railway (manifest, splashes, Patch API) and Supabase are the **real production
hosts**. Analytics writes (Supabase POST/PATCH/RPC) were stubbed in-page so the production funnel was not polluted; reads pass
through. Playwright 1.64 drove **Edge (stable, headed)**, **Playwright Chromium (headed)** and **Playwright Firefox (headed)**.
An init script logged every `requestAnimationFrame`, resource timing (buffer 5000), long tasks, LoAF, element timing and paint,
and checked the readiness conditions on each frame. Edge/Chromium network and CPU throttling used CDP (4G = 9 Mbps / 85 ms;
slow 4G = 1.6 Mbps / 150 ms). One Edge performance trace was taken. Cache states:
- **fresh**: a new browser profile (empty HTTP cache and GPU caches);
- **warm GPU**: a new context in a browser that had already rendered the Orrery (empty HTTP cache, warm GPU process); the
  realistic "first visit by an established browser";
- **warm**: same context, second visit.

Hardware: Ryzen 7 7700X, 16 GB, RTX 4060 Ti, 60 Hz. ~170 measured page loads (warm-up visits not counted). Full table: `academy-startup/benchmarks.md`.

Landing journey, times after the client-side navigation to `/lol` (median, range):

| Scenario | n | mount | frames ready | visible covers | Patch done | VC w/o Patch | **VC** | worst frame (mount → +2.5 s) | steady fps | tier |
|---|---|---|---|---|---|---|---|---|---|---|
| Edge fresh 1366×768 | 5 | 229 | = mount | = mount | 1447 | 1246 | **1447** (1429–2613) | **834** (801–1118) | 60 | full |
| Edge warm GPU | 5 | 210 | = mount | = mount | 964 | 480 | **964** (827–1078) | 134 (100–250) | 60 | full |
| Edge warm | 5 | 200 | = mount | = mount | 693 | 510 | **693** | 134 (84–367) | 60 | full |
| Edge warm GPU, 4G | 3 | 238 | **796** | 496 | 1956 | 796 | **1956** | 67 | 60 | full |
| Edge warm GPU, slow 4G | 3 | 899 | **not in 8 s** | not in 8 s | not in 8 s | — | **never (8 s)** | 100 | 60 | full |
| Edge warm GPU, 4× CPU | 3 | 389 | = mount | = mount | 1757 | 722 | **1757** | 267 | **40** | full (no step-down in 8 s) |
| Edge warm GPU, 4× CPU, 2-core hint | 3 | 354 | = mount | = mount | 1538 | 638 | 1538 | 217 | 58 | lite |
| Edge warm GPU, 1366×768 @2× | 3 | 193 | = mount | = mount | 820 | 444 | 820 | 50 | 60 | full |
| Edge warm GPU, 1920×1080 | 3 | 168 | = mount | = mount | 763 | 479 | 763 | 117 | 60 | full |
| Edge warm GPU, reduced motion (hold 660 → nav 875 ms) | 3 | 174 | = mount | = mount | 747 | 454 | 747 | 50 | — | full |
| Edge phone-emu 390×844 @3 | 3 | 234 | = mount | = mount | (below fold) | 484 | **484** | 33 | 60 | full |
| Edge phone-emu, fresh | 2 | 166 | = mount | = mount | (below fold) | 824 | 824 | 509 | 60 | full |
| Edge phone-emu, slow 4G + 4× CPU | 3 | 770 | not in 8 s | not in 8 s | — | — | never (8 s) | 200 | 58 | full |
| Chromium fresh | 3 | 234 | = mount | = mount | 1134 | 968 | 1134 | 567 | 60 | full |
| Chromium warm GPU | 3 | 193 | = mount | = mount | 743 | 465 | 743 | 100 | 60 | full |
| Firefox fresh | 2 (+1 invalid) | 187 | = mount | = mount | 1030 | 804 | 1030 | 484 | **39** | full (no step-down in 12 s) |

Direct `/lol`, times from navigation start:

| Scenario | n | FCP | mount | visible covers | VC | worst frame |
|---|---|---|---|---|---|---|
| Edge fresh | 3 | 1284 | 453 | **1370** | 1554 | 601 |
| Edge warm GPU | 3 | 452 | 449 | **1100** | 1400 | 100 |
| Edge warm | 3 | 564 | 327 | 543 | 794 | 100 |
| Edge warm GPU, slow 4G | 3 | 4336 | 4868 | not in 8 s | never (8 s) | 33 |
| Edge phone-emu | 2 | 434 | 432 | 1090 | 1090 | 67 |
| Firefox fresh | 4 | 558–826 | 804–1070 | 1401–1772 | 1618–2322 | 467–517 |

**Veil prototype (harness-only overlay, not app code).** At navigation an overlay with the landing veil's gradient was added. It
was removed when the first-screen conditions held **and** 4 consecutive frames came in under 25 ms, or after 2 s:

| Scenario | n | lift after nav | reason | **worst frame after lift** |
|---|---|---|---|---|
| Edge fresh, translucent veil | 3 | 984 (954–1053) | ready | **17** |
| Edge fresh, **opaque** veil | 3 | 816 | ready | **100** (the occluded scene was not rasterised until revealed) |
| Edge warm GPU | 3 | 900 | ready | **17** |
| Edge 4× CPU | 3 | 1470 | ready | 34 (= its steady state) |
| Edge phone-emu | 3 | 558 | ready | **17** |
| Edge slow 4G | 3 | 2006 | **cap**: books still missing | 17 |
| Firefox fresh | 4 | ~2030 | **cap**: the 25 ms rule never holds at Firefox's ~40 fps | 50 (= steady state) |

That Firefox result is why R9 uses "< 50 ms" (frames flowing) and leaves the frame rate to the quality decision.

**Filmstrips** (`academy-startup/`, CDP screencast; capture adds slight overhead, so they are visual evidence only):
- `film-fresh-landing.jpg`: veil → black at +60 ms → faint frozen fade from +400 to +800 → scene with "Receiving
  transmission…" at +1000 → complete at +1500.
- `film-warmgpu-landing.jpg`: black from +60 to +250; at +400 the scene shows **without the books** (they appear at +600); Patch
  book loading.
- `film-slow4g-landing.jpg`: ghost books and no Patch Report up to +4 s.
- `film-direct-fresh.jpg`: dark to ~1.0 s, then the scene **without books, Patch Report or Mogzy** at 1.2 s, complete at 1.4 s.
- `film-phone-landing.jpg`: black from +150, faded at +300, complete at +500.

---

## E. Recommended architecture: Option B, a readiness-aware entrance hand-off with targeted early loading

### Options compared

| | A: earlier preparation only | **B: hold the veil until ready (+ A's loading fixes)** | C: coordinated scene init (pre-mounting / pausing / staged engine) |
|---|---|---|---|
| Visual result | Removes the late assets on good networks, but **the veil cut, black gap, frozen fade and GPU stall stay visible** (0.5–1.1 s fresh, 100–250 ms warm) | **Measured smooth reveal: worst frame 17 ms after lift** | No better than B's measured 17 ms; nothing left to fix |
| Loading cost | lower than today (deferral) | same as A | same or higher |
| Main-thread/GPU cost | unchanged | unchanged (the stall happens under the veil) | could lower GPU work under the veil, but the reveal is already smooth |
| Complexity | low | moderate: one small store + one overlay component | high: mounting the Orrery under the landing crosses the `Layout` boundary (`/` is outside `Layout`) |
| Regression risk | low | moderate, bounded by the cap | high (routing, Layout, analytics `hub_entered` timing, auth gate) |
| Direct `/lol` | partly fixed (warm at boot) | same mechanism, startup variant | complex |
| Failure behaviour | unchanged | explicit per-signal `ok/error/timeout` + cap | same as B |
| Reduced motion | unchanged | short hold, no fade | — |
| Testability | unit tests | unit (pure contract + state machine) + harness | hard |

**Choice: B, built on A's loading fixes.** A is necessary (only prioritisation helps 4G/slow 4G) but not sufficient (it cannot hide the
GPU stall or the veil cut). C is not justified: B's measured post-reveal worst frame is already one vsync.

### State machine (one module, `src/lib/academy-startup.ts`; a plain store, no React context)

```
idle ──landing mounts (autoEnter)──► preparing           begin(): chunk + settings + warm + Patch feed, all at once
idle ──app boots on /lol──────────► held(startup)        direct visit: flat startup surface held
preparing ──entrance navigate()───► held(entrance)       the app-level veil takes over at identical pixels
held ──Orrery mounted──────────────► settling            readiness signals collected (R1–R9)
settling ──contract met───────────► revealing ─fade─► revealed     quality decided first; then the arrival cue + deferred work
held|settling ──cap───────────────► revealing(reason=timeout, pending=[…])
held|settling ──route ≠ /lol / unmount / route error──► idle (veil dropped at once)
```

**Ownership.**
- `academy-startup` owns **when** things start and the readiness record.
- `route-prefetch` stays the only chunk prefetcher, and `prepareImage` the only image loader.
- `warmAcademyCore` stays the art warm, extended to return per-asset results.
- No duplicate infrastructure.

**The veil.**
- `AcademyVeil` is mounted in `AppRouterRoot` (beside `AcademyRadioController`, above the router outlet), so it survives the route
  change and sits above the HUD (`z-50`).
- The entrance calls `holdAcademyVeil()` just before `navigate()`. The app veil paints the same gradient as the entrance veil at its
  peak, so the hand-over is invisible.
- It **must not be fully opaque** ([M] an opaque veil defers raster to the reveal, a 100 ms hitch). Keep alpha < 1 (e.g. ≥ 0.97 at
  the edges).
- Pointer events are blocked while held.
- It fades out in ~300 ms (instantly under reduced motion).
- Owner decision (2026-10-18): a hold longer than ~300 ms settles from the bright flash into a calmer gold-on-navy glow with a slow
  breath (the prototype simply held the peak gradient); visual approval by recording before shipping.

**Cancellation.**
- The landing unmounting before `navigate()` means nothing is held (existing timer cleanup).
- Back or a link during the hold releases the veil at once (route listener).
- A route error, or a chunk recovery reload, is released by the cap. On reload the direct-visit path applies.

**Reveal side effects.** Moved to the reveal:
- the arrival cue `hub.application.enter` (today it plays at mount, which would precede the visual by up to the hold);
- the deferred work: the destination route chunks (Quiz, Combat Lab, Docs, Pro Play) at idle, poses, projection icons.

Not moved: `hub_entered` stays at mount, so the funnel contract is unchanged. A diagnostic `academy_revealed` (latency, reason,
pending signals) is optional and needs an analytics-contract entry (owner decision).

**Direct `/lol`.** At boot on `/lol`, `begin()` starts the chunk, manifest and Patch feed before React renders the route, which
breaks the chunk → mount → manifest → covers chain. The flat `StartupSurface` colour (already today's first paint) is held as the
veil until the contract or the 1.8 s cap. Content stays in the DOM under the overlay for crawlers.
[U] LCP/SEO effect of the overlay needs checking in the implementation slice.

**Reduced motion.** The same contract and cap; no fade on reveal. The landing hold is only 670 ms, so the veil is more likely to wait.
Note: the landing reads OS reduced motion only (`framer-motion`), while the Orrery also honours the app's own Reduce Motion
setting [S]; the `Layout` 300 ms fade ignores reduced motion entirely [S].

---

## F. Implementation plan: small, independently testable slices

Each slice is its own branch/PR from current `main`, measured with the harness before and after. Slices 1–3 deliver value
without the veil and can land first.

**Slice 0: harness in the repo (opt-in).**
- Files: `e2e/academy-startup.perf.spec.ts`, `e2e/support/academy-startup-probe.js`, a server script (from `academy-startup/harness/`).
- Purpose: repeatable before/after numbers per slice.
- Risk: none to runtime.
- Tests: the spec itself, opt-in via env.
- Acceptance: reproduces this report's Edge warm-GPU baseline within ±15 %.

**Slice 1: pre-resolve the shell gate.**
- Files: `src/hooks/useAppSettings.tsx` (one session-level promise + `prefetchAppSettings()`, invalidated when `AdminSettings`
  writes), `MogzyEntryV2.tsx` (one call at mount).
- Risk: settings staleness. Today they are re-read on each `Layout` mount, which is normally once per session. Admin edits must
  invalidate.
- Tests:
  - unit: a second consumer does not refetch; the landing prefetch makes `Layout` render with no `StartupSurface`;
  - `AdminSettings` save invalidates;
  - `ProtectedRoute`/policy tests unchanged.
- Checks: harness, StartupSurface-after-navigation = 0 ms.
- Acceptance: no black surface between veil and shell in the filmstrip.

**Slice 2: warm the Patch Report during the landing.**
- Files: `src/components/lol/broadcast/usePatchBriefFeed.ts` (export a `prefetchPatchBrief(queryClient)` using the same query
  keys), `src/pages/academy-core/academy-core-warm.ts` (desktop: after the critical set; phone: low priority after reveal), plus
  first-screen icons through `prepareImage`.
- Risk: extra requests on phones if mis-gated; stale-time interplay with `/lol/patch-reports`.
- Tests: warm test asserts the keys and ordering; the feed hook renders `ready` on its first render when the cache is warm.
- Acceptance: desktop VC without the Patch chain within ~50 ms of mount on fast networks.

**Slice 3: re-prioritise the critical window.**
- Files: `route-prefetch.ts` (`/lol` → `AcademyCore` only), `MogzyEntryV2.tsx` (Academy chunk requested **immediately**, not idle;
  manifest at mount), `academy-core-warm.ts` (destination chunks, poses, shards and roles only after `revealed`/idle; never on budget
  expiry), `AcademyCorePage.tsx` (projection icons after reveal), `academyCoreRoute.test.ts` (the `/lol` warm expectation changes
  deliberately).
- Separate owner item: replace the 244 kB favicon (`index.html`, `public/`) with a small icon.
- Risk: a click on Quiz/Combat right after reveal may wait for its chunk. Mitigated by the existing hover/focus `intent` prefetch and
  a post-reveal idle prefetch.
- Tests: route and warm tests; autoEnter tests (chunk requested during the hold).
- Checks: harness 4G and slow 4G. Acceptance: on 4G, frame + covers before navigation; on slow 4G, critical art strictly ahead of
  any non-critical JS in the waterfall.

**Slice 4: readiness record (no visual change).**
- Files: `academy-core-warm.ts` (return `{frame, covers[], mascot, patchBook, manifest}` results), new
  `src/pages/academy-core/orrery/academy-readiness.ts` (a pure `evaluateReadiness(signals, now, layout)` plus a frame-flow probe),
  `AcademyCorePage.tsx` (exposes `data-startup="pending|ready|degraded"`).
- Risk: none visible.
- Tests:
  - unit for required / optional / settled-on-error / timeout and phone vs desktop;
  - probe: synthetic stalls (an 800 ms frame), 60 fps, the Firefox 33/17 alternation.
- Acceptance: the attribute matches the harness's independent VC within one frame.

**Slice 5: the persistent veil and the hand-off (the visible change; needs owner visual approval).**
- Files: new `src/lib/academy-startup.ts`, new `src/components/startup/AcademyVeil.tsx`, `src/App.tsx` (`AppRouterRoot` only; open
  PRs #44/#49 touch other hunks), `MogzyEntryV2.tsx` (hold before `navigate`), `AcademyCorePage.tsx` (release, cue at reveal).
- Risk: an infinite or long veil (prevented by the cap); z-order with the HUD and toasts; route cancellation; StrictMode
  double-mount.
- Tests:
  - unit: store transitions, cap, Back during the hold, unmount, reduced motion, StrictMode;
  - autoEnter tests: veil held at navigate, music/chime unchanged;
  - e2e: the veil present until `data-startup` ≠ pending and never past the cap; Ctrl-click/Enter; the 240 ms activation and
    Lux/Pro Play interactions after reveal; Back during the hold.
- Checks: filmstrips (no frame without books, Patch or Mogzy after the lift); worst frame in the 1 s after lift ≤ 34 ms in Edge
  fresh and warm-GPU runs; phone; 4× CPU.
- Acceptance:
  - reveal median ≤ 1.0 s after navigation (fast network, fresh) and ≤ 0.6 s (warm GPU);
  - never more than the cap;
  - no visible full→lite switch on Firefox/4× CPU after Slice 7.

**Slice 6: direct `/lol`.**
- Files: boot hook (`src/main.tsx` or `App.tsx` root) calling `begin()` when the path is `/lol`; `AcademyVeil` startup variant
  (flat `LOL_BASE_BG`).
- Risk: SEO/LCP (verify); `/lol#academy-commons` redirect; the chunk-recovery reload.
- Tests:
  - e2e direct cold/warm, reload, the hash redirect, `/lol/hall` unaffected;
  - title/canonical/robots checks from P3 re-run.
- Acceptance: no bare-leather or missing-Patch frame in the direct filmstrip; reveal ≤ 1.8 s after mount on fast networks.

**Slice 7: pre-reveal quality choice.**
- Files: `OrreryEngine.ts` (export the rolling-median judge as a pure helper; behaviour unchanged), `academy-readiness.ts`,
  `AcademyCorePage.tsx` (`initialQuality` may become `lite` before reveal; `?quality=` still wins).
- Risk: false lite on a fast device with a startup hitch. Judge only frames after R1–R8 settle, and require ≥ 12 frames.
- Tests: unit with synthetic series (60 fps with an 800 ms startup hitch → full; 33/17 alternation → lite; steady 30 fps → lite;
  forced `?quality=full` → full).
- Checks: Firefox headed and Edge 4× CPU start lite (no switch after reveal); Edge/Chromium full.
- Acceptance: as stated.

Not in this plan (separate follow-ups): the entry chunk's static import from `vendor-charts` (landing FCP; slow 4G FCP 3.8 s) and
the Playwright Firefox harness flakiness.

---

## G. Open questions, blockers and limits

**Owner decisions (decided 2026-10-18):**
1. **Caps: landing 1.6 s after navigation; direct `/lol` 1.8 s after mount.**
2. **Veil look: settle to a calm glow.** The entrance flash peaks as today. If the Academy is not ready, the veil eases over ~300 ms
   into a dimmer gold-on-navy glow with a slow breath (one compositor-only opacity/transform animation, alpha < 1), then dissolves
   into the Orrery. A recording goes to the owner for visual approval before it ships (Slice 5).
3. **Direct `/lol`: hold the flat startup surface** until the readiness contract or the 1.8 s cap, then crossfade into the
   finished Orrery (Slice 6).
4. **Favicon: replace with small icons.** Same artwork as a 32/48 px favicon (~2–5 kB) plus a 180 px apple-touch icon; the
   og/twitter share images are unchanged. Folded into Slice 3. The real-world saving on established browser profiles is [U].

5. **Defer every destination prefetch until after the reveal.** The Quiz, Combat Lab, Archives and Pro Play chunk trees (and the
   poses and projection icons) load at idle after the reveal. Hover/focus `intent` prefetch is unchanged (Slice 3). Accepted cost:
   an un-hovered click in the first ~second after reveal may wait ~0.1–0.4 s on fast connections.
6. **Add `academy_revealed`, once per session.** It carries reveal latency, reason (`ready`/`timeout`), pending signal names and
   the tier (`full`/`lite`), and no personal data. It needs an analytics-contract entry plus tests (Slice 5; the tier field once
   Slice 7 lands). `hub_entered` is unchanged.
7. **Choose lite under the veil.** If the median frame interval over ≥ 12 frames after R1–R8 settle is > 25 ms, reveal in lite.
   `?quality=` still wins, and the engine's post-reveal step-down remains as the safety net (Slice 7).

**Not testable here [U]:**
- **Safari / iOS** (no Safari environment).
- **Real Android or iPhone devices**: the phone rows are Chromium device emulation on a desktop GPU, not device validation.
- **Low-end or integrated GPUs**: everything ran on an RTX 4060 Ti; "4× CPU" throttles only the CPU.
- **Google Chrome stable** (not installed; Edge and Playwright Chromium are the Chromium data).
- Production edge behaviour: Cloudflare h2/h3 and real geography. Here: a local h2 server for the bundle, with the real Railway and
  Supabase hosts.
- Real profiles' shader-cache and favicon-cache behaviour.
- LCP/SEO effect of a veil on direct `/lol`.

**Harness limits:**
- Firefox windows were background-throttled in 20 of 30 runs (rAF paused, even after `bringToFront`); those runs are excluded and counted as invalid. Their network timelines agree with the valid runs.
- Element timing did not report the books' images (likely their 3D-transformed subtree), so book paint time comes from filmstrips,
  not entries.
- Resource sizes for Railway are hidden (no `Timing-Allow-Origin`).
- Each scenario is n = 2–5: ranges are reported, not confidence intervals.

**Concurrent work (GitHub API, 2026-10-18):**
- `main` = `67118b2b`.
- Open PRs #59, #49, #46, #45, #44, #13, #4.
- Overlaps with the files this plan touches:
  - **#49** and **#44**: `src/App.tsx` (route additions in other hunks);
  - **#46**: `src/index.css` (Journey rules; this plan does not need `index.css`).
- No open PR touches the landing, warm, prefetch, `prepareImage`, `Layout`, `useAppSettings`, broadcast or Orrery files.
- Re-check before each slice; `main` moves often.

---

## Tests performed

- `npm run build` on `67118b2b`: exit 0 (`public/sitemap.xml` restored afterwards).
- No unit or e2e suites were run: there was no code change to verify.
- ~170 measured loads across the scenarios above, one Chromium performance trace (attribution in §A/B), five filmstrips.
- Re-run: `docs/handoffs/academy-startup/harness/`.
  - `server.cjs <dist> 4418` needs a self-signed `key.pem`/`cert.pem` beside it: `openssl req -x509 -newkey rsa:2048 -nodes …
    -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1`.
  - Then `WT=<worktree> node run.cjs '<scenario json>'` and `python -I table.py <runs-dir>`.

## Recommended next step

All seven owner decisions in §G are made (2026-10-18). Next: implement Slices 0–3, which carry no visual
change and fix the network-bound cases, and re-measure before starting the veil (Slice 5).
