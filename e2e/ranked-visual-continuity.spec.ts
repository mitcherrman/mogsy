/**
 * VISCONT1 — VISUAL CONTINUITY IS AN ARENA INVARIANT, MEASURED.
 *
 * Within one arena mode and one viewport, changing the QUESTION must not move
 * the coordinates a player's eyes and cursor track: the folio, the media
 * region, the prompt, the answer grid, the first tablet and the Module Rail.
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
 * So this file measures boxes in a real browser, through the real arena
 * (`/dev/ranked-shell-probe`, which mounts the production `QuizRankedMatch`),
 * across the hostile transitions the owner named: compact <-> cinematic,
 * single champion <-> two-champion Matchup, family <-> champion <->
 * environment, premise media <-> option-media only, 2 <-> 4 options, option
 * icons <-> none, a broken asset, Stat Check, and — in ONE mount, through the
 * live controller — question -> reveal -> next question.
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-visual-continuity
 */
import { expect, test, type Page } from "@playwright/test";

// A matrix test loads up to 24 rounds and a live test samples every reveal
// frame; the config's 60s is a single-page budget.
test.describe.configure({ timeout: 240_000 });

/** Rounding noise only; a real reflow is whole pixels. */
const TOL = 0.5;

type Anchors = {
  band: string;
  folioTop: number; folioBottom: number;
  mediaTop: number | null; mediaBottom: number | null;
  promptTop: number; answersTop: number; firstTabletTop: number;
  timelineTop: number | null;
  inputOpen: boolean; evidence: boolean; tablets: number;
  matchup: boolean; pageScroll: number;
};

const MEASURE = (): Anchors => {
  const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
  const folio = stage.getBoundingClientRect();
  const media = box('[data-surface-region="media"]');
  const timeline = box('[data-testid="ranked-round-timeline"]');
  const hero = document.querySelector('[data-testid="scenario-hero"]');
  return {
    band: (document.querySelector('[data-testid="scenario-surface"]') as HTMLElement | null)
      ?.dataset.band ?? "-",
    folioTop: folio.top, folioBottom: folio.bottom,
    mediaTop: media?.top ?? null, mediaBottom: media?.bottom ?? null,
    promptTop: box('[data-surface-region="prompt"]')!.top,
    answersTop: box('[data-surface-region="answers"]')!.top,
    firstTabletTop: box('[data-surface-region="answers"] [data-quiz-choice]')!.top,
    // The phone arena moves the rail into its bottom bar (`display: none`
    // here), so a zero-size box is "not on this layout", not a coordinate.
    timelineTop: timeline && timeline.height > 0 ? timeline.top : null,
    inputOpen: stage.dataset.inputOpen === "true",
    evidence: document.querySelector('[data-testid="answer-evidence"]') !== null,
    tablets: document.querySelectorAll('[data-surface-region="answers"] [data-quiz-choice]').length,
    // Both sides and the seam between them (the card's text runs together:
    // "MatchupVSAhriSyndra…").
    matchup: ["VS", "Ahri", "Syndra"].every((t) => (hero?.textContent ?? "").includes(t)),
    pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
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

/** Wait until the tablets' entrance stagger has settled (two equal samples). */
async function settled(page: Page): Promise<Anchors> {
  let last = await page.evaluate(MEASURE);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    const next = await page.evaluate(MEASURE);
    if (next.inputOpen && Math.abs(next.firstTabletTop - last.firstTabletTop) < 0.05
      && next.band === last.band) return next;
    last = next;
  }
  return last;
}

async function load(page: Page, query: string): Promise<Anchors> {
  await page.goto(`/dev/ranked-shell-probe?${query}`);
  await page.waitForSelector('[data-testid="scenario-surface"]');
  await page.waitForTimeout(600);
  return settled(page);
}

/** Probe states, with the profile each one must actually draw. */
const PROFILE: Record<string, string> = {
  opts4: "compact", opts2: "compact", placeholder: "compact", twoChamp: "compact",
  jungleRule: "compact", media: "cinematic", abilityCost: "cinematic",
  matchup: "cinematic", minionWave: "cinematic", spellCooldown: "cinematic",
  junglePet: "cinematic", family: "family",
};

/**
 * Ordinary rounds: every content class the owner named, at real-corpus sizes.
 * `family` is the RA7 fixture, whose prompt is 192 characters (4 above the
 * bank's 188 maximum); it is ordinary on a desktop and is the documented
 * phone exception below.
 */
const ORDINARY = ["opts4", "opts2", "placeholder", "twoChamp", "jungleRule", "media",
  "abilityCost", "matchup", "minionWave", "spellCooldown", "junglePet", "family"];

const VIEWPORTS = [
  // The phone, through the production frame (`?frame=0`), as RMOB2 measures it.
  { w: 375, h: 812, frame: "&frame=0", phone: true },
  { w: 1024, h: 768, frame: "", phone: false },
  { w: 1280, h: 800, frame: "", phone: false },
  // The wide-desktop QV1 tier in its lock regime and in its tall regime.
  { w: 1600, h: 780, frame: "", phone: false },
  { w: 1880, h: 900, frame: "", phone: false },
] as const;

/**
 * THE LIVE SEQUENCES. `?sfx=1&seq=` serves one probe state per round and
 * settles each round with a correct option and an evidence line, so each
 * advance is a real settlement -> reveal beat -> next round inside ONE mount
 * of the arena — the controller, the reveal hold and the frozen surface are
 * all the production ones.
 */
const SEQUENCES = [
  { name: "rich -> compact -> rich, single champion -> Matchup",
    seq: ["abilityCost", "opts4", "matchup", "opts4"] },
  { name: "premise media -> option-media only -> premise, 4 -> 2 options, icons -> none",
    seq: ["media", "placeholder", "twoChamp", "opts2"] },
  { name: "family -> champion -> environment -> compact",
    seq: ["family", "abilityCost", "minionWave", "jungleRule"] },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.w}x${vp.h}`, () => {
    test.use({
      viewport: { width: vp.w, height: vp.h },
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    });

    test("every ordinary content class lands on the same anchors", async ({ page }) => {
      const set = vp.phone ? ORDINARY.filter((s) => s !== "family") : ORDINARY;
      let ref: Anchors | null = null;
      for (const state of set) {
        const got = await load(page, `q=${state}${vp.frame}`);
        expect(got.band, `${state} drew the wrong profile`).toBe(PROFILE[state]);
        if (state === "matchup") expect(got.matchup, "the Matchup card did not render").toBe(true);
        expect(got.pageScroll, `${state} scrolls the page`).toBe(0);
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

    for (const sequence of SEQUENCES) {
      // On the phone the RA7 family fixture is the documented exception (its
      // 192-character prompt overflows the phone's four-line reserve), so the
      // item card stands in for "item/family" there.
      const s = vp.phone
        ? { ...sequence, seq: sequence.seq.map((q) => (q === "family" ? "media" : q)) }
        : sequence;
      test(`live: ${s.name}, through every reveal`, async ({ page }) => {
        await page.goto(`/dev/ranked-shell-probe?sfx=1&seq=${s.seq.join(",")}${vp.frame}`);
        await page.waitForSelector('[data-testid="scenario-surface"]');
        // Step 1 converts the canned hp match to the points match the rest of
        // the sequence plays (the opponent has answered); measure from there,
        // because hp -> points is a different MODE, not a transition a player
        // can see inside one match.
        await page.click('[data-testid="probe-sfx-advance"]');
        await page.waitForFunction(() => /\(1\/5\)/.test(
          document.querySelector('[data-testid="probe-sfx-advance"]')?.textContent ?? ""));
        // The points snapshot lands on the controller's next read; let it.
        await page.waitForTimeout(1500);
        const ref = await settled(page);
        expect(ref.band).toBe(PROFILE[s.seq[0]]);
        let reveals = 0;
        for (let round = 2; round <= s.seq.length; round++) {
          await page.click('[data-testid="probe-sfx-advance"]');
          // Sample through the whole beat: settlement, the reveal hold (input
          // shut, correct tablet lit, evidence line mounted), the module title
          // and the next round's entrance. EVERY sample is held to the anchors.
          for (let i = 0; i < 30; i++) {
            await page.waitForTimeout(80);
            const now = await page.evaluate(MEASURE);
            if (!now.inputOpen && now.evidence) reveals++;
            expectSameAnchors(ref, now, `round ${round - 1} -> ${round} (+${(i + 1) * 80}ms)`);
          }
          const next = await settled(page);
          expect(next.band, `round ${round} drew the wrong profile`).toBe(PROFILE[s.seq[round - 1]]);
          if (s.seq[round - 1] === "matchup") expect(next.matchup).toBe(true);
          expectSameAnchors(ref, next, `round ${round} settled`, [...STABLE, "firstTabletTop"]);
        }
        // The reveal state was genuinely exercised, not skipped between samples.
        expect(reveals, "no sampled frame was a disclosed reveal").toBeGreaterThan(0);
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
 * THE KNOWN HOLE, NAMED. The test ARENA1 shipped measured the folio and the
 * rail, and at 1880x900 those never moved — while the art top moved −27.6px
 * and the prompt and answers +20.4px between a rich round and a compact one.
 * This is that case, by itself, so a regression points straight at it.
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
 * THE EXCEPTIONS, STATED AS WHAT THEY ARE. These rounds genuinely do not fit
 * the per-viewport reserves, and the contract says what then moves: never the
 * folio, the rail or the art's top — only what is below the overflowing
 * region (desktop: the art yields first; phone: the stack re-centres by half
 * the overflow). Asserted so the exception cannot quietly widen.
 */
test.describe("exceptions: content that genuinely exceeds the reserve", () => {
  test.describe("1880x900", () => {
    test.use({ viewport: { width: 1880, height: 900 } });
    test("long-label rounds yield art, never the folio, the rail or the art top", async ({ page }) => {
      const ref = await load(page, "q=opts4");
      for (const state of ["realP99", "realMax"]) {
        const got = await load(page, `q=${state}`);
        expectSameAnchors(ref, got, state, ["folioTop", "folioBottom", "mediaTop", "timelineTop"]);
        // What moves is the art's FLOOR, upward, by the overflow only.
        expect(got.mediaBottom!).toBeLessThan(ref.mediaBottom!);
        expect(got.pageScroll).toBe(0);
      }
    });
  });
  test.describe("375x812", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    test("a six-line family prompt re-centres by half its overflow, no more", async ({ page }) => {
      const ref = await load(page, "q=opts4&frame=0");
      const fam = await load(page, "q=family&frame=0");
      expectSameAnchors(ref, fam, "family (phone)", ["folioTop", "folioBottom"]);
      const shift = ref.mediaTop! - fam.mediaTop!;
      expect(shift).toBeGreaterThan(0);
      // 6 lines + category (175.6px) against the phone's 4 lines + category
      // reserve (124px): two lines of overflow, half of which is taken above.
      expect(shift).toBeLessThanOrEqual(27);
    });
  });
});
