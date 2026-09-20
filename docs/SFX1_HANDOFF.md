# SFX1 — Site-Wide Sound Effects Audit Handoff

Audit date: 2026-09-18. SFX1.1 was implemented on 2026-09-18; existing production SFX call sites and audible behavior remain unchanged.

## Objective and repository state

Build one restrained, semantic, fail-soft SFX authority for Mogzy without coupling it to music or revealing hidden Ranked information.

- SFX1.1 implementation base: frontend `ce82867628c02658eded2ab62668b3a057874dce` (`main`, equal to `origin/main` before this local implementation commit).
- Frontend was already dirty: `src/lib/pro-play/statsApi.ts`, `src/pages/pro-play/ProPlayPlayerProfile.tsx`, `.pnpm-store/`, and `src/assets/book-spine-flat.png`. None was touched by SFX1.1.
- Backend checkout: `8354e4139b9ef9ab2fa29b740b94a96b91db5f83` (`master`).
- Fetched backend production ref: `origin/master` = `f118f584c6bff940502b4b64e581106af5afeb05`; local checkout is 48 commits behind. Those 48 commits do not change the backend audio subtree, so the audio conclusion is current for production.

## Verified architecture map

| System | Files | Purpose | Settings authority | Playback | Active call sites | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Academy Radio | `src/lib/audio/academy-radio.ts`, `EntryMusicController.tsx`, controls/dock | Persistent radio/music | Music-specific localStorage keys | Persistent `HTMLAudioElement` | App root and music controls | Current; keep separate from SFX |
| Mode soundtrack | `src/lib/audio/engine.ts`, `mode-soundtrack.ts`, `useRankedAudioBoundary.ts` | Per-mode music, radio suppression | Music-specific localStorage keys + Audio Studio mode binding | Looping `HTMLAudioElement` | Ranked match boundary | Current; `mogzyAudio` coordinates only radio and mode music today |
| Audio Studio config | `audio-studio-config.ts`, `audio-studio-runtime.ts`, Supabase `audio_*` types | Assets, playlists, event and mode bindings | Supabase `audio_assets`, `audio_event_bindings`, `audio_mode_bindings`, playlists | Runtime resolves music assets/playlists only | Loaded by `EntryMusicController`; mode soundtrack consumes mode bindings | Partially consolidated: SFX event bindings are parsed but never resolved or played |
| Shared legacy SFX hooks | `useSoundSettings.tsx`, `Index.tsx`, `useSwipeSound.ts`, `useShopSound.ts`, `useAnimationSound.ts` | Entry, swipe/Elo, card animation, shop sounds | Supabase `app_settings.sound_settings`; visitor mute `mogsy-sounds-muted` | Separate Web Audio contexts; four bundled meme/card samples plus synthesis | Landing, Swipe/SwipePreset/Play, EloCheck, Shop, AdminDemo | Active but fragmented; migrate |
| Welcome tome | `pages/welcome/tomeAudio.ts` | Quill and page turn | Shared `sound_settings` + global SFX mute | Its own Web Audio synth/context | Academy welcome sequence | Active, well-gated, but separate engine |
| PLAY1 / Hub | `lib/audio/play-sfx.ts`, `usePlaySfx.ts` | Match-entry and Home Hub cues | Shared `sound_settings` + global SFX mute | One module Web Audio synth/context, per-cue replay guards | Leaguecraft/record/queue, Hub book landing/opening, signup CTA | Best existing SFX behavior; vocabulary is no longer PLAY-only |
| Main UI SFX | `lib/ui-sfx.ts`, `UiSfxSettings.tsx` | Generic app navigation/action samples | Independent `mogsy.uiSfx.v1` localStorage | A new `Audio` per event | HUD, identity menu, HexTrainingHero, Hub | Dormant by default but reachable; defaults off and `public/audio/sfx` has no assets |
| Quiz Broadcast SFX | `lib/quiz-broadcast/sfx.ts`, `BroadcastSfxLayer.tsx`, `SfxSettings.tsx` | Broadcast-only question/reveal/tick/transition audio | Broadcast session/config, default off; visitor mute is global | Canonical SFX asset renderer/context through a thin semantic adapter | Broadcast renderer | Converged in SFX1.7; no independent playback/unlock authority remains |
| Admin sound preview/upload | `AdminSounds.tsx`, `AdminCardAnimations.tsx` | Preview/upload operator assets | `custom_sound_urls`, animation `sound_url`, storage bucket | `Audio` for custom preview; otherwise direct engines/synth | Admin only | Misleading/partial: uploaded replacements are not consumed by product runtime |
| Backend audio library | backend `migrate_add_audio_tracks.py`, `sync_audio_assets.py`, `review_audio_assets.py`, `assets/audio/*` | Inventory, classify, hash/dedupe, review Riot audio files | SQLite `audio_tracks` + filesystem overrides/inventory | None | Startup migration and offline CLI tools only | Current asset catalog tooling; no playback API and no frontend settings authority |

`AutoVideo.tsx` calls `.play()` on video and is not an SFX system. The copied dev-only `useLaunchChime.ts` duplicates the landing chime intentionally for a prototype and is not a production authority.

## Current SFX inventory

All settings below default `true` unless stated otherwise. “Mute” means `mogsy-sounds-muted` is respected.

| Cue/event | Trigger surface | Actual renderer/asset | Setting | Mute | Duplicate/config risk |
| --- | --- | --- | --- | --- | --- |
| `launch_chime` | Root landing Enter/logo | Local Web Audio synth in `Index.tsx` | `launch_chime` | Yes | Duplicated in dev hook; navigation is delayed 250 ms for sound |
| `swipe_tap` | Swipe, SwipePreset, Play bubble action | `useSwipeSound` synth | `swipe_tap` | Yes | Multiple hook contexts |
| `correct_chime`, `wrong_tone` | EloCheck result | `useSwipeSound` synth | matching keys | Yes | None at current call site |
| `anim_paper_rip` | `slice` animation | `/sounds/card-rip.mp3` decoded to Web Audio buffer | `anim_paper_rip` | Yes | Admin custom URL ignored at runtime |
| `anim_shatter`, `anim_burn`, `anim_vaporize`, `anim_crush` | Swipe/SwipePreset/AdminDemo animation | `useAnimationSound` synth | matching keys | Yes | Admin custom URL ignored at runtime |
| `chop`, `mogged`, `doakes`, `amongus` | Matching card animations | Bundled files in `public/sounds` | None | **No** | Bypass global mute and AdminSounds |
| `shop_purchase`, `shop_diamond_tap`, `shop_powerup` | Shop success/checkout/power-up | `useShopSound` synth | matching keys | Yes | Separate context per hook instance |
| `welcome_scribble`, `welcome_page_turn` | Welcome writing/page transition | `tomeAudioEngine` synth | matching keys | Yes | No custom runtime replacement |
| `scrollOpen` | Choose Mode record opens after committed action | PLAY synth | `play_scroll_open` | Yes | Correctly silent on passive restore |
| `scrollClose` | Safe record dismissal | PLAY synth | `play_scroll_close` | Yes | Specialized cue correctly replaces generic press |
| `roleStep` | Record arrows and Ranked class carousel changes | PLAY synth | `play_role_step` | Yes | 40 ms same-cue guard |
| `mascotReact` | Record mascot poke | PLAY synth | `play_mascot_react` | Yes | None |
| `modeConfirm` | Practice/Daily/Invite/Ranked choice | PLAY synth | `play_mode_confirm` | Yes | One cue per action is tested |
| `queueStart` | Authoritative `joining -> waiting` | PLAY synth | `play_queue_start` | Yes | Recovery is correctly silent |
| `opponentFound` | First transition into `pairing` or `matched` | PLAY synth | `play_opponent_found` | Yes | Ref prevents `pairing -> matched` double ring |
| `error` | Visible role/join/availability refusal | PLAY synth | `play_error` | Yes | Retries/background churn intentionally silent |
| `buttonPress` | Neutral record/queue/invite/signup controls | PLAY synth | `play_button_press` | Yes | Explicit fallback only; no global listener |
| `bookLand` | Four scheduled Hub book impacts | PLAY synth | `play_book_land` | Yes | Silent on cold load/autoplay and reduced motion |
| `bookRuffle` | Hub destination activation | PLAY synth | `play_book_ruffle` | Yes | Same click also requests legacy `sectionOpen` |
| `appEnter` | Hub mount after prior gesture | Configured sample via `ui-sfx` | local UI config, default off/empty | **No** | Effect can replay on remount; dormant by default |
| `navClick` | Global HUD and identity menu navigation/sign-out | Configured sample via `ui-sfx` | local UI config, default off/empty | **No** | Not governed by admin settings |
| `sectionOpen` | Hub destination activation | Configured sample via `ui-sfx` | local UI config, default off/empty | **No** | Stacks with `bookRuffle` when configured |
| `primaryAction` | Signup chip and HexTrainingHero CTA | Configured sample via `ui-sfx` | local UI config, default off/empty | **No** | Independent user-only policy |
| Broadcast `questionStart`, `countdownTick`, `reveal`, `correctAnswer`, `transition` | Broadcast phase/timers | Broadcast-configured samples through canonical asset decode/cache/playback | Broadcast config, default off/empty | Yes | Reveal phase emits exactly one cue: configured `correctAnswer` wins, otherwise configured `reveal` is the compatibility fallback |

UI `success` and UI `error` remain reserved with no call sites. The dead `bubble_tap` setting/preview was removed in SFX1.7; an old `custom_sound_urls.bubble_tap` value remains preserved as unmapped migration data rather than being deleted. Broadcast bundles `reveal.mp3`; other Broadcast slots remain operator-configured.

## Legacy, dead, duplicate, and control findings

- `ui-sfx` is not dead because Settings exposes it and call sites exist, but it is dormant for a default visitor. It has a second master switch/volume/event map, no bundled assets, and ignores the global SFX mute (`ui-sfx.ts:49-64,185-194`; `Settings.tsx:262-263`). Remove it after migrating its few call sites.
- The Hub destination calls both `bookRuffle` and `sectionOpen` (`LolHub.tsx:620-630`). Only `bookRuffle` plays by default, but a locally configured UI SFX user gets two sounds.
- Audio Studio loads and validates `audio_event_bindings` (`audio-studio-config.ts:44-57,167-187,211-227`), but no production code consumes `eventBindings`. This is the clearest unfinished consolidation seam.
- `custom_sound_urls` is read, written, and previewed only by `AdminSounds` (`AdminSounds.tsx:128-203`). `useSoundSettings` fetches only `sound_settings`; every runtime renderer ignores custom URLs. Therefore an uploaded PLAY1/WebAudio replacement is **admin-preview-only** and players continue to hear synthesis.
- `AdminSounds` omits `Academy Hub` from `GROUPS` (`AdminSounds.tsx:20`), so `play_book_land` and `play_book_ruffle` exist in settings/defaults but have no rendered admin controls.
- The former `bubble_tap` admin/config residue had no runtime call and is removed in SFX1.7; unknown legacy URL data remains preserved by migration. UI `success`/`error` are reserved but unused.
- `useAnimationSound` gates five effects but not `chop`, `mogged`, `doakes`, or `amongus` (`useAnimationSound.ts:173-296`). Those four sounds ignore global mute.
- `AdminCardAnimations.sound_url` is used by admin previews, not by `useAnimationSound`; card product playback remains hard-coded by animation id.
- `useSoundSettings` renders with enabled defaults before the Supabase fetch completes (`useSoundSettings.tsx:139-147`), so a fast first interaction can sound a cue an admin disabled. Admin save invalidates the singleton but does not publish a settings-change event to already-mounted consumers (`AdminSounds.tsx:153-167`).
- The visitor has a global SFX mute only; there is no canonical SFX master volume. The separate `UiSfxSettings` volume controls only legacy UI samples. Music has intentionally separate controls.
- Existing contexts are fragmented and most older hooks do not explicitly resume a suspended context. PLAY/tome call `resume()` asynchronously but return silence while it is still suspended, so the first cue may be dropped; this is fail-soft but not a complete iOS lifecycle strategy.
- Stale comments say PLAY has eight cues, while the closed set now has eleven (`play-sfx.ts:65-90`).

## Ranked coverage through SFX1.5

Already covered:

- Match entry: record open/close, role movement, mascot reaction, mode confirmation, neutral controls, visible entry errors.
- Queue: server-accepted queue start; opponent found once; passive recovery and retry churn are silent.
- Ranked match music: `useRankedAudioBoundary` acquires/release the `ranked` mode soundtrack.
- Live match: playable module start, accepted local answer lock, authoritative own correct/incorrect, neutral public opponent submission/progress, Meta Reflex accepted actions and owner-only card results, public base award and speed accent.
- Results: authoritative victory, defeat, and draw after observed live play; completed-match load/reload is silent. Forfeit/no-contest follows the authoritative result rather than a separate client inference.
- Deliberately silent: hydration/reconnect/history, duplicate polls/renders, failed/stale commands, timeout/unanswered verdicts, zero awards, opponent correctness/speed/points, raw score mutation, generic settlement, and separate Meta completion.

## Decision: one canonical target architecture

Extend the existing `mogzyAudio` platform with an SFX controller and replace `usePlaySfx` with a site-wide `useSfx`. Do not make the PLAY-named module the long-term public API, and do not fold SFX into music policy.

```text
React handlers / authoritative game-transition effects / non-React callers
                              |
                    useSfx().play(event, meta)
                    mogzyAudio.playSfx(event, meta)
                              |
              canonical SFX controller + cue registry
         settings/mute -> dedupe -> binding -> renderer -> silence on error
                              |
          +-------------------+-------------------+
          |                                       |
  shared Web Audio synth/buffer renderer    Audio Studio asset binding
                                                  |
                                     Supabase audio_assets/event_bindings

Academy Radio and Mode Soundtrack remain separate music controllers.
```

Canonical details:

- API: semantic `SfxEvent` union plus `useSfx(): { play(event, { eventId? }) }`; stable callback. `mogzyAudio.playSfx` is the non-React entry point. Calls never throw and never block navigation/gameplay.
- Registry: one row per reusable semantic event with default synth generator/asset, normalized gain, group, replay interval, optional hover policy, and legacy setting aliases during migration. Call sites never pass filenames, gains, or frequencies.
- Settings: Audio Studio `audio_event_bindings` becomes operator source/enable/gain/asset authority. Keep `sound_settings` only as a compatibility adapter until all existing keys migrate. Keep `mogsy-sounds-muted` as the visitor SFX switch; rename the UI to “Mute sound effects.” Do not add a user SFX volume in SFX1; normalized mix plus mute is the minimum useful control.
- Rendering: one lazily created/unlocked Web Audio context. Existing synth functions become registered generators. Asset bindings resolve through `audio_assets`, fetch/decode once, cache buffers, and play through the same gain path. A valid explicit custom binding replaces the synth; never play both. A missing binding may use the built-in renderer, while an explicit invalid, unavailable, or failed binding remains silent so operator intent is predictable.
- Bootstrap/config: load the SFX snapshot once at app root alongside Audio Studio. Cache last-known operator config locally; until it resolves, prefer silence over violating an operator-disabled cue. Publish changes to mounted consumers after admin save.
- Dedupe: retain per-cue minimum intervals. For server events, callers also pass stable authoritative ids (round, settlement, card, terminal result); keep a bounded seen-id set. Initial hydration/reconnect establishes a baseline and does not emit.
- Generic versus specialized: no document-wide click listener. Explicit handlers request generic `controlPress` only when no more specific event applies.
- Hover: only authored controls, only `(hover: hover) and (pointer: fine)`, once on true entry/focus, never on touch-generated hover, and with a registry cooldown. Start with Hub destination books only after activation/transition coverage is stable.
- Ranked: local interaction cues come from accepted local actions; correctness cues come only from public own reveal/settlement fields. `opponentAction` may react to published opponent progress/finished transitions but carries no correct/wrong variation. Never infer from timing, score deltas, answers, or hidden payloads.
- Accessibility: reduced motion does not globally mute SFX. Suppress a cue only when it represents an animation that reduced motion removed (as Hub landing already does). Music mute/volume remain independent.
- Broadcast: retain broadcast session configuration and unlock UI, but later route file playback through the shared low-level renderer. Do not merge broadcast operator/session policy into visitor SFX settings.

## Phased implementation plan

### SFX1.1 — canonical foundation, no call-site behavior change — COMPLETE

- Goal: add SFX controller registration to `mogzyAudio`, a site-wide semantic registry/API, one shared context/unlock lifecycle, settings snapshot, asset-or-synth resolution, dedupe, and tests.
- Likely files: `src/lib/audio/engine.ts`, `types.ts`, new `sfx.ts`/`sfx-registry.ts`, `audio-studio-runtime.ts`, app-root audio controller, focused tests.
- Behavior: existing calls remain untouched; new authority is dark until adapters are connected.
- Tests: registry exhaustiveness; settings/mute; stable hook; asset wins over synth; failure fallback; first-gesture/resume/visibility; event-id and interval dedupe; never throws.
- Browser QA: iOS Safari, mobile Chrome, desktop Safari/Chrome; first tap, background/foreground, route change.
- Dependency: use existing Supabase audio tables; no backend service work.
- Must not change: music state, cue sound design, gameplay timing, routes.

### SFX1.2 — migrate existing shared-settings SFX without audible changes — COMPLETE

- Goal: register and route landing, swipe/Elo, card, shop, tome, and all PLAY/Hub cues through the canonical authority; retain old hook signatures as thin adapters first.
- Likely files: current SFX hooks/engines, `Index.tsx`, tome files, PLAY files, their tests.
- Behavior: same triggers/renderers/gains; global mute now covers the four meme cues; remove navigation's 250 ms audio delay after product confirmation because audio must not gate navigation.
- Tests: parity for every legacy cue, setting aliases, no double cue, no passive replay.
- Browser QA: landing, Swipe animations, Shop, welcome, record/queue, Hub.
- Dependency: SFX1.1.
- Must not change: animation/game outcomes, queue transitions, welcome cadence.

### SFX1.3 — retire generic UI duplication and repair controls — COMPLETE

- Goal: migrate HUD/identity/HexTrainingHero/Hub calls, remove `ui-sfx` and `UiSfxSettings`, remove Hub double request, replace `custom_sound_urls` with Audio Studio event bindings, expose Hub rows in admin until the new editor lands.
- Likely files: `ui-sfx.ts`, `UiSfxSettings.tsx`, `Settings.tsx`, `AdminSounds.tsx`, HUD, Hub, HexTrainingHero, Audio Studio admin/schema paths.
- Behavior: one visitor SFX toggle; uploaded replacement affects runtime; no default sound explosion.
- Tests: admin upload/bind -> runtime asset; settings propagation; global mute; Hub one activation/one cue.
- Browser QA: cross-tab admin change, slow config load, missing asset, Hub pointer/keyboard/touch.
- Dependency: SFX1.2.
- Must not change: music controls or Hub navigation timing.

### SFX1.4 — Home Hub and Leaguecraft semantic coverage — COMPLETE

- Goal: bounded desktop book hover/focus plus deliberate Leaguecraft select/start/answer/result cues.
- Likely files: Hub book components, Leaguecraft quiz components, registry/tests.
- Behavior: mobile activation only; no global hover; specialized cues suppress generic cues.
- Tests: fine-pointer gate, keyboard focus parity, rapid movement, answer state transitions.
- Browser QA: mouse, keyboard, touchscreen, reduced motion.
- Dependency: SFX1.3.
- Must not change: selection, submission, or routing logic.

### SFX1.5 — live Ranked and results — COMPLETE

- Goal: add round/module, local lock, own reveal, public opponent action, Meta Reflex, award/bonus, settlement, and terminal cues.
- Likely files: `QuizRankedMatch.tsx`, `useRankedMatch.ts`, safe projection helpers, Ranked tests, registry.
- Behavior: sound only on post-baseline authoritative transitions; no opponent correctness channel.
- Tests: initial hydration/reconnect silent; StrictMode/poll dedupe; opponent finished emits neutral cue only; own reveal; settlement id; victory/defeat/draw exactly once; forfeit/no-contest policy.
- Browser QA: two-client human match, bot match, refresh/reconnect, hidden tab, Meta Reflex rapid cards.
- Dependency: SFX1.1-1.3; server fields already expose the safe public boundaries.
- Must not change: server authority, timers, answer submission, hidden information, match music.

### SFX1.6 — remaining major surfaces — COMPLETE

- Goal: audit and add only high-value confirmations/errors to Combat Simulation, Archives/Wiki, Pro Play, auth/account, shell.
- Likely files: surface-specific handlers plus registry/tests.
- Behavior: restrained shared vocabulary, few specialized cues.
- Tests/QA: one action/one cue, failures never block, mobile/keyboard parity.
- Dependency: stable canonical system and Ranked mix.
- Must not change: data fetching or navigation behavior.

### SFX1.7 — broadcast renderer convergence and cleanup — COMPLETE

- Goal: let Broadcast use the canonical low-level asset renderer/unlock while retaining broadcast-local session settings; delete obsolete adapters/keys/comments and dead `bubble_tap` only after migration data is handled.
- Tests: broadcast phase/tick dedupe, explicitly decide whether reveal and correct-answer are one cue or two; long-running bounded state.
- Browser QA: broadcast autoplay unblock and 24/7 transitions.
- Dependency: all product SFX migrations.
- Must not change: broadcast engine timing/session persistence.

### SFX1.8 — final QA and mix certification — COMPLETE (technical scope)

- Goal: whole-site sound matrix, volume hierarchy, missing asset/offline behavior, route lifecycle, accessibility and device certification.
- Tests: full relevant unit/integration suite plus targeted Playwright coverage; production-config smoke test.
- Browser QA: desktop Chrome/Safari/Firefox, iOS Safari, Android Chrome; speakers/headphones; muted/unmuted; radio and mode music overlap.
- Must not add cues merely to fill coverage.

## Risks to hold explicitly

- Double-triggering from legacy + canonical paths, bubbling, or generic/specialized overlap.
- StrictMode/effect replay and stale effects after config resolution.
- Server polling/reconnect sounding historical state; use baseline plus authoritative ids.
- Ranked opponent correctness leakage; sonify only published progress/finished.
- iOS context unlock/resume after visibility changes; first cue may otherwise disappear.
- Asset decode/config latency and stale Supabase snapshots; never play asset and synth together.
- Global mute drift across contexts/tabs and currently ungated animation samples.
- Route unmount timers and old voices; keep short cues, clear scheduled triggers, never delay navigation.
- SFX/music masking; mix at the shared SFX bus while leaving music controls independent.
- Hover fatigue and touch hover emulation; authored fine-pointer entry only.

## Tests run

- Focused frontend run: 17 files, 518 tests — **517 passed, 1 failed**. All audio engine/studio/radio/tome/settings suites passed. The deterministic existing failure is `src/pages/Quiz.rankedRole.test.tsx` → “commits NOTHING for Practice after a role change”; it fails alone because the test reaches “No questions available” and cannot find `ranked-class-role-emblem`. Numerous existing React `act(...)` warnings were emitted.
- Backend: attempted `pytest test_sync_audio_assets.py test_review_audio_assets.py -q`; test collection could not start because the available Python runtime has no `pytest` module. No backend code changed. Static trace confirms catalog-only behavior and no route/playback API.

## Exact next task

SFX1 is technically complete. No implementation phase follows SFX1.8. Before treating the acoustic/device matrix as certified, an owner with the required hardware should listen on speakers and headphones in desktop Chrome/Safari/Firefox, iOS Safari, and Android Chrome and record any device-specific defects as a new scoped follow-up rather than extending SFX1 without evidence.

## SFX1.1 implementation state

SFX1.1 adds a dark canonical runtime without moving any production cue request.

- `src/lib/audio/sfx-registry.ts` is the single semantic registry. It defines the event type from the registry keys, per-event group/gain/replay spacing, optional built-in generator, and the complete PLAY1-to-semantic migration map. The initial semantic set is `ui.button.press`, `ui.feedback.error`, `hub.book.land`, `hub.book.open`, and the seven existing Ranked record/queue events. Only a soft tick and soft confirmation renderer are included to prove the generator model; the remaining proven renderers stay in their legacy modules until SFX1.2.
- `src/lib/audio/sfx.ts` owns the SPA/HMR-safe singleton, lazy `AudioContext`, master gain, gesture unlock/resume, reactive visitor mute, Audio Studio observation, event resolution, bounded decoded-buffer cache, per-event cadence, bounded event-id dedupe, snapshots/subscriptions, and fail-soft rendering. Its gain path is source/renderer -> event gain -> SFX master gain -> destination.
- `src/lib/audio/useSfx.ts` exposes a stable command-only React API and a separate opt-in snapshot hook. `src/lib/audio/types.ts` defines the minimal controller/options/snapshot contract. `src/lib/audio/engine.ts` exposes registration, lookup, and the non-React `mogzyAudio.playSfx` command. `EntryMusicController.tsx` registers the dark runtime at the existing root audio bootstrap; it does not invoke a cue.
- Both APIs reach the same registered controller. No component receives the context, renderer, filename, gain, or Ranked state. Future callers provide only a semantic event and optional stable `eventId`.
- Binding precedence is: a present Audio Studio binding is authoritative; an enabled valid asset or synthesized binding plays, a disabled/legacy/malformed/unavailable explicit binding is silent, and only an absent binding may use the registry built-in. Failed fetch/decode stays silent instead of unexpectedly changing to a different sound. Unknown events and renderer failures are also silent.
- The controller begins with configuration not ready, so it cannot emit an accidental default-enabled cue before Audio Studio resolves. `available` and last-known `stale` snapshots are playable; other states are silent. Live Audio Studio publications update the controller without changing the hook command identity. Migration of `app_settings.sound_settings` and its admin propagation remains intentionally deferred to the SFX1.2 compatibility adapter/SFX1.3 control cleanup.
- `mogsy-sounds-muted` remains the only visitor SFX mute. The controller observes both the same-tab `mogsy-sounds-muted-changed` event and cross-tab `storage` changes and updates only the SFX master gain. Academy Radio and Mode Soundtrack controllers are untouched.
- Replay spacing is stored per semantic event, never globally. Optional authoritative `eventId` values use a 512-entry bounded insertion-order set and are accepted only after policy resolution and a running context, so a blocked first attempt does not consume the id. The asset cache is bounded to 24 stable asset/source entries. An asset decoded against stale configuration is not emitted after the configuration changes.
- `src/lib/audio/sfx.test.tsx` contains 18 focused tests covering registration, shared React/non-React routing, stable hook identity, registry lookup, config timing, reactive mute/music isolation, asset and synthesized precedence, explicit disable, asset caching, event-id and per-event cadence, missing/refused/resumed contexts, fetch/decode/binding failures, and renderer exceptions.
- Focused regression result: 14 files, 241 tests, all passing. This covers SFX plus directly affected Audio Studio, engine, radio, mode soundtrack, settings, PLAY1, and tome suites. Focused lint has no errors (two pre-existing React Refresh warnings in `EntryMusicController.tsx`). The full app typecheck still reports unrelated baseline errors; it reports no errors in the SFX1.1 files.
- No backend or Supabase schema changed. No existing SFX call site was migrated. The existing PLAY1, Hub, landing, swipe/Elo, card, shop, tome, UI, and Broadcast paths still render exactly as they did before this phase.

## SFX1.2 implementation state

SFX1.2 is complete at the commit containing this section. Its frontend implementation base was `73cf76f8`.

- The canonical semantic registry now contains the existing landing, swipe/Elo, card-animation, shop, welcome, PLAY1, and Hub cues. `sfx-renderers.ts` carries the proven oscillator/noise structures, envelopes, frequencies, durations, and relative levels; bundled animation samples retain their existing files, gains, composite timing, trim, and fade behavior.
- `usePlaySfx`, `playSfxEngine`, `useSwipeSound`, `useAnimationSound`, `useShopSound`, and `tomeAudioEngine` remain only as temporary compatibility adapters. They own no `AudioContext`, unlock listener, mute decision, replay guard, settings fetch, asset cache, or Audio Studio resolution. Existing product call sites therefore keep their signatures and semantic trigger boundaries while reaching the one canonical controller.
- Landing now requests `landing.enter` and retains its existing 250 ms navigation timing. PLAY/record/queue callers retain their existing legacy cue names through the canonical map. Hub entrance timers still request four `bookLand` impacts at the existing animation fractions; destination activation requests exactly one canonical `bookRuffle`, and the duplicate `playUiSfx("sectionOpen")` call is removed.
- Swipe, Elo correct/wrong, shop purchase/diamond/power-up, and all active card animations map to canonical events. Paper rip and the `chop`, `mogged`, `doakes`, and `amongus` samples use the canonical bounded decoded-buffer cache and SFX gain path. The four previously ungated samples now obey `mogsy-sounds-muted`.
- Welcome keeps its higher-level `scribble(ms)`, `stopScribble()`, and `pageTurn()` API. The canonical renderer owns the variable-duration quill voice and its stop handle, page-turn cadence, shared context, and master gain; the old tome context/unlock/dedupe state is gone.
- `sound-settings-runtime.ts` is the single observable compatibility snapshot for persisted `app_settings.sound_settings`. Registry entries declare their legacy setting key, so the controller—not adapters—enforces existing operator enablement. Keyed cues remain silent until that snapshot is available, avoiding the former default-enabled flash. Admin save publishes the new snapshot to mounted consumers. The old hook is now only a compatibility view for Admin and the dev-only entry prototype.
- Audio Studio precedence is unchanged: a valid enabled binding overrides the migrated built-in; an absent binding uses the proven renderer/sample; an explicit disabled, invalid, unavailable, or failed binding remains silent. Built-in and custom voices never stack.
- The canonical controller gained generic `stop` and `preload` commands for the welcome scribble and paper-rip warm-up, plus built-in multi-sample playback. All remain fail-soft and use the existing shared context, master gain, cache, mute, configuration, and replay state.
- Focused verification: 19 files / 577 tests, with 576 passing. The only failure is the documented pre-existing `Quiz.rankedRole.test.tsx` case “commits NOTHING for Practice after a role change”; all of that suite's PLAY1 sound assertions pass. Focused lint has zero errors and four existing/export-structure Fast Refresh warnings. Full app typecheck still reports only unrelated baseline errors and none in SFX1.2 files.
- Static runtime audit: `src/lib/audio/sfx.ts` and `sfx-renderers.ts` are the only product canonical Web Audio authority; Academy Radio and Mode Soundtrack remain separate music; `ui-sfx.ts` and its HUD/identity/Hex/Hub callers remain explicitly deferred to SFX1.3; Quiz Broadcast remains deferred to SFX1.7; `AutoVideo` is video; Admin sound/card-animation contexts are preview-only; `pages/dev/mogzy-entry-v2/useLaunchChime.ts` is a dev-only prototype copy. No unexplained active product SFX authority remains.
- No new sound moment, backend change, schema change, music change, Broadcast change, visible UI change, gameplay transition, or route behavior was introduced.

## SFX1.3 implementation state

- Global HUD, identity/profile actions, HexTrainingHero entry, and Hub `appEnter` now request explicit canonical semantics. The four migrated UI semantics intentionally have no built-in renderer, preserving the retired per-browser system's default-silent behavior until an operator authors an Audio Studio binding. Passive training-mode changes remain silent, and Hub destination activation still requests only its existing canonical book ruffle.
- `src/lib/ui-sfx.ts`, `UiSfxSettings.tsx`, their Settings surface, `playUiSfx`, `UiSfx` types, and the `mogsy.uiSfx.v1` code path are removed. No production or test import remains.
- Admin sound replacements now read and write canonical `audio_assets` plus `audio_event_bindings`. Uploading creates an enabled SFX asset binding; removing deletes the binding so the built-in can resume. Existing compatible `custom_sound_urls` values are surfaced as migration input and consumed on a successful Save; unsupported or explicitly overridden legacy data is preserved rather than silently discarded. `custom_sound_urls` is no longer a playback authority.
- Admin Save publishes `sound_settings` immediately and refreshes the existing Audio Studio runtime snapshot, so mounted canonical consumers receive both policy and replacement changes without a reload. Visitor mute remains independent. Academy Radio and Mode Soundtrack were not changed.
- AdminSounds now renders the existing `Academy Hub` group, including Book Landing and Book Page Ruffle, through the same saved `sound_settings` authority.
- Focused verification: 18 files / 270 tests, all passing. Full TypeScript validation reports unrelated current-worktree errors and none in SFX1.3 files. Focused lint passes; the broader changed-file invocation exposes only five pre-existing `no-explicit-any` errors and two Fast Refresh warnings in `MogzyIdentityMenu.tsx`. Existing React `act(...)`, router-future, and `fetchPriority` warnings remain in legacy suites.
- Static audit finds no `playUiSfx`, `UiSfx`, `mogsy.uiSfx.v1`, or `ui-sfx` import under `src`. Remaining non-canonical playback is limited to Quiz Broadcast, Academy Radio, Mode Soundtrack, video playback, Admin-only preview tooling, and the documented dev-only launch-chime prototype. The sole `custom_sound_urls` production reference is the one-way Admin migration key.
- No new audible product moment, backend/schema change, music change, Broadcast change, gameplay transition, or route behavior was introduced.

## SFX1.4 implementation state

- The canonical registry now adds seven synthesized semantic events: `hub.destination.focus`, `leaguecraft.record.selection`, `leaguecraft.quiz.start`, `leaguecraft.answer.lock`, `leaguecraft.answer.correct`, `leaguecraft.answer.incorrect`, and `leaguecraft.quiz.complete`. Their restrained built-ins are short leather/brass, academic-tactile, seal/rune, dry lock, ascending/descending result, and resolved completion voices; no external asset, schema, backend, or music change was needed.
- Desktop Hub books request destination focus only on authored pointer entry when `(hover: hover) and (pointer: fine)` matches, or on focus immediately authored by Tab navigation. Touch hover, programmatic/restored focus, pointer movement inside a book, and immediate same-book re-entry are silent. The existing activation stays exactly one `bookRuffle`; mobile therefore remains activation-only.
- Leaguecraft Record History/Review/Trends requests one selection cue only when the pane actually changes. Initial/hash-restored state and reselecting the active pane are silent. Successful pack/category/builder/remediation starts request one start cue only after a nonempty session exists; empty, unavailable, or failed starts remain silent, and direct starts do not stack selection plus start.
- Practice answer choice immediately requests one lock cue. Correct/incorrect cues occur only after the authoritative submit response succeeds; transport failure gets no false negative cue. Per-run question/index ids dedupe lock/result playback across rerenders or repeated results. Final `See results` owns one run-scoped completion cue; ordinary Next Question, answer hover, initial/restored state, and results rendering are silent.
- Focused SFX1.4 verification covers registry rendering/mute, Hub fine-pointer/keyboard/touch/re-entry behavior, Record selection/no-op behavior, empty start silence, full wrong/right practice progression, failed grading authority, and completion. The affected 4-file run is 138/139 passing; the sole independent failure is the existing Quiz hub assertion that expects an `<h1>` in the current lobby markup. A broader 12-file audio/Leaguecraft run is 148/149 passing; its sole independent failure is the already documented Ranked-role Practice test that reaches an empty-question error. TypeScript passes. Targeted ESLint reports only the existing `Quiz.tsx` `no-explicit-any` and exhaustive-deps findings.
- Browser QA passed at 1440×900 and 390×844 in the in-app Chromium browser. Desktop keyboard traversal reached the authored Hub books; Hub activation, Leaguecraft Record selection, a real 10-question practice start, and authoritative incorrect grading all completed. Mobile rendered the physical destination stack and Leaguecraft Ranked lobby correctly. The only browser console error-level entry was the pre-existing React `fetchPriority` casing warning.
- Intentionally untouched: live Ranked/match/results, Combat Simulation, Pro Play, Archives, auth/account, Admin, Broadcast, Academy Radio, Mode Soundtrack, routing, quiz selection/submission authority, and reduced-motion policy.

## SFX1.5 implementation state

- The registry adds `ranked.module.start`, `ranked.answer.lock`, `ranked.answer.correct`, `ranked.answer.incorrect`, `ranked.opponent.submitted`, `ranked.meta.action`, `ranked.points.awarded`, `ranked.speed.bonus`, and distinct `ranked.match.victory|defeat|draw` events. Voices are short and music-safe; the award starts 180 ms after the verdict and the speed accent at 400 ms, making one intentional settlement phrase rather than overlapping independent effects.
- Accepted ordinary answer lock is emitted only after `submitRound` resolves successfully. Accepted Meta Reflex action is emitted only after `submitSegmentChallenge` resolves successfully and only for `item_cost_duel` at `META_REFLEX_MIXED_VERSION` or later. Stable ids are match + round + lock and match + segment + card + action; retries, stale races, failures, rerenders, and double activation cannot claim a second success sound.
- `useRankedMatchSfx` observes the existing public controller without grading or mutating it. Its first snapshot per match is a silent baseline. A playable `surfaceRound` identity change emits module start after the existing reveal hold; repeated polls and reconnect/remount baselines are silent. Live resolved-round feedback is admitted only while `revealHold` is true, so resume/backfill settlements never replay history.
- Ordinary own correct/incorrect comes from the adapted authoritative settlement's viewer player. Meta Reflex per-card correct/incorrect comes only from `segmentState.ownCardReveals`; timeout/unanswered remains silent. Aggregate multi-card settlement does not add another verdict. The fifth card's verdict plus its published award closes the block, so there is no separate completion or settlement cue.
- Opponent feedback reads only public `hasSubmitted` false→true while the viewer is still active, or an increase in public `opponentChallengesCompleted` while the viewer's Meta block is unfinished. It always emits the same neutral `ranked.opponent.submitted`; skipped poll counts coalesce to one cue. No opponent answer, correctness, score inference, speed inference, timing comparison, or hidden settlement field enters the SFX layer.
- Point sound reads only the viewer's published `modulePoints` for a newly live settlement. Positive `pointsAwarded` emits one base award; the optional second accent requires the backend's explicit `speedBonusPoints > 0`. Zero awards, opponent awards, raw cumulative score mutations, and hidden score state are silent.
- Terminal sound requires both an authoritative `MatchResultView` and a session that previously observed a nonterminal public snapshot. Result `draw` maps to draw; otherwise `winnerUserId === viewerUserId` maps to victory and the other result maps to defeat. A delayed result read still sounds once; opening/reloading an already-completed match remains silent. Forfeit and no-contest use the same authoritative result mapping rather than a client-side special rule.
- Stable event ids cover every repeating transition: match/module/start; match/round/opponent; match/segment/opponent-progress-count; match/segment/card/result; match/round/result, award, and speed; match/terminal outcome. The canonical controller's bounded id set is the second guard behind the per-match observed-state tracker.
- Focused verification: 4 files / 66 tests passed for canonical rendering/mute, accepted/rejected command boundaries, observer baselines/dedupe, own verdicts, neutral opponent progress, Meta reveals, awards/speed, and terminal policy. The full `src/pages/quiz-ranked` regression directory passed; it retains existing fixture-adapter stderr and React `act(...)` warnings. TypeScript passes. Targeted ESLint has no new errors and only the pre-existing Fast Refresh/exhaustive-deps warnings in large Ranked files.
- Browser QA uses the real Ranked shell/controller through `/dev/ranked-shell-probe` plus a query-gated live-transition control. Installed Edge passed 6/6 at 1280×720 and touch 390×844: ordinary accepted lock, accepted Meta action, opponent submission, correct + base award, correct + base + speed, incorrect, live victory, completed-result reload silence, and unchanged visible match/result layouts. Synth playback was counted at the `AudioContext` oscillator boundary with a 750 ms accepted-action limit; no touch-unlock delay was observed.
- The dev probe now returns the existing valid segment challenge acknowledgement and exposes `?sfx=1` transition steps only for browser QA. Production contracts and behavior are unchanged. Ranked music, scoring, timers, ten-module flow, module history, Player Columns, reveal choreography, zero-scroll desktop contract, mobile flow, and result presentation were not changed.
- Remaining scope is SFX1.7 Broadcast renderer convergence/cleanup, then SFX1.8 final cross-device mix certification.

## SFX1.6 implementation state

- Audited Combat Simulation, Mogzy Archives mechanics reference, Pro Play, auth/account, and the shared shell. The deliberately small result is four new synthesized semantics—`combat.simulation.resolve`, `archives.reference.open`, `pro-play.analysis.open`, and `account.action.confirmed`—plus reuse of `ui.feedback.error` for visible refusals. No asset, backend, schema, music, routing, data, scoring, Premium, Home Hub, Leaguecraft, Ranked, or Broadcast behavior changed.
- Combat sounds only after a real interactive sandbox action resolves through the existing backend boundary. Missing setup, backend failure, and exhausted-credit gates request the canonical refusal; passive config restoration and the hidden legacy rotation tab stay silent. There is no optimistic press/start cue, so a fast action cannot stack press + start + result.
- Archives stays scholarly: opening a mechanics category or changing to a different table requests one very quiet page-edge cue. Initial/deep-linked render, active-table reselection, breadcrumbs, ordinary reading, retry, search/filter-like activity, and external/reference navigation stay silent.
- Pro Play sounds only the deliberate analytical handoffs into Matchup Explorer, Explore Pro Data, or `Graph this`. Public profile links, live/recent matches, search, quiz, filters, sorting, pagination, passive loads, refreshes, and surfaced background failures stay silent. No broadcast-style sports stinger was introduced.
- Auth/account uses one minimal neutral confirmation only after authoritative sign-in, immediate signup/guest conversion, password-email/resend acceptance, or explicit connection/disconnection succeeds. Visible submit/refusal failures reuse `ui.feedback.error`. Form entry, focus, visibility controls, mode switches, redirects, callback/restored connection state, pending verification hydration, and expired callback hydration remain silent; redirects and `returnTo` are unchanged.
- Shared HUD/identity semantics remain explicit but default-silent. The audit found no conspicuously dead shell action worth making audible: global destinations already receive their own authored destination/action feedback where appropriate, and a generic shell voice would double-cue navigation.
- Focused verification: 8 files / 207 tests passed, covering built-in rendering, global mute, authoritative success/refusal, initial/deep-link/pending silence, rerender stability, analytical-only navigation, and no generic + specialized stacking. The canonical-audio plus Home Hub, Leaguecraft, and full Ranked regression sweep passed 59 files / 755 tests. Full TypeScript validation and the production Vite build pass. Targeted lint outside the large pre-existing Combat file has no new errors; the broader invocation still exposes only that file's existing `no-explicit-any` debt and existing hook/Fast Refresh warnings.
- Installed Edge browser QA passed 6/6 at 1280×720 and touch 390×844. It exercised a successful and refused Combat action, silent Archives load plus category opening, silent Pro Play load plus analytical handoff, and silent auth initialization. Playback was counted at the actual `AudioContext` oscillator boundary; no initial-render, duplicate, or touch-hover cue appeared.

## SFX1.7 implementation state

- Broadcast has exactly five configured sound slots and no hidden equivalents: `questionStart` on question-phase entry (presentation-timed engine transition), `countdownTick` at the final 3/2/1 timer boundaries, `reveal` on reveal-phase entry, `correctAnswer` on that same reveal/highlight moment, and `transition` on transition-phase entry. There is no current incorrect-answer, scoreboard/result, intro, or outro cue. All are presentation-timed from the engine snapshot; the SFX settings Preview button is the only user-driven request.
- Canonical semantics are `broadcast.question.start`, `broadcast.countdown.tick`, `broadcast.reveal`, `broadcast.answer.correct`, and `broadcast.transition`. Broadcast session config remains authoritative for enable, master volume, per-event enable/volume, and fallback source path; an explicit Audio Studio event binding remains globally authoritative over that fallback. The thin `lib/quiz-broadcast/sfx.ts` adapter maps the persisted vocabulary into canonical resolution; presentation callers never receive filenames, gains, contexts, or decode state.
- The reveal and correct-answer slots describe one current presentation moment, not two sequenced moments. Policy is therefore exactly one cue: an enabled/nonempty `correctAnswer` slot replaces `reveal`; otherwise the enabled `reveal` slot is the compatibility fallback. Both stored slots and Admin controls remain intact, so existing config is neither flattened nor deleted, but simultaneous accidental stacking is removed.
- The old Broadcast `new Audio()` allocation and private `AudioContext`/silent-buffer unlock were removed. Canonical SFX now owns the only Broadcast context, gesture unlock/resume, asset fetch/decode cache, gain bus, `mogsy-sounds-muted`, fail-soft behavior, replay spacing, and bounded 512-id dedupe. The layer retains only phase/tick authority and a bounded 300-key recent-phase guard; it evicts oldest keys instead of clearing the entire set.
- Mounting onto cached, durable-session, or live hydrated state establishes a silent baseline. New phase identities use session + phase + `phaseStartedAt`; tick ids add the countdown number. Rerenders and same-snapshot churn cannot replay a cue, late-joined elapsed ticks remain skipped, and subsequent continuous transitions continue normally.
- `bubble_tap` was removed from `SoundSettings`, defaults, labels, Admin UI, and preview synthesis because it had no product consumer. The legacy replacement migration deliberately preserves unknown `custom_sound_urls` fields, including an old `bubble_tap` URL, until an operator explicitly handles that legacy record; the focused migration test pins this non-destructive behavior.
- Remaining audio authorities are intentional: canonical `src/lib/audio/sfx.ts`/`sfx-renderers.ts` for product SFX, Academy Radio and Mode Soundtrack for music, video element playback, Admin-only preview tooling, and the documented dev-only launch-chime prototype. Static audit finds no `new Audio`, Broadcast `AudioContext`, or direct `.play()` under the Quiz Broadcast runtime/components/pages; `quiz-broadcast/sfx.ts` remains only as the semantic/config adapter.
- Focused verification passed 6 files / 56 tests; the broader canonical-audio and Quiz Broadcast regression passed 17 files / 350 tests. Coverage includes every active semantic, global mute, Audio Studio precedence over the Broadcast fallback asset, fail-soft behavior, restored-state silence, phase/tick and rerender dedupe, reveal fallback policy, bounded continuous progression, and canonical unlock delegation. TypeScript and focused ESLint pass (the handoff Markdown is outside the ESLint config). The production Vite build passes with only its existing Tailwind ambiguity, mixed static/dynamic import, and chunk-size warnings. Installed Edge browser QA passed 2/2 at 1280×720 and touch 390×844, exercising pre-gesture blocking, the shared unlock, exactly one reveal buffer, rerender silence, continued transition playback, and live global mute/unmute.
- Broadcast engine timing, session persistence, channel/live sync, visuals, quiz/scoring logic, Radio, Mode Soundtrack, and every non-Broadcast product SFX call site remain unchanged. The only adjacent cleanup is the proven-dead `bubble_tap` control described above.

## SFX1.8 final certification state

- Certification date: 2026-09-19. Automated/static/available-browser technical certification is **PASS**. No product SFX defect was reproduced, so runtime behavior, cue vocabulary, gains, routes, gameplay/data authority, backend, Radio, and Mode Soundtrack were not changed. Physical acoustic and unavailable-device certification remains explicitly unclaimed.
- The whole-site matrix covers landing; Swipe/Elo and sampled card animations; Shop; Welcome; Home Hub; Leaguecraft; live/restored Ranked; Combat; Archives; Pro Play; auth/account; and Quiz Broadcast. Existing focused integration tests pin meaningful-action timing, initial/deep-link/restored silence, authoritative result boundaries, and generic-versus-specialized non-stacking.
- Five test-only guards were added to the canonical controller suite: cross-tab `storage` mute propagation, immediate live-master-bus mute/unmute, one-context reuse across repeated unlocks, bounded 512-entry event-id eviction, bounded 24-entry decoded-asset eviction, and failed-source caching that does not poison an unrelated source. (The mute check covers two related properties in one test.) The canonical controller suite passes 36/36.
- The broader SFX-attributable regression selection completed with 30 files and 550 tests passing. Its only failure is an unrelated Leaguecraft heading assertion in `src/pages/Quiz.hub.test.tsx` (`expected one h1, received zero`); all sound assertions in that file and the selection passed. The exhaustive repository run was not a usable gate: it exposed numerous existing non-SFX failures/timeouts and eventually exhausted Node's 4 GB heap before Vitest could print a final summary.
- TypeScript `--noEmit` and targeted ESLint pass. The production Vite build passes with only existing Tailwind ambiguity, mixed static/dynamic import, and chunk-size warnings. Production-config browser smoke coverage is supplied by the real Vite server behind the three Playwright harnesses.
- Installed Microsoft Edge/Chromium browser QA passes 14/14: surface matrix 6/6, Ranked 6/6, Broadcast 2/2, each at desktop 1280x720 and touch/mobile 390x844. It covers unlock blocking/recovery, live mute/unmute, dedupe, restored silence, continuous phase progression, meaningful surface handoffs, and action/result timing.
- A locally installed stock Firefox was detected, but Playwright requires its instrumented Firefox build; stock Firefox exited before the automation pipe connected, so no product assertion ran. Chrome, Safari, iOS Safari, and Android Chrome were unavailable on this Windows host. These are untested, not failed. No speaker/headphone listening claim is made from an automated agent run.
- Static audit leaves `src/lib/audio/sfx.ts` plus `sfx-renderers.ts` as the sole product SFX playback/context authority. Academy Radio and Mode Soundtrack remain separate music authorities; `AutoVideo` is video; AdminSounds/AdminCardAnimations contexts are operator previews; `pages/dev/mogzy-entry-v2/useLaunchChime.ts` remains a documented dev-only prototype. No Quiz Broadcast direct playback/context authority remains.
- Mix hierarchy remains intentionally restrained: authored Hub/Leaguecraft/Ranked/Combat/Archives/Pro Play/account gains stay at or below their established normalized levels; Broadcast session master and item volume multiply the canonical event gain. Global SFX mute changes only the SFX master gain and never calls either music controller. Automated checks certify gain routing and independence, not perceived loudness on physical transducers.
- Final SFX1.8 changes are documentation plus controller certification tests only. The pre-existing dirty `CombatLab`, Pro Play, FeatureBadge, asset, and `.pnpm-store` work remains unrelated and must stay unstaged.
