/**
 * VISCONT1 — VISUAL CONTINUITY IS AN ARENA INVARIANT, MEASURED.
 *
 * Within one arena mode and one viewport, changing the QUESTION or revealing
 * it must not move the coordinates a player's eyes and cursor track: the
 * folio, the media region, the prompt, the answer grid, the first tablet and
 * the Module Rail. The owner's rule:
 *
 *     CONTENT ADAPTS TO THE ARENA. THE ARENA DOES NOT ADAPT TO CONTENT.
 *
 * ARENA1 locked the outer card, and its arithmetic test still holds — which is
 * exactly why it could not see the next defect. QV1 later gave the RICH band
 * profiles a taller media region than the compact plate (19rem vs 16rem at
 * 1880x900), and the question inside the card was centred on its CONTENT
 * (`my-auto`), so any round whose content was a different height moved every
 * anchor by half the difference: −27.6px of art top and +20.4px of prompt and
 * answers between a compact round and a cinematic one, while the folio and the
 * Module Rail — the two things the old test measured — did not move at all.
 *
 * VISCONT1's first pass fixed that and left three residuals, all of them long
 * text outgrowing a fixed box: p99/extreme four-answer rounds on a desktop
 * (prompt and answers −38px), phone prompts over four lines (25.7px), and the
 * phone reveal where the first pass had given its slot back (~12px). The
 * second pass makes long text tighten INSIDE its box (`textDensity`), and this
 * file holds all of it — including each residual by name — to ZERO movement.
 *
 * It measures boxes in a real browser, through the real arena
 * (`/dev/ranked-shell-probe`, which mounts the production `QuizRankedMatch`),
 * across the hostile transitions the owner named, a broken asset, Stat Check,
 * the Daily stage rulesets (Time Trial, Survival, Standard/Review) hosted the
 * way `DailyRunPage` hosts them, and — in ONE mount, through the live
 * controller — question -> reveal -> next question.
 *
 * VISCONT1-SSM: every round is measured in the PRODUCTION face. The real
 * Ranked and Daily routes (`/quiz/*`) wear `theme-lol`, which sets the prompt
 * in Cinzel; this dev route does not, so the probe is opened with `?lol=1`
 * (`probeUrl`). Measured in the body face instead, VISCONT1 certified bounds
 * that real `ssm.combined` prompts broke in the Phase 1 release certification
 * (B1) — and that the bank's own 188/192 broke too, unseen.
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-visual-continuity
 */
import { expect, test, type Page } from "@playwright/test";

// A matrix test loads up to 24 rounds and a live test samples every reveal
// frame; the config's 60s is a single-page budget.
test.describe.configure({ timeout: 300_000 });

/** The probe, wearing the League section's root theme (see the header). */
const probeUrl = (query: string) => `/dev/ranked-shell-probe?${query}&lol=1`;

/** The prompt is in the production display face, not a fallback. */
async function expectProductionFace(page: Page) {
  // Whatever face the prompt is set in must be the one that drew it — not a
  // fallback. `fonts.ready` can settle before the page has asked for the face
  // at all, so wait (bounded) for it; the assertion below reports it. (On a
  // phone the extended tier sets the prompt in Inter, and a page with no
  // Cinzel text never requests Cinzel.)
  const loaded = () => {
    const h2 = document.querySelector('[data-surface-region="prompt"] h2');
    const family = h2 ? getComputedStyle(h2).fontFamily.split(",")[0].replace(/"/g, "").trim() : "";
    return { family, ok: !!family && document.fonts.check(`700 20px "${family}"`) };
  };
  // The predicate must return the BOOLEAN: `loaded` returns an object, which
  // is always truthy, so waiting on it directly never waited (VISCONT1-F1).
  await page.waitForFunction(`(${loaded})().ok`, null, { timeout: 15_000 }).catch(() => undefined);
  const face = await page.evaluate(`(${loaded})()`) as { family: string; ok: boolean };
  const themed = await page.evaluate(() => document.documentElement.classList.contains("theme-lol"));
  expect(themed, "the probe is not wearing theme-lol").toBe(true);
  expect(["Cinzel", "Inter"], `the prompt is set in ${face.family}`).toContain(face.family);
  expect(face.ok, `${face.family} did not load; the prompt would be measured in a fallback face`).toBe(true);
}

/** Rounding noise only; a real reflow is whole pixels. */
const TOL = 0.5;

/** The readable floors the density tiers may never go below. */
const MIN_ANSWER_PX = 12;
const MIN_PROMPT_PX = 15;

type Anchors = {
  band: string;
  folioTop: number; folioBottom: number;
  mediaTop: number | null; mediaBottom: number | null;
  promptTop: number; answersTop: number; firstTabletTop: number;
  timelineTop: number | null;
  inputOpen: boolean; evidence: boolean; tablets: number;
  matchup: boolean; pageScroll: number;
  /** Content past its reserved box (px; <= 0 means it fits). */
  promptOver: number; answersOver: number;
  promptPx: number; answerPx: number;
  answerDensity: string; promptDensity: string;
  /** A label or the prompt cut off (overflowing its own element). */
  textClipped: boolean;
  /** The tablets' entrance stagger is still playing (a transform, not layout). */
  entering: boolean;
};

const MEASURE = (): Anchors | null => {
  const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement | null;
  // Not mounted (yet): no coordinates to compare. `settled` waits it out; a
  // live sequence treats it as a failure (the stage must never unmount).
  if (!stage || !document.querySelector('[data-surface-region="answers"] [data-quiz-choice]')) return null;
  const folio = stage.getBoundingClientRect();
  const media = box('[data-surface-region="media"]');
  const timeline = box('[data-testid="ranked-round-timeline"]');
  const hero = document.querySelector('[data-testid="scenario-hero"]');
  const surface = document.querySelector('[data-testid="scenario-surface"]') as HTMLElement | null;
  const prompt = document.querySelector('[data-surface-region="prompt"]') as HTMLElement;
  const answers = document.querySelector('[data-surface-region="answers"]') as HTMLElement;
  // How far a region's CONTENT reaches past the reserve it was given. The
  // region is a floor, so its own box grows with overflowing content; the
  // reserve is its min-height.
  const over = (region: HTMLElement) => {
    const kids = [...region.children];
    if (!kids.length) return 0;
    const reach = kids[kids.length - 1].getBoundingClientRect().bottom - region.getBoundingClientRect().top;
    return reach - parseFloat(getComputedStyle(region).minHeight || "0");
  };
  const tablets = [...answers.querySelectorAll("[data-quiz-choice]")] as HTMLElement[];
  const h2 = prompt.querySelector("h2") as HTMLElement;
  const grid = answers.querySelector("[data-answers-state]") as HTMLElement | null;
  return {
    band: surface?.dataset.band ?? "-",
    folioTop: folio.top, folioBottom: folio.bottom,
    mediaTop: media?.top ?? null, mediaBottom: media?.bottom ?? null,
    promptTop: prompt.getBoundingClientRect().top,
    answersTop: answers.getBoundingClientRect().top,
    firstTabletTop: tablets[0].getBoundingClientRect().top,
    // The phone arena moves the rail into its bottom bar (`display: none`
    // here), so a zero-size box is "not on this layout", not a coordinate.
    timelineTop: timeline && timeline.height > 0 ? timeline.top : null,
    inputOpen: stage.dataset.inputOpen === "true",
    evidence: document.querySelector('[data-testid="answer-evidence"]') !== null,
    tablets: tablets.length,
    // Both sides and the seam between them (the card's text runs together:
    // "MatchupVSAhriSyndra…").
    matchup: ["VS", "Ahri", "Syndra"].every((t) => (hero?.textContent ?? "").includes(t)),
    pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    promptOver: over(prompt),
    answersOver: over(answers),
    promptPx: parseFloat(getComputedStyle(h2).fontSize),
    answerPx: Math.min(...tablets.map((t) => parseFloat(getComputedStyle(t).fontSize))),
    answerDensity: grid?.dataset.answerDensity ?? "-",
    promptDensity: surface?.dataset.promptDensity ?? "-",
    // The prompt is `overflow: visible`, so it can only be cut off by a clip
    // or a line clamp. At the dense/extended tiers' 1.15 leading Cinzel's
    // glyph box reaches ~2px past the line boxes (scrollHeight +2) while every
    // line is drawn in full — that is ink, not clipping.
    textClipped: [...tablets].some((e) => e.scrollHeight > e.clientHeight + 1
      || e.scrollWidth > e.clientWidth + 1)
      || ((getComputedStyle(h2).overflowY !== "visible" || getComputedStyle(h2).webkitLineClamp !== "none")
        && (h2.scrollHeight > h2.clientHeight + 1 || h2.scrollWidth > h2.clientWidth + 1))
      || h2.scrollWidth > h2.clientWidth + 1,
    entering: [...answers.querySelectorAll("[data-quiz-choice-cell]")]
      .some((c) => c.getAnimations().some((a) => a.playState !== "finished")),
  };
};

/** The anchors that may never move between ordinary rounds. */
const STABLE = ["folioTop", "folioBottom", "mediaTop", "mediaBottom", "promptTop",
  "answersTop", "timelineTop"] as const;

function expectSameAnchors(ref: Anchors, got: Anchors, what: string, keys: readonly string[] = STABLE) {
  for (const k of keys) {
    const a = ref[k as keyof Anchors] as number | null;
    const b = got[k as keyof Anchors] as number | null;
    if (a === null || b === null) {
      expect(b, `${what}: ${k} presence changed`).toBe(a);
      continue;
    }
    expect(Math.abs(b - a), `${what}: ${k} moved ${(b - a).toFixed(1)}px (${a.toFixed(1)} -> ${b.toFixed(1)})`)
      .toBeLessThanOrEqual(TOL);
  }
}

/** The text fits the box it was given, readably, and nothing is cut off. */
function expectSeated(got: Anchors, what: string) {
  expect(got.promptOver, `${what}: the prompt overflows its box by ${got.promptOver.toFixed(1)}px`)
    .toBeLessThanOrEqual(TOL);
  expect(got.answersOver, `${what}: the answers overflow their box by ${got.answersOver.toFixed(1)}px`)
    .toBeLessThanOrEqual(TOL);
  expect(got.answerPx, `${what}: answer type below the ${MIN_ANSWER_PX}px floor`)
    .toBeGreaterThanOrEqual(MIN_ANSWER_PX);
  expect(got.promptPx, `${what}: prompt type below the ${MIN_PROMPT_PX}px floor`)
    .toBeGreaterThanOrEqual(MIN_PROMPT_PX);
  expect(got.textClipped, `${what}: a label or the prompt is cut off`).toBe(false);
  expect(got.pageScroll, `${what}: scrolls the page`).toBe(0);
}

/** Wait until the round is open and the tablets' entrance stagger has
 *  finished (its delay means two equal samples can still precede it). */
async function settled(page: Page): Promise<Anchors> {
  let last = await page.evaluate(MEASURE);
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(100);
    const next = await page.evaluate(MEASURE);
    if (next && last && next.inputOpen && !next.entering && !last.entering
      && Math.abs(next.firstTabletTop - last.firstTabletTop) < 0.05
      && next.band === last.band) return next;
    last = next;
  }
  expect(last, "the question stage never settled").not.toBeNull();
  return last!;
}

/**
 * A round, by name: a probe state, or `shape.N.K.M.R` — K option labels of N
 * characters and an M-character prompt, on a compact plate (R=0) or the
 * cinematic item card (R=1), built from real League vocabulary.
 */
function roundQuery(state: string): string {
  if (!state.startsWith("shape.")) return `q=${state}`;
  const [alen, acount, plen, rich, om = "0"] = state.split(".").slice(1);
  return `q=shape&alen=${alen}&acount=${acount}&plen=${plen}&rich=${rich}&om=${om}`;
}

async function load(page: Page, query: string): Promise<Anchors> {
  await page.goto(probeUrl(query));
  await page.waitForSelector('[data-testid="scenario-surface"]');
  await expectProductionFace(page);
  await page.waitForTimeout(600);
  return settled(page);
}

/** The profile each round must actually draw. */
function profileOf(state: string): string {
  // `shape.N.K.M.R[.O]`: R (rich) picks the cinematic item card; O is option media.
  if (state.startsWith("shape.")) return state.split(".")[4] === "1" ? "cinematic" : "compact";
  return ({
    opts4: "compact", opts2: "compact", placeholder: "compact", twoChamp: "compact",
    jungleRule: "compact", realP99: "compact", realMax: "compact", media: "cinematic",
    abilityCost: "cinematic", matchup: "cinematic", minionWave: "cinematic",
    spellCooldown: "cinematic", junglePet: "cinematic", stressA: "cinematic",
    family: "family", stressB: "family",
    ssm212: "cinematic", ssm218: "cinematic", ssm224: "cinematic", ssm228: "cinematic",
    f1Ionian: "cinematic", f1IonianText: "cinematic", f1Chempunk: "cinematic",
    f1ChempunkText: "cinematic", f1Locket: "cinematic",
  } as Record<string, string>)[state];
}

/**
 * Every round the arena must seat on ONE set of anchors, at every viewport:
 * each content class the owner named, and the long-text shapes that used to
 * be exceptions — p90 labels (`shape.32…`), the servable p99 and maximum
 * labels (`realP99`, `realMax`), the bank's longest label (76 characters), a
 * long prompt, the bank's longest prompt (188) on rich art with long labels,
 * the RS2 compound worst cases (`stressA`, `stressB`), the 192-character
 * RA7 family fixture, and (VISCONT1-SSM) the REAL `ssm.combined` Mastery
 * prompts past the bank: 212, 218, 224 and the 228-character safety bound.
 */
const ORDINARY = [
  "opts4", "opts2", "placeholder", "twoChamp", "jungleRule", "media", "abilityCost",
  "matchup", "minionWave", "spellCooldown", "junglePet", "family",
  "shape.32.4.60.0", "realP99", "realMax", "shape.76.4.60.0", "shape.76.3.60.0",
  "shape.24.2.150.1", "shape.48.4.188.1", "stressA", "stressB",
  "ssm212", "ssm218", "ssm224", "ssm228",
  "f1Ionian", "f1Chempunk", "f1Locket",
];

const VIEWPORTS = [
  // Phones, through the production frame (`?frame=0`), as RMOB2 measures them.
  { w: 375, h: 812, frame: "&frame=0", phone: true },
  { w: 360, h: 740, frame: "&frame=0", phone: true },
  { w: 1024, h: 768, frame: "", phone: false },
  { w: 1280, h: 800, frame: "", phone: false },
  { w: 1440, h: 900, frame: "", phone: false },
  // The wide-desktop QV1 tier in its lock regime and in its tall regime.
  { w: 1600, h: 780, frame: "", phone: false },
  { w: 1920, h: 800, frame: "", phone: false },
  { w: 1880, h: 900, frame: "", phone: false },
  { w: 1920, h: 1080, frame: "", phone: false },
] as const;

/**
 * THE LIVE SEQUENCES. `?sfx=1&seq=` serves one probe state per round and
 * settles each round with a correct option and an evidence line — here the
 * LONGEST the evidence beat carries (`evlen=96`) — so each advance is a real
 * settlement -> reveal beat -> next round inside ONE mount of the arena.
 */
const SEQUENCES = [
  { name: "rich -> compact -> rich, single champion -> Matchup",
    seq: ["abilityCost", "opts4", "matchup", "opts4"] },
  { name: "premise media -> option-media only -> premise, 4 -> 2 options, icons -> none",
    seq: ["media", "placeholder", "twoChamp", "opts2"] },
  { name: "family -> champion -> environment -> compact",
    seq: ["family", "abilityCost", "minionWave", "jungleRule"] },
  { name: "normal -> p99 labels -> extreme labels + longest prompt -> normal",
    seq: ["opts4", "realP99", "shape.76.4.188.1", "opts2"] },
  { name: "compact -> real SSM 224 -> rich -> SSM 228 (past the bank)",
    seq: ["opts4", "ssm224", "abilityCost", "ssm228"] },
  { name: "compact -> item-icon labels (F1) -> their text-only twin -> 19-char icon label",
    seq: ["opts4", "f1Ionian", "f1ChempunkText", "f1Chempunk"] },
];

async function playSequence(page: Page, query: string, expected: string[]) {
  await page.goto(probeUrl(query));
  await page.waitForSelector('[data-testid="scenario-surface"]');
  await expectProductionFace(page);
  // Step 1 converts the canned hp match to the points match the rest of the
  // sequence plays (the opponent has answered); measure from there, because
  // hp -> points is a different MODE, not a transition a player can see.
  await page.click('[data-testid="probe-sfx-advance"]');
  await page.waitForFunction(() => /\(1\/5\)/.test(
    document.querySelector('[data-testid="probe-sfx-advance"]')?.textContent ?? ""));
  await page.waitForTimeout(1500);
  const ref = await settled(page);
  expect(ref.band).toBe(profileOf(expected[0]));
  expectSeated(ref, `round 1 (${expected[0]})`);
  let reveals = 0;
  for (let round = 2; round <= expected.length; round++) {
    await page.click('[data-testid="probe-sfx-advance"]');
    // Sample through the whole beat: settlement, the reveal hold (input shut,
    // correct tablet lit, evidence line mounted), the module title and the
    // next round's entrance. EVERY sample is held to the anchors.
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(80);
      const now = await page.evaluate(MEASURE);
      expect(now, `round ${round - 1} -> ${round}: the question stage unmounted`).not.toBeNull();
      if (!now) return;
      if (!now.inputOpen && now.evidence) reveals++;
      expectSameAnchors(ref, now, `round ${round - 1} -> ${round} (+${(i + 1) * 80}ms)`);
    }
    const next = await settled(page);
    expect(next.band, `round ${round} drew the wrong profile`).toBe(profileOf(expected[round - 1]));
    if (expected[round - 1] === "matchup") expect(next.matchup).toBe(true);
    expectSeated(next, `round ${round} (${expected[round - 1]})`);
    expectSameAnchors(ref, next, `round ${round} settled`, [...STABLE, "firstTabletTop"]);
  }
  // The reveal state was genuinely exercised, not skipped between samples.
  expect(reveals, "no sampled frame was a disclosed reveal").toBeGreaterThan(0);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.w}x${vp.h}`, () => {
    test.use({
      viewport: { width: vp.w, height: vp.h },
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    });

    test("every ordinary round, long text included, lands on the same anchors", async ({ page }) => {
      let ref: Anchors | null = null;
      for (const state of ORDINARY) {
        const got = await load(page, `${roundQuery(state)}${vp.frame}`);
        expect(got.band, `${state} drew the wrong profile`).toBe(profileOf(state));
        if (state === "matchup") expect(got.matchup, "the Matchup card did not render").toBe(true);
        expectSeated(got, state);
        if (!ref) { ref = got; continue; }
        expectSameAnchors(ref, got, `opts4 -> ${state}`, [...STABLE, "firstTabletTop"]);
      }
    });

    test("a broken asset reserves exactly the box a loaded one does", async ({ page }) => {
      for (const state of ["media", "abilityCost", "matchup", "placeholder"]) {
        const loaded = await load(page, `q=${state}${vp.frame}`);
        const broken = await load(page, `q=${state}&broken=1${vp.frame}`);
        expectSameAnchors(loaded, broken, `${state} loaded -> broken`, [...STABLE, "firstTabletTop"]);
      }
    });

    for (const s of SEQUENCES) {
      test(`live: ${s.name}, through every reveal`, async ({ page }) => {
        await playSequence(page, `sfx=1&evlen=96&seq=${s.seq.join(",")}${vp.frame}`, s.seq);
      });
    }

    test("Stat Check shares the shell, and its level slot holds still", async ({ page }) => {
      const quiz = await load(page, `q=opts4${vp.frame}`);
      const slot: number[][] = [];
      for (const lvl of ["&mrlvl=11", "", "&mrlvl=20"]) {
        await page.goto(probeUrl(`q=metareflex${lvl}${vp.frame}`));
        await page.waitForSelector('[data-testid="mr-level-slot"]', { state: "attached" });
        await page.waitForTimeout(900);
        const mr = await page.evaluate(() => {
          const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top;
          const folio = document.querySelector('[data-testid="ranked-question"]')!.getBoundingClientRect();
          const tl = document.querySelector('[data-testid="ranked-round-timeline"]')?.getBoundingClientRect();
          return {
            folioTop: folio.top, folioBottom: folio.bottom,
            timelineTop: tl && tl.height > 0 ? tl.top : null,
            slot: [top('[data-testid="mr-level-slot"]'),
              top('[data-testid="mr-level-slot"] + *'),
              top('[data-testid="mr-surface"] button')],
          };
        });
        // quiz -> Stat Check -> quiz: the shell is the same box either side.
        for (const k of ["folioTop", "folioBottom", "timelineTop"] as const) {
          const a = quiz[k]; const b = mr[k];
          if (a === null || b === null) { expect(b).toBe(a); continue; }
          expect(Math.abs(b - a), `Stat Check moved the ${k}`).toBeLessThanOrEqual(TOL);
        }
        slot.push(mr.slot);
      }
      // SC-RENAME3's certification, re-run: LVL 11 -> none -> LVL 20.
      for (const s of slot.slice(1)) {
        s.forEach((v, i) => expect(Math.abs(v - slot[0][i]), "the Stat Check slot moved")
          .toBeLessThanOrEqual(TOL));
      }
    });
  });
}

/**
 * THE DAILY, HOSTED THE WAY `DailyRunPage` HOSTS IT, ONE STAGE RULESET AT A
 * TIME. Time Trial and Survival are rapid-recall rulesets (bank / strikes in
 * the chrome); Standard is also what a Review stage plays. Each is its own
 * mode, so each is held to its OWN anchors through a hostile live sequence.
 */
const DAILY_MODES = [
  { name: "Daily · Standard / Review", q: "host=daily&ruleset=standard" },
  { name: "Daily · Time Trial", q: "host=daily&ruleset=time_trial" },
  { name: "Daily · Survival", q: "host=daily&ruleset=survival" },
];
for (const vp of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[7]]) {
  test.describe(`${vp.w}x${vp.h} — Daily stages`, () => {
    test.use({
      viewport: { width: vp.w, height: vp.h },
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    });
    for (const mode of DAILY_MODES) {
      test(`${mode.name}: compact -> extreme labels -> real SSM 218 -> family, through every reveal`, async ({ page }) => {
        const seq = ["opts4", "shape.76.4.150.0", "ssm218", "family"];
        await playSequence(page, `${mode.q}&sfx=1&evlen=96&seq=${seq.join(",")}`, seq);
      });
    }
  });
}

/**
 * THE KNOWN HOLE, NAMED. The test ARENA1 shipped measured the folio and the
 * rail, and at 1880x900 those never moved — while the art top moved −27.6px
 * and the prompt and answers +20.4px between a rich round and a compact one.
 */
test.describe("1880x900 — rich -> compact -> rich (the QV1 hole)", () => {
  test.use({ viewport: { width: 1880, height: 900 } });
  test("holds the media region, the prompt and the answers still", async ({ page }) => {
    const rich = await load(page, "q=abilityCost");
    const compact = await load(page, "q=opts4");
    const richAgain = await load(page, "q=media");
    expect([rich.band, compact.band, richAgain.band]).toEqual(["cinematic", "compact", "cinematic"]);
    // And the rich allocation QV1 bought is still there: 19rem of art.
    expect(Math.round(rich.mediaBottom! - rich.mediaTop!)).toBe(304);
    expectSameAnchors(rich, compact, "rich -> compact", [...STABLE, "firstTabletTop"]);
    expectSameAnchors(rich, richAgain, "rich -> compact -> rich", [...STABLE, "firstTabletTop"]);
  });
});

/**
 * THE THREE RESIDUALS VISCONT1's FIRST PASS LEFT, BY NAME — each reproduced
 * with the fixture that showed it, and each now held to zero.
 */
test.describe("residual 1 — desktop p99/extreme four-answer rounds (was −38px)", () => {
  for (const [w, h] of [[1880, 900], [1280, 800], [1024, 768]] as const) {
    test.describe(`${w}x${h}`, () => {
      test.use({ viewport: { width: w, height: h } });
      test("long labels tighten inside the answer box; nothing above moves", async ({ page }) => {
        const ref = await load(page, "q=opts4");
        for (const state of ["realP99", "realMax", "shape.76.4.60.0"]) {
          const got = await load(page, roundQuery(state));
          expect(got.answerDensity, `${state} was not classified as long text`).not.toBe("normal");
          expectSeated(got, state);
          expectSameAnchors(ref, got, state, [...STABLE, "firstTabletTop"]);
          // The art keeps its whole allocation: it is the TEXT that paid.
          expect(Math.abs((got.mediaBottom! - got.mediaTop!) - (ref.mediaBottom! - ref.mediaTop!)))
            .toBeLessThanOrEqual(TOL);
        }
      });
    });
  }
});

test.describe("residual 2 — phone prompts past four lines (was 25.7px)", () => {
  for (const [w, h] of [[375, 812], [360, 740]] as const) {
    test.describe(`${w}x${h}`, () => {
      test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      test("a long prompt tightens inside the prompt box; the card does not re-centre", async ({ page }) => {
        const ref = await load(page, "q=opts4&frame=0");
        for (const state of ["family", "shape.20.4.188.1", "shape.20.4.140.1", "stressA"]) {
          const got = await load(page, `${roundQuery(state)}&frame=0`);
          expect(got.promptDensity, `${state} was not classified as a long prompt`).not.toBe("normal");
          expectSeated(got, state);
          expectSameAnchors(ref, got, state, [...STABLE, "firstTabletTop"]);
        }
      });
    });
  }
});

test.describe("residual 3 — phone reveals where the first pass gave the slot back (was ~12px)", () => {
  for (const [w, h] of [[375, 812], [360, 740]] as const) {
    test.describe(`${w}x${h}`, () => {
      test.use({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      test("a four-long-answer round and a short phone reveal into the held slot", async ({ page }) => {
        const seq = ["realMax", "stressA", "shape.76.4.188.0", "opts2"];
        await playSequence(page, `sfx=1&evlen=96&seq=${seq.join(",")}&frame=0`, seq);
      });
    });
  }
});

/**
 * VISCONT1-SSM — PHASE 1 RELEASE CERTIFICATION B1, BY NAME. Real
 * `ssm.combined.<SPELL>.<rune>+<item>` Mastery prompts in their old wording
 * ("Exhaust has a 240-second base cooldown. You are running Cosmic Insight
 * (18 summoner spell haste) and Crimson Lucidity …") are 212–228 characters,
 * past the bank's 188. On the RC they moved the art and the answers 6–31px
 * (1880x900: −31px of art). The backend is shortening this copy in parallel;
 * this stays regardless — it is the frontend's half of defence in depth.
 */
test.describe("B1 — real ssm.combined prompts past the bank (was up to −31px)", () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.w}x${vp.h}`, () => {
      test.use({
        viewport: { width: vp.w, height: vp.h },
        ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
      });
      test("212–228-character prompts tighten inside the prompt box; the arena holds", async ({ page }) => {
        const ref = await load(page, `q=opts4${vp.frame}`);
        for (const state of ["ssm212", "ssm218", "ssm224", "ssm228"]) {
          const got = await load(page, `q=${state}${vp.frame}`);
          expect(got.promptDensity, `${state} was not classified past the bank`).toBe("extended");
          expectSeated(got, state);
          expectSameAnchors(ref, got, state, [...STABLE, "firstTabletTop"]);
          // The art keeps its whole allocation: it is the TEXT that paid.
          if (ref.mediaTop !== null) {
            expect(Math.abs((got.mediaBottom! - got.mediaTop!) - (ref.mediaBottom! - ref.mediaTop!)))
              .toBeLessThanOrEqual(TOL);
          }
          // The readable floor: 15px on a phone, 16px on a desktop.
          expect(got.promptPx).toBeGreaterThanOrEqual(vp.phone ? 15 : 16);
        }
      });
    });
  }
});

/**
 * VISCONT1-F1 — PHASE 1 FINAL CERTIFICATION F1, BY NAME. Real item-graph
 * rounds whose option labels sit beside the canonical inline item icon: "Which
 * item is a component of Dead Man's Plate?" (24-character "Ionian Boots of
 * Lucidity") and "What can Giant's Belt build into?" (19-character "Chempunk
 * Chainsword"). The tier read characters only, the fixed icon slot took 36px
 * of label width, the label wrapped, the tablets grew 42.4 -> 66.8px and the
 * arena moved 14.2px at 1280x800 (10.2px at 1440x900). Each real round runs
 * beside its TEXT-ONLY twin (same characters, no icon), and the media tier's
 * boundary is pinned from both sides (15 | 16 and 27 | 28 characters with
 * the icon), plus a 3-answer set and a longer (34) icon label.
 */
test.describe("F1 — option labels beside inline option media (was −14.2px at 1280)", () => {
  const F1 = [
    { state: "f1ChempunkText", density: "normal" },
    { state: "f1Chempunk", density: "long" },
    { state: "f1IonianText", density: "long" },
    { state: "f1Ionian", density: "long" },
    { state: "f1Locket", density: "long" },
    { state: "shape.15.4.60.1.1", density: "normal" },
    { state: "shape.16.4.60.1.1", density: "long" },
    { state: "shape.27.4.60.1.1", density: "long" },
    { state: "shape.28.4.60.1.1", density: null },
    { state: "shape.34.4.60.1.1", density: "dense" },
    { state: "shape.24.3.60.1.1", density: "long" },
  ];
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.w}x${vp.h}`, () => {
      test.use({
        viewport: { width: vp.w, height: vp.h },
        ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
      });
      test("icon-bearing labels tighten inside the answer box; the arena holds", async ({ page }) => {
        const ref = await load(page, `q=opts4${vp.frame}`);
        for (const { state, density } of F1) {
          const got = await load(page, `${roundQuery(state)}${vp.frame}`);
          expect(got.band, `${state} drew the wrong profile`).toBe(profileOf(state));
          const icons = await page.locator('[data-surface-region="answers"] [data-option-media]').count();
          expect(icons, `${state}: option media presence`).toBe(state.endsWith("Text") ? 0 : got.tablets);
          // Geometry first, so a regression reports the movement it causes.
          expectSeated(got, state);
          expectSameAnchors(ref, got, state, [...STABLE, "firstTabletTop"]);
          expect(Math.abs((got.mediaBottom! - got.mediaTop!) - (ref.mediaBottom! - ref.mediaTop!)),
            `${state}: the art gave up height`).toBeLessThanOrEqual(TOL);
          if (density) expect(got.answerDensity, `${state} tier`).toBe(density);
        }
      });
    });
  }
});
