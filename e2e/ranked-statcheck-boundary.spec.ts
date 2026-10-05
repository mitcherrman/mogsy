/**
 * SCBS1 — THE ARENA HOLDS STILL AT BOTH ENDS OF A STAT CHECK BLOCK, MEASURED.
 *
 * Production playtesting saw the whole Arena shift when a Stat Check block
 * opened (its first card) and again when it closed (its last card and the
 * module after it), while the cards in between were steady. The VISCONT1
 * continuity spec could not see it: it compares ONE static Stat Check card to a
 * quiz round, so no boundary was ever crossed, and on a phone it reads the
 * desktop rail, which is `display: none` there.
 *
 * This walks the REAL `QuizRankedMatch` (real controller, real arena, real
 * Stat Check viewport) through a block, one server snapshot per step, via the
 * shell probe's `?mrlive=1` script (`statCheckLiveScript.ts`):
 *
 *   pre-first (a quiz round) -> loading -> starting -> first card -> its reveal
 *   -> a middle card -> its reveal -> the final card -> its reveal -> the wait
 *   -> completion (the next quiz round)
 *
 * and holds, to rounding noise:
 *   1. the ARENA's anchors — the match box, header strip, focus column, folio,
 *      the Module Rail (desktop strip / phone bottom bar) — fixed across EVERY
 *      step, quiz to Stat Check to quiz;
 *   2. the STAT CHECK surface — its box, its header, level slot, card row and
 *      status line — fixed across every phase of the block;
 *   3. nothing clipped, nothing scrolled, no horizontal overflow;
 * sampling every frame of every transition, not only the settled ends.
 *
 *   npx playwright test -c playwright.arena.config.ts ranked-statcheck-boundary
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

const probeUrl = (frame: string) => `/dev/ranked-shell-probe?q=opts4&mrlive=1&lol=1${frame}`;

/** Rounding noise only; a real reflow is whole pixels. */
const TOL = 0.5;

const STEPS = [
  "pre-first", "loading", "starting", "first", "first-reveal", "middle",
  "middle-reveal", "final", "final-reveal", "waiting", "completion",
] as const;
type StepName = (typeof STEPS)[number];

type Box = { t: number; b: number; l: number; r: number; h: number; w: number };
type Frame = {
  /** The arena's own anchors: present in every step, quiz and Stat Check alike. */
  arena: Record<string, Box | null>;
  /** The Stat Check surface, when it is mounted. */
  surface: Box | null;
  slots: Record<string, Box | null>;
  pageScroll: number; pageScrollX: number;
  clipped: string[];
  /** Which step the DOM currently is, by what is on screen. */
  landed: StepName | null;
  progress: string | null;
  statusText: string | null;
};

const MEASURE = (): Frame => {
  const q = (s: string) => document.querySelector(s) as HTMLElement | null;
  const tid = (id: string) => q(`[data-testid="${id}"]`);
  const box = (el: Element | null): Box | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // Not on this layout (e.g. the desktop rail on a phone is `display: none`).
    if (r.width === 0 && r.height === 0) return null;
    return { t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height, w: r.width };
  };
  const surface = tid("mr-surface");
  const prompt = q('[data-surface-region="prompt"]');
  const progress = tid("mr-progress")?.textContent ?? null;
  const phase = tid("mr-block")?.getAttribute("data-phase") ?? null;
  const waiting = tid("mr-waiting");
  const status = tid("mr-status")?.textContent ?? waiting?.querySelector("[role=status]")?.textContent ?? null;

  let landed: StepName | null = null;
  if (tid("mr-loading")) landed = "loading";
  else if (tid("mr-starting")) landed = "starting";
  else if (phase === "answer") {
    landed = progress?.startsWith("1 /") ? "first" : progress?.startsWith("3 /") ? "middle"
      : progress?.startsWith("5 /") ? "final" : null;
  } else if (phase === "reveal") {
    landed = progress?.startsWith("1 /") ? "first-reveal" : progress?.startsWith("3 /") ? "middle-reveal" : null;
  } else if (waiting) {
    landed = /Both players are done/.test(waiting.textContent ?? "") ? "waiting" : "final-reveal";
  } else if (prompt && !surface) {
    landed = "pre-first"; // the quiz — resolved to pre-first / completion by the caller
  }

  // Everything the Stat Check surface seats must sit inside the box it was given.
  const clipped: string[] = [];
  if (surface) {
    const s = surface.getBoundingClientRect();
    const folio = tid("ranked-question")?.getBoundingClientRect();
    for (const el of surface.querySelectorAll<HTMLElement>(
      '[data-testid^="mr-choice-"], [data-testid="mr-prompt"], [data-testid="mr-progress"]')) {
      if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== "visible") {
        clipped.push(`${el.dataset.testid}: scrollHeight ${el.scrollHeight} > ${el.clientHeight}`);
      }
      const r = el.getBoundingClientRect();
      if (r.bottom > s.bottom + 0.5 || r.top < s.top - 0.5) {
        clipped.push(`${el.dataset.testid} sits outside the surface (${r.top.toFixed(1)}-${r.bottom.toFixed(1)} vs ${s.top.toFixed(1)}-${s.bottom.toFixed(1)})`);
      }
    }
    if (folio && (s.top < folio.top - 0.5 || s.bottom > folio.bottom + 0.5)) {
      clipped.push(`the surface (${s.top.toFixed(1)}-${s.bottom.toFixed(1)}) is outside the folio (${folio.top.toFixed(1)}-${folio.bottom.toFixed(1)})`);
    }
  }

  return {
    arena: {
      match: box(tid("ranked-match")),
      header: box(tid("ranked-header")),
      focusColumn: box(tid("ranked-focus-column")),
      folio: box(tid("ranked-question")),
      // The Module Rail: the desktop strip, and the phone's bottom bar with the
      // two slots it hosts the dock's tabs in and the timeline between them.
      rail: box(tid("ranked-round-timeline")),
      bar: box(tid("ranked-mobile-bottombar")),
      barLeftSlot: box(tid("ranked-mobile-bottombar-left")),
      barRightSlot: box(tid("ranked-mobile-bottombar-right")),
      barRail: box(tid("mobile-ranked-round-timeline")),
    },
    surface: box(surface),
    slots: {
      progress: box(tid("mr-progress")),
      levelSlot: box(tid("mr-level-slot")),
      promptSlot: box(tid("mr-prompt-slot")),
      cardRow: box(tid("mr-card-row")),
      statusSlot: box(tid("mr-status-slot")),
      // The two choices exist only where a card is drawn (not loading/starting).
      choiceLeft: box(tid("mr-choice-left")),
      choiceRight: box(tid("mr-choice-right")),
    },
    pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    pageScrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clipped,
    landed,
    progress,
    statusText: status,
  };
};

/** Every number the two boxes disagree on, as readable text. */
function diffBox(a: Box | null, b: Box | null, edges: (keyof Box)[] = ["t", "b", "l", "r"]): string[] {
  if (a === null || b === null) return a === b ? [] : [`presence ${a ? "yes" : "no"} -> ${b ? "yes" : "no"}`];
  return edges.filter((e) => Math.abs(a[e] - b[e]) > TOL)
    .map((e) => `${e} ${a[e].toFixed(1)} -> ${b[e].toFixed(1)} (${(b[e] - a[e]).toFixed(1)})`);
}

function expectSameArena(ref: Frame, got: Frame, what: string) {
  for (const k of Object.keys(ref.arena)) {
    // The desktop rail carries a moving current-marker INSIDE the same box; the
    // box is what is held. `diffBox` compares the box only.
    const d = diffBox(ref.arena[k], got.arena[k]);
    expect(d, `${what}: arena anchor "${k}" moved — ${d.join("; ")}`).toEqual([]);
  }
  expect(got.pageScroll, `${what}: the page scrolls vertically`).toBeLessThanOrEqual(0);
  expect(got.pageScrollX, `${what}: the page overflows horizontally`).toBeLessThanOrEqual(0);
}

/** Wait for `step` to be on screen, sampling every frame on the way. */
async function advanceTo(page: Page, step: StepName, frames: Frame[]) {
  const target = STEPS.indexOf(step);
  if (target > 0) await page.click('[data-testid="probe-mr-advance"]', { force: true });
  let landedAt = -1;
  for (let i = 0; i < 220; i++) {
    await page.waitForTimeout(50);
    const f = await page.evaluate(MEASURE);
    frames.push(f);
    const here = step === "pre-first" || step === "completion"
      ? f.landed === "pre-first" : f.landed === step;
    if (here && landedAt < 0) landedAt = i;
    // Keep sampling for a beat after it lands: entrances, reveal holds.
    if (landedAt >= 0 && i - landedAt >= 24) return;
  }
  throw new Error(`step "${step}" never landed (last: ${JSON.stringify(frames.at(-1)?.landed)})`);
}

const VIEWPORTS = [
  { w: 1280, h: 800, frame: "", phone: false },
  { w: 375, h: 812, frame: "&frame=0", phone: true },
  { w: 1920, h: 1080, frame: "", phone: false },
  { w: 360, h: 740, frame: "&frame=0", phone: true },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.w}x${vp.h}`, () => {
    test.use({
      viewport: { width: vp.w, height: vp.h },
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    });

    test("the Arena and the Stat Check surface hold still from the first boundary to the last", async ({ page }) => {
      await page.goto(probeUrl(vp.frame));
      await page.waitForSelector('[data-testid="ranked-question"]');
      await page.waitForSelector('[data-surface-region="prompt"]');
      await page.waitForTimeout(1500);

      const settled: Partial<Record<StepName, Frame>> = {};
      const all: { step: StepName; frames: Frame[] }[] = [];
      for (const step of STEPS) {
        const frames: Frame[] = [];
        await advanceTo(page, step, frames);
        all.push({ step, frames });
        settled[step] = frames.at(-1)!;
      }

      const ref = settled["pre-first"]!;

      // SCBS1_REPORT=<prefix>: write the measured movement of every anchor in
      // every step (worst sampled frame against the reference) before any
      // assertion, so a failing run still leaves the whole table behind.
      if (process.env.SCBS1_REPORT) {
        const first0 = settled.first!;
        const rows: Record<string, Record<string, number>> = {};
        for (const { step, frames } of all) {
          const row: Record<string, number> = {};
          const note = (name: string, a: Box | null, b: Box | null) => {
            if (!a || !b) { if (!!a !== !!b && !name.startsWith("slot.choice")) row[name] = Math.max(row[name] ?? 0, 999); return; }
            for (const e of ["t", "b", "l", "r"] as const) {
              const m = Math.abs(b[e] - a[e]);
              row[`${name}.${e}`] = Math.max(row[`${name}.${e}`] ?? 0, m);
            }
          };
          for (const f of frames) {
            for (const k of Object.keys(ref.arena)) note(k, ref.arena[k], f.arena[k]);
            if (f.surface) {
              note("surface", first0.surface, f.surface);
              for (const k of Object.keys(first0.slots)) note(`slot.${k}`, first0.slots[k], f.slots[k]);
            }
            row.pageScroll = Math.max(row.pageScroll ?? 0, f.pageScroll);
          }
          rows[step] = row;
        }
        writeFileSync(`${process.env.SCBS1_REPORT}.${vp.w}x${vp.h}.json`,
          JSON.stringify({ rows, settled }, null, 1));
      }

      // 1. THE ARENA — every sampled frame of every transition, against the
      //    quiz round the block opened from.
      for (const { step, frames } of all) {
        frames.forEach((f, i) => expectSameArena(ref, f, `${step} frame ${i}`));
      }

      // 2. THE STAT CHECK SURFACE — one box for every phase of the block, and
      //    one set of slots in every phase (the frame's four, plus the two
      //    choices wherever a card is drawn), in every sampled frame.
      const first = settled.first!;
      const stat = STEPS.filter((s) => s !== "pre-first" && s !== "completion");
      const FRAME_SLOTS = ["progress", "levelSlot", "promptSlot", "cardRow", "statusSlot"];
      for (const { step, frames } of all) {
        if (!stat.includes(step)) continue;
        for (const [i, f] of frames.entries()) {
          if (!f.surface) continue; // a transitional frame between two phases
          const d = diffBox(first.surface, f.surface);
          expect(d, `${step} frame ${i}: the Stat Check surface moved — ${d.join("; ")}`).toEqual([]);
          for (const slot of FRAME_SLOTS) {
            const sd = diffBox(first.slots[slot], f.slots[slot]);
            expect(sd, `${step} frame ${i}: Stat Check slot "${slot}" moved — ${sd.join("; ")}`).toEqual([]);
          }
          if (f.slots.choiceLeft) {
            for (const slot of ["choiceLeft", "choiceRight"]) {
              const sd = diffBox(first.slots[slot], f.slots[slot]);
              expect(sd, `${step} frame ${i}: Stat Check "${slot}" moved — ${sd.join("; ")}`).toEqual([]);
            }
          }
        }
      }

      // 3. NOTHING CLIPPED, in any frame.
      for (const { step, frames } of all) {
        for (const [i, f] of frames.entries()) {
          expect(f.clipped, `${step} frame ${i}: clipped content`).toEqual([]);
        }
      }
    });

    test("a Stat Check card still answers, reveals, advances and completes", async ({ page }) => {
      await page.goto(probeUrl(vp.frame));
      await page.waitForSelector('[data-surface-region="prompt"]');
      await page.waitForTimeout(1500);
      const sink: Frame[] = [];
      for (const step of ["loading", "starting", "first"] as const) await advanceTo(page, step, sink);

      // Answering: the click reaches the accepted-command boundary and locks the card.
      await expect(page.getByTestId("mr-choice-left")).toBeEnabled();
      await page.getByTestId("mr-choice-left").click({ force: true });
      await expect(page.getByTestId("mr-status")).toHaveText("Locked in — next card…");
      await expect(page.getByTestId("mr-choice-left")).toBeDisabled();

      // Reveal: the server's correct side is marked, and the card cannot be answered.
      await advanceTo(page, "first-reveal", sink);
      await expect(page.getByTestId("mr-block")).toHaveAttribute("data-phase", "reveal");
      await expect(page.getByTestId("mr-choice-left")).toHaveAttribute("data-reveal", "correct");
      await expect(page.getByTestId("mr-choice-left")).toBeDisabled();

      // Next: the block moves on to the card the server names, answerable again.
      await advanceTo(page, "middle", sink);
      await expect(page.getByTestId("mr-progress")).toHaveText("3 / 5");
      await expect(page.getByTestId("mr-choice-left")).toBeEnabled();

      for (const step of ["middle-reveal", "final", "final-reveal", "waiting"] as const) {
        await advanceTo(page, step, sink);
      }
      await expect(page.getByTestId("mr-waiting")).toContainText("Both players are done");

      // Completion: the block settles, and the arena is the ordinary quiz again.
      await advanceTo(page, "completion", sink);
      await expect(page.getByTestId("mr-surface")).toHaveCount(0);
      await expect(page.locator('[data-surface-region="prompt"]')).toBeVisible();
      await expect(page.locator('[data-surface-region="answers"] [data-quiz-choice]').first()).toBeVisible();
    });
  });
}
