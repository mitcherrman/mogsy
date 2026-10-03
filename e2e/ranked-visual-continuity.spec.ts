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
 *   npx playwright test -c playwright.arena.config.ts ranked-visual-continuity
 */
import { expect, test, type Page } from "@playwright/test";

// A matrix test loads up to 24 rounds and a live test samples every reveal
// frame; the config's 60s is a single-page budget.
test.describe.configure({ timeout: 300_000 });

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
    textClipped: [h2, ...tablets].some((e) => e.scrollHeight > e.clientHeight + 1
      || e.scrollWidth > e.clientWidth + 1),
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
  const [alen, acount, plen, rich] = state.split(".").slice(1);
  return `q=shape&alen=${alen}&acount=${acount}&plen=${plen}&rich=${rich}`;
}

async function load(page: Page, query: string): Promise<Anchors> {
  await page.goto(`/dev/ranked-shell-probe?${query}`);
  await page.waitForSelector('[data-testid="scenario-surface"]');
  await page.waitForTimeout(600);
  return settled(page);
}

/** The profile each round must actually draw. */
function profileOf(state: string): string {
  if (state.startsWith("shape.")) return state.endsWith(".1") ? "cinematic" : "compact";
  return ({
    opts4: "compact", opts2: "compact", placeholder: "compact", twoChamp: "compact",
    jungleRule: "compact", realP99: "compact", realMax: "compact", media: "cinematic",
    abilityCost: "cinematic", matchup: "cinematic", minionWave: "cinematic",
    spellCooldown: "cinematic", junglePet: "cinematic", stressA: "cinematic",
    family: "family", stressB: "family",
  } as Record<string, string>)[state];
}

/**
 * Every round the arena must seat on ONE set of anchors, at every viewport:
 * each content class the owner named, and the long-text shapes that used to
 * be exceptions — p90 labels (`shape.32…`), the servable p99 and maximum
 * labels (`realP99`, `realMax`), the bank's longest label (76 characters), a
 * long prompt, the bank's longest prompt (188) on rich art with long labels,
 * the RS2 compound worst cases (`stressA`, `stressB`) and the 192-character
 * RA7 family fixture.
 */
const ORDINARY = [
  "opts4", "opts2", "placeholder", "twoChamp", "jungleRule", "media", "abilityCost",
  "matchup", "minionWave", "spellCooldown", "junglePet", "family",
  "shape.32.4.60.0", "realP99", "realMax", "shape.76.4.60.0", "shape.76.3.60.0",
  "shape.24.2.150.1", "shape.48.4.188.1", "stressA", "stressB",
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
];

async function playSequence(page: Page, query: string, expected: string[]) {
  await page.goto(`/dev/ranked-shell-probe?${query}`);
  await page.waitForSelector('[data-testid="scenario-surface"]');
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
        await page.goto(`/dev/ranked-shell-probe?q=metareflex${lvl}${vp.frame}`);
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
      test(`${mode.name}: compact -> extreme labels -> rich -> family, through every reveal`, async ({ page }) => {
        const seq = ["opts4", "shape.76.4.150.0", "abilityCost", "family"];
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
