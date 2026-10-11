# PPQ2-D — Premium Pro Play statistical reveal

| | |
|---|---|
| Branch | `ppq2d/statistical-reveal` (worktree `C:\Users\mlmit\mogzy-wt\ppq2d-reveal`), local, **not pushed** |
| Base | `1de127ef` = `ppq2c/premium-presentation` tip (PPQ2-C pieces, incl. `ProPlayOptionContent` + its `revealSlots` interface; itself on `924f0192` = PPQ2-A main) |
| Scope | New files only: `src/components/pro-play/arena/reveal/**` (module, tests, DEV preview), `docs/handoffs/PPQ2-D.md`, `docs/handoffs/ppq2d/**` (capture script, probe results, screenshots). **No existing file is modified** |
| Status | **STOP for control-center review** |

## 1. What was built

All in `src/components/pro-play/arena/reveal/`.

| File | What it is |
|---|---|
| `proPlayRevealModel.ts` | Pure model: `buildProPlayRevealModel(options, reveal)` → candidates in server option order (correct from `correctOptionId`, pick from `selectedOptionId`, value = server `display` verbatim + support line), `evidenceState` (`complete`/`partial`/`absent`), metric, scope, explanation split from its provenance tail, authority. Also `revealSupportLine` (verbatim copy of `ProPlayEvidence`'s private `supportLine`), `splitExplanation`, `verdictSentence` |
| `ProPlayRevealValue.tsx` | The in-tablet value: one element pair (`display` over/beside the support line) mounted by PPQ2-C in the facts' own grid cell. No state colour of its own (the canonical button paints correct/incorrect/"Your pick" and the verdict icon); staged fade-and-rise, static under reduced motion |
| `ProPlayRevealFooter.tsx` | The answer footer: metric chip + evidence scope, the explanation, a **Source** disclosure (black-glass popover) with the technical authority, an optional `action` slot (Next / See results). Screen-reader verdict sentence (`role="status"`) and a per-option statistics list (screen-reader only when the tablets show the values; visible when they cannot) |
| `buildProPlayReveal.tsx` | `buildProPlayReveal({options, reveal})` → `{model, revealSlots}` or null; `revealValuesOnTablets(reveal, slots)` |
| `index.ts` | Public exports |
| `ProPlayReveal.test.tsx` | 208 tests (§6) |
| `__preview__/` | DEV-only isolated preview (§5); not a build entry |

## 2. Exported interface for PPQ2-INT

```ts
import {
  buildProPlayReveal, revealValuesOnTablets, ProPlayRevealFooter,
  type ProPlayRevealInput, type ProPlayReveal, type ProPlayRevealModel,
} from "@/components/pro-play/arena/reveal";

/** Structural subset of PPQ2-B's `ProPlayRevealData` — pass `projection.reveal` as is. */
interface ProPlayRevealInput {
  isCorrect: boolean;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  explanation: string;
  evidence: ProPlayEvidence | null;
}

function buildProPlayReveal(args: {
  options: ReadonlyArray<AnswerOptionView>;          // the QuestionView options, server order
  reveal: ProPlayRevealInput | null | undefined;     // projection.reveal — null until graded
}): ProPlayReveal | null;                            // null ⇔ no server grade

interface ProPlayReveal {
  model: ProPlayRevealModel;
  revealSlots: ReadonlyArray<ReactNode | null>;      // PPQ2-C `revealSlots`: positional, options.length long
}

function revealValuesOnTablets(reveal: ProPlayReveal,
  slots: { optionContent: ReadonlyArray<ReactNode> | null }): boolean;

<ProPlayRevealFooter
  model={reveal.model}
  valuesOnTablets={boolean}   // revealValuesOnTablets(reveal, slots)
  action={ReactNode}          // optional: the Next / See results control
  className={string}          // optional
/>
```

**Wiring (the whole integration):**

```tsx
const options = projection.surface.question.options;
const reveal = buildProPlayReveal({ options, reveal: projection.reveal });
const slots = proPlayAnswerSlots({
  options, context, revealed: reveal !== null, revealSlots: reveal?.revealSlots,
});
// regions: { media, optionContent: slots.optionContent, answerColumns: slots.columns, pairDivider: slots.pairDivider }
hudAction: reveal
  ? <ProPlayRevealFooter model={reveal.model} valuesOnTablets={revealValuesOnTablets(reveal, slots)}
      action={<NextButton {...projection.next} onClick={controller.next} />} />
  : null,
```

- `ProPlayRevealInput` was type-checked against PPQ2-B on `ppq2b/integration-main @ bdf4bbf1` in a throwaway worktree: `projection.reveal` (`ProPlayRevealData | null`) assigns to `ProPlayRevealInput | null`, `buildProPlayRevealModel(projection.surface.question.options, projection.reveal)` compiles; a negative control (`{isCorrect: true}`) fails. tsc exit 0 / 2 respectively.
- **Footer placement.** No seam change is needed: the footer goes in the arena's existing `hudAction` node (the row under the stage that PPQ2-B already earmarked for Next) and carries Next in its `action` slot. See §7 for the desktop height consequence and the alternative.
- **Next focus.** Focus management of the Next control after the reveal is the caller's (it owns the button); the footer does not move focus.

## 3. Design decisions

- **Text only.** Every value is the server's `display`, verbatim, with the metric-aware support line under it (pairs) or beside it (3–4-way). No bars, no scale, no rank, no position, no delta. A Journey-style bar needs a verified per-metric normalisation and owner approval (PPQ1 Q5); none is drawn.
- **In place, not stacked.** PPQ2-C mounts each slot in the identity-facts cell, which keeps the facts invisibly to hold the box. The value is sized to that box:
  - pair, below `lg`: value over support (18/20 px value with `leading-none`, 10/11 px support → 32.5 px = the player/team facts' height). The support is plain case below `sm` so "of 22 scope games" fits a ~100 px phone pair;
  - pair, from `lg` (height-locked stage, wide tablets): value and support on one line;
  - 3–4-way: one line (`display` + support, the support truncating with `title`).
  Player and team tablets therefore do not grow at any width (measured: 0 px, §5). Champion tablets have no facts cell, so the value is a new line there (§7).
- **`leading-none` must come after the font size.** `cn` (tailwind-merge) drops a `leading-*` that precedes a font-size class; the value then inherits the tablet's relaxed line-height and is 10 px taller. A test pins it.
- **Support line = the legacy one, verbatim.** `ProPlayEvidence.supportLine` is private and that file is outside this workstream, so it is copied character for character into `revealSupportLine`; a parity test renders the legacy `ProPlayEvidence` for all 14 payloads and compares. At integration it can become an export of the original (one-line swap).
- **Correctness only from the grade.** The correct tablet is `correctOptionId` (the index of the server's `correct_answer`), the pick is `selectedOptionId`. `evidence.correct_label` is never used to mark anything (test: a lying `correct_label` changes nothing).
- **Evidence joins by exact label, once.** Each option takes the evidence subject with exactly its label. Evidence order never moves a value (test: reversed subjects → identical model). A subject that is missing, or named twice, gives that option no value (`—`), never a guess; `display: null` → `—` with the support line from present fields.
- **Evidence states.** `complete` → values on every tablet. `partial` → every tablet gets the same value structure, the unnamed ones `—`, and the footer says "Statistics were not sent for every option." `absent` (older backend) → slots are `null`, the identity facts stay, and the footer says "No per-option statistics were sent for this question." and still shows the explanation.
- **Provenance out of the primary copy.** The backend appends "(authority revision 2 / 1)" to explanations (PPQ1 Q4, open). `splitExplanation` lifts **only** that exact trailing parenthetical out of the footer sentence (every other character kept; test proves `primary + tail = server sentence`). The full sentence, the revisions per option (server option order), the metric definition, form, definition version and policy version are in the **Source** disclosure. If the backend drops the tail, nothing changes here.
- **Screen readers.** A revealed tablet is a *disabled* button whose accessible name stays "A. Label" (PPQ2-C seam), so in-tablet values are not reachable by AT. The footer therefore carries (a) a `role="status"` verdict sentence — "Incorrect. You picked A, H4cker. The answer is B, Weiwei." — and (b) an ordered "Statistics by option" list — "A. H4cker: 7.1%, 14 games · 1W–13L. Your pick." — `sr-only` when the tablets show the values, drawn visibly when they cannot.
- **Plain fallback.** When PPQ2-C cannot draw symmetric identities (`optionContent === null`), the canonical label-only tablets stand and the reveal slots are ignored; `revealValuesOnTablets` is then false and the same per-option list is drawn visibly in the footer (letter, name, ✓ / "Your pick", value, support from `sm`).
- **Motion (restrained).** Beat 1 is the canonical tablet state (instant). Beat 2: each value fades and rises 4 px, 280 ms, starting 120 ms + 70 ms × server position (last value done by 630 ms on a 4-way). Beat 3: the footer fades in after the last value (≤ 710 ms). No forced wait: nothing is interactive-gated by the motion. Under the OS preference **or** the app's Reduce Motion (`useReducedMotionPreference`) no animation class or delay is emitted at all (`data-pp-reveal-motion="static"`).
- **"Your pick" clearance.** The canonical label sits at a tablet's bottom-right, inside its padding. Where a value is the tablet's last line it would run under it, so: compact values carry `pr-12` (the label reaches up to 46 px into the content box at 1024×768) and the support truncates before it; pair values carry `lg:pb-2` (a champion pair's value is its last line). Both insets apply to every candidate alike, so no tablet's markup depends on correctness or the pick.

## 4. Answer safety

| Invariant | Mechanism | Test |
|---|---|---|
| Nothing before a grade | `buildProPlayReveal(null)` is null; input requires the server's boolean verdict; PPQ2-C mounts slots only when `revealed` | null/undefined/ungraded → null; slots passed while ungraded → tablets **byte-identical** to tablets built with no reveal input (all 14); the integration recipe with `reveal: null` mounts no slot and no footer |
| Server order | candidates = `options.map` | 14 × 3 grades: labels = `choices`, letters A–D |
| Server verdict / pick | `correctOptionId` / `selectedOptionId` only | exactly one correct and one picked, equal to the server's; `correct_label` ignored |
| `display` verbatim | copied, `—` only when absent | every fixture, every tablet's text = the payload's `display` |
| No invented statistics | label join, unique; no arithmetic | partial / duplicate / null display; source guard: no `.sort/.reverse`, no arithmetic on rate fields |
| Symmetry | one component, same elements for every candidate | tag + data-attribute signature identical across candidates; markup identical apart from text, `title` and the stagger delay (correct = wrong = other) |
| No legacy reads | — | source guard: no `.presentation`, `correct_answer`, `is_correct`, `selected_answer`, `asEvidence`, `.correct_label` (comments excluded) |
| One answer path | nothing interactive in a slot; no `data-quiz-choice={`, no `*AnswerGrid/*AnswerOptions` names | DOM check + source guard |

## 5. Visual certification

Harness: `reveal/__preview__/index.html` on a capture host = this branch + `docs/handoffs/ppq2c/proposed-regions-seam.patch` (uncommitted; worktree `C:\Users\mlmit\mogzy-wt\ppq2d-capture`, launch entry `ppq2d-capture`, port 5264). It starts from PPQ2-C's own preview view (real frozen payloads, production `CanonicalArena`, PPQ2-C plate/tablets through the seam) in a graded state and adds exactly the §2 wiring. Query: `?fixture=&grade=real|correct|wrong&evidence=full|partial|absent&ids=rich|plain&names=real|long&prompt=&rails=&stage=`. Synthetic and labelled: re-grades (`correct`/`wrong`; `real` is the server's own grade and pick), `partial` (B's evidence removed), `absent`, `ids=plain` (one subject label broken → PPQ2-C fallback), long names (PPQ2-C's stress labels; evidence relabelled by option index so each keeps its real value), the session score, and a Next button that does nothing.

Capture: `docs/handoffs/ppq2d/cap.cjs` (headless Edge, asset/font disk cache, Supabase blocked). For every case it first loads PPQ2-C's **pre-answer** preview of the same fixture and labels, so tablet and stage growth are measured against the real pre-answer tablets.

**Matrix (final run, after every fix): 152 captures.**
- A: all 14 payloads, server grade, at 375×812, 390×844, 768×1024, 1024×768, 1280×800 and 1440×900 (84).
- B: re-grades, partial/absent evidence, long names and the plain fallback at 375, 390, 1024 and 1440 (56).
- C: an 80 ms early frame, staged vs reduced motion (8).
- D: Source disclosure opened by keyboard (4).

Probe per capture: document x-overflow, stage clip, nested scrollers (stage and footer), footer x-overflow, tablet content outside or half-clipped, the "Your pick" label over a value's painted text, tablet and stage growth against the pre-answer render, footer size and position, support truncation, broken images and page errors.

**Results: 0 page errors and 0 probe violations**, apart from the pre-existing 1024×768 document width (1028/1024, all 28 captures at that size; PPQ2-A A5).

| Viewport | n | Tablet growth vs pre-answer: player/team (px) | …: champion tablets (px) | Stage Δ vs pre-answer (px) | Footer height (px) | Notes |
|---|---|---|---|---|---|---|
| 375×812 | 28 | **0** | 0–36.5 | −68.5 … +36.5 (intrinsic; the page scrolls) | 105–161 (263 plain fallback) | footer below the fold on most; no nested scroller |
| 390×844 | 34 | **0** | 0–36.5 | −68.5 … +36.5 (intrinsic) | 105–161 (263 plain) | same |
| 768×1024 | 14 | 0–2 | 2.5–39.8 | 0 … +39.7 (intrinsic) | 64–105 | |
| 1024×768 | 28 | **0** | 2.5–34.8 | −46 … −50 (−204 plain) | 46–50 (204 plain) | stage shrinks by the footer row: plate clips its chip row (§7.1) |
| 1280×800 | 14 | **0** | 2.5–34.8 | −46 … −50 | 46–50 | |
| 1440×900 | 34 | **0** | 2.5–34.8 | −46 … −50 (−204 plain) | 46–50 (204 plain) | |

- "Stage Δ" at `lg` is the footer row (§7.1). The stage height is otherwise unchanged by the values. The negative phone deltas are the plain fallback, whose label-only tablets are shorter than rich ones.
- "Your pick" over a value: 0 in settled frames (it was 21 before the §3 insets). 1 case at 80 ms, while the value is still rising.
- Support truncated with `title` on 14 captures (3–4-way at 1024–1440). `display` never truncates.
- Motion (C). At 80 ms the staged values are mid-entrance (the first at opacity 0.32–0.81, later ones lower or still 0, in server order). Under reduced motion every value is at opacity 1 in the same frame.
- Keyboard (D + `a11y.cjs`, real browser, champion_player at 1440×900):
  - the revealed tablets are disabled buttons named "A. H4cker" / "B. Weiwei";
  - Tab goes plate chips → **Source** (visible focus ring) → **Next**;
  - Enter opens the disclosure (`role="dialog"`, `aria-expanded="true"`, focus inside); Escape closes it and returns focus to Source;
  - status: "Incorrect. You picked A, H4cker. The answer is B, Weiwei.";
  - list: "A. H4cker: 7.1%, 14 games · 1W–13L. Your pick." / "B. Weiwei: 25.0%, 12 games · 3W–9L. Correct answer.".
- Readout modes (all captures): values on the tablets with the list as screen-reader only (136); no list when evidence is absent (8); a visible list for the plain fallback (8).

Visual notes: the canonical tablets carry the verdict (red pick, blue-grey correct, verdict icons, "Your pick"); the value is the largest type in the tablet and inherits the tablet's foreground, so it reads on all three states. Long names keep the value line intact (names truncate, values do not). The preview relabels options only, so in `names=long` captures the server's explanation still names the real entities.

Evidence files (`docs/handoffs/ppq2d/`):
- `probe-A.json`, `probe-B.json`, `probe-early80.json`, `probe-rm-early80.json` and `probe-source.json`: every capture's measurements;
- `summary.txt`: the tables above, generated from the probes;
- `a11y-champion_player-1440x900.json`;
- `cap.cjs` and `a11y.cjs`: the scripts;
- 79 screenshots, `<fixture>-<grade>[-evpartial|-evabsent][-longnames][-plain]-<viewport>.jpg`:
  - every payload at 390×844 and 1440×900;
  - every variant at 390 and 1440;
  - 1024×768: `patch`, `player_champion`, `champion_player` and `t1_lineage`;
  - 375×812 and 768×1024 samples, and 1280×800 `recent` and `patch`;
  - `early80-*` / `rm-early80-*` (motion) and `source-*` (the disclosure open).

## 6. Tests

`npx vitest run src/components/pro-play/arena` → **302 passed** (PPQ2-C's 94 unchanged + 208 new). New coverage:
- before a grade: null model/slots; ungraded slots → byte-identical tablets (14); integration recipe with `reveal: null`;
- model: order/verdict/pick on 14 payloads × real/correct/wrong (42); `display` verbatim (14); support-line parity with the legacy `ProPlayEvidence` (14); all six fixture metrics and both forms present; label join independent of evidence order; absent; partial; duplicate subject; null display; `correct_label` ignored; authority revisions in option order;
- explanation split on all 14 payloads (only the tail removed) and untouched sentences; verdict sentences;
- tablets (via PPQ2-C's production `proPlayAnswerSlots`): every tablet's own value and support in order (14 × correct/wrong); identical structure (14); facts replaced in place, `aria-hidden`, nothing interactive (14); partial keeps structure with `—`; absent keeps facts; pair vs compact layout; no bar/rank/position/`width:`;
- footer: metric + scope + explanation without provenance + action (14); screen-reader list in server order with one "Correct answer" and one "Your pick" + status sentence (14); visible list on the plain fallback; absent-evidence note; Source disclosure (native `button`, `aria-expanded`, opens on activation, shows policy/definition/metric definition/revisions/verbatim sentence, Escape closes); no opponent/ELO/HP/clock/victory vocabulary;
- motion: staged delays by server position, footer < 700 ms; static under `html.reduce-motion`; static under OS `prefers-reduced-motion`;
- density: no fixed heights in a slot, `leading-none` survives class merging, no overflow scrollers;
- source guards (comments excluded).

Repo guard `AnswerGrid.elimination` "exactly one answer-rendering path": the same file lists as base (`QuizAnswerOptions` / `BroadcastRenderer` + `QuizAnswerOptions` + `AnswerGrid`). It fails on Windows only because the guard compares `\`-separated paths, exactly as PPQ2-C recorded. No reveal file is listed.

Typecheck `tsc -p tsconfig.app.json`: the 2 pre-existing errors only (`OnboardingProfile.tsx`, `identity/connections.ts`). ESLint on `reveal/`: 0 errors, 1 `react-refresh` warning in `__preview__/main.tsx` (same as PPQ2-C's preview).

Toolchain: the shared `@swc/core` cannot load on this machine; tests ran with a scratch esbuild vitest config (repo config minus the react-swc plugin). pnpm was not run.

## 7. Limitations and open decisions

1. **Desktop stage height at reveal — integration decision.** With the footer in `hudAction`, the arena's lower row goes from 0 px (pre-answer) to 46–50 px (reveal), and the height-locked `lg` stage shrinks by exactly that. 1280 and 1440 absorb it (the media region yields; plate art shrinks). **At 1024×768 the media region drops to ~160 px and PPQ2-C's plate clips its bottom chip row** (see `patch-real-1024x768.jpg`, `player_champion-real-1024x768.jpg` vs PPQ2-C's `patch-pre-1024x768.jpg`). A bare Next button in `hudAction` (PPQ2-B's plan) has the same effect at ~36 px, so this belongs to the reveal-row placement, not only to the footer. Options:
   - (a) **Recommended:** INT reserves the `hudAction` row at `lg` for the whole question (an empty box of the footer's height pre-answer), so the stage never changes height between question and reveal; **and** PPQ2-C makes the plate's chip row drop out whole below a height, as its code rows already do.
   - (b) An additive seam region (`regions.answerFooter`) inside the stage. It still takes stage height, so (a)'s plate fix is needed anyway.
   - (c) Accept the 46–50 px shrink at reveal.
2. **Champion tablets grow by the value line.** They have no facts cell to fill: +36.5 px on phones (the page scrolls, as allowed), +34.8 px at `lg`, where the answers region goes over its reserve and the media region yields, compounding (1) at 1024×768. Player and team tablets: 0 px.
3. **"Your pick" placement (canonical label).** It sits bottom-right inside the tablet padding; at 1024×768 the canonical dense tier holds tablet content ~4 px short, so any last line runs under it. The insets in §3 clear it in every capture. The clean fix is in the seam patch (`QuizAnswerOptions`, owner-gated): in `pair` layout, put "Your pick" top-right (the letter is already top-left there). PPQ2-C reported the same label over its code rows.
4. **Explanation precision (backend, Q4).** The server's explanation rounds differently from its evidence ("25% … 7%" vs `display` "25.0%" / "7.1%"). Both are shown verbatim; nothing is rewritten. The provenance tail is moved to the disclosure, not rewritten.
5. **Support line is a copy.** `revealSupportLine` duplicates the private `ProPlayEvidence.supportLine` (parity-tested). At integration, export the original and import it here.
6. **Truncation (with `title`).** The footer's scope label at `lg` (≤ 40 % of the row; the full scope is in Source and usually in the explanation); 3–4-way support lines at 1024–1440 ("of 77 scope g…": 14 captures). The `display` value itself never truncates.
7. **Phones.** The footer is 105–161 px and sits below the fold on most 375/390 captures. The page scrolls (no nested scroller), as PPQ1 §9 allows.
8. **Plain fallback (not seen on any real payload).** When PPQ2-C cannot draw symmetric identities, the values move to a visible list in the footer: 204 px at `lg`, 263 px at 375. The stage yields accordingly. That is acceptable for a fallback, but it is not compact.
9. **Announcement.** The verdict sentence is a `role="status"` element mounted with its content. Screen readers vary on announcing a freshly mounted live region. Recommendation for INT: move focus to Next after the reveal (its label then reads in context) and keep this sentence and the list as the reading order.
10. **Pre-existing.** 1024×768 document width 1028 px on every full-bleed arena capture (PPQ2-A A5), unchanged.
11. **Preview stand-ins.** The Next button does nothing. Score and history are synthetic (as in PPQ2-C).

## 8. Reproduce

```bash
git -C C:/Users/mlmit/mogzy-wt/ppq2d-reveal log --oneline -4
npx vitest run src/components/pro-play/arena          # (scratch no-swc config on this machine)
# capture host = this branch + PPQ2-C's seam patch, uncommitted (worktree ppq2d-capture, launch entry "ppq2d-capture", port 5264)
node docs/handoffs/ppq2d/cap.cjs <outDir> champion_player:real,t1_lineage:wrong,pro_play:real:partial 390x844,1440x900
PPQ_RM=1 PPQ_EARLY=80 node docs/handoffs/ppq2d/cap.cjs <outDir> t1_lineage:wrong 390x844
PPQ_SOURCE=1 node docs/handoffs/ppq2d/cap.cjs <outDir> champion_player:real 1440x900
```
