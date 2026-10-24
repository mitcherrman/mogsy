/**
 * QRT2 - the Ranked Mastery slice's atomic-recall rows and comparison duel tell
 * a graded answer in words, measured on a real layout.
 *
 * `/dev/ranked-shell-probe?q=masteryRecall|masteryCompare&mreveal=right|wrong|timeout`
 * mounts the real `QuizRankedMatch` with the server's own per-challenge reveal
 * held (`own_challenge_reveals`, plus `own_timed_out_challenges` for a timeout).
 *
 * Per viewport (360x640, 390x844, 1280x720):
 *   * atomic: the answer's row says "Correct answer", the player's row "Your
 *     pick" (the same row when right), a timeout has no pick tab; every tab is
 *     one line, inside the viewport and its row, off the row's label text, and
 *     not inside a live region; no row changes height between the open
 *     question and its reveal; the page scrolls no more than it did open;
 *   * comparison: the duel's tags read "Your pick" / "Correct answer" (never
 *     "Locked" / "Answer"), inside the viewport, and the accessible names say so;
 *   * nothing is tabbed before the reveal.
 *
 *   npx playwright test -c playwright.arena.config.ts e2e/qrt2-mastery-tablets.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { id: "360x640", w: 360, h: 640, phone: true },
  { id: "390x844", w: 390, h: 844, phone: true },
  { id: "1280x720", w: 1280, h: 720, phone: false },
] as const;

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
};

async function open(page: Page, state: string, mode: string | null) {
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`/dev/ranked-shell-probe?q=${state}&points=1${mode ? `&mreveal=${mode}` : ""}&frame=0&progression=0&lol=1`);
  await page.getByTestId("ranked-match").waitFor();
  const gotIt = page.getByRole("button", { name: "GOT IT" });
  await gotIt.waitFor({ state: "visible", timeout: 4_000 }).catch(() => undefined);
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="probe-short"]')?.parentElement;
    if (bar) bar.style.display = "none";
  });
  if (mode) await page.getByTestId("mastery-inline-reveal").waitFor();
  else await page.waitForSelector('[data-testid^="mastery-choice-row-"], [data-testid="duel-side-left"]');
  // The tablets enter on a staggered transform; measure after it settles.
  await page.waitForTimeout(1500);
}

const MEASURE_ROWS = () => {
  const r = (el: Element | null) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
  };
  const rows = [...document.querySelectorAll<HTMLElement>('[data-testid^="mastery-choice-row-"]')].map((row) => {
    const label = row.querySelector("label");
    // The label's own text, without the absolutely placed tab inside it.
    let text: Rect | null = null;
    const walker = document.createTreeWalker(label ?? row, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first && (first.textContent ?? "").trim()) {
      const range = document.createRange();
      range.selectNodeContents(first);
      text = r({ getBoundingClientRect: () => range.getBoundingClientRect() } as unknown as Element);
    }
    return {
      value: row.getAttribute("data-testid")!.replace("mastery-choice-row-", ""),
      tone: row.getAttribute("data-tone"),
      rect: r(row)!, text,
      tabs: [...row.querySelectorAll('[data-testid="answer-correct-tag"], [data-testid="answer-your-pick"]')]
        .map((t) => ({ id: t.getAttribute("data-testid")!, text: t.textContent ?? "", rect: r(t)! })),
      tabsInLive: !!row.querySelector('[data-testid="answer-result-tags"]')?.closest('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])'),
    };
  });
  return { vw: window.innerWidth, vh: window.innerHeight, rows,
    scroll: document.documentElement.scrollHeight - window.innerHeight,
    verdict: document.querySelector('[data-testid="mastery-verdict"]')?.getAttribute("data-verdict") ?? null };
};

const intersects = (a: Rect, b: Rect) =>
  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

for (const vp of VIEWPORTS) {
  test.describe(`Mastery tablets @ ${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1,
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}) });

    test("atomic rows: nothing tabbed before the reveal, and no row changes height after it", async ({ page }) => {
      await open(page, "masteryRecall", null);
      const before = await page.evaluate(MEASURE_ROWS);
      expect(before.rows.length).toBe(4);
      expect(before.rows.every((r) => r.tabs.length === 0)).toBe(true);
      await open(page, "masteryRecall", "wrong");
      const after = await page.evaluate(MEASURE_ROWS);
      expect(after.rows.map((r) => Math.round(r.rect.height))).toEqual(before.rows.map((r) => Math.round(r.rect.height)));
      // The reveal box is taller than the submit button it replaces, so a 640px
      // phone overflows by 12px with it. Measured identically on the base
      // (`df695ab1`, before this change): pinned there, 0 everywhere else.
      expect(after.scroll, "the reveal scrolls the page more than the base did")
        .toBeLessThanOrEqual(vp.id === "360x640" ? 12 : 0);
    });

    for (const mode of ["right", "wrong", "timeout"] as const) {
      test(`atomic rows, ${mode}: the answer and the pick are told in words`, async ({ page }) => {
        await open(page, "masteryRecall", mode);
        const s = await page.evaluate(MEASURE_ROWS);
        const answer = s.rows.find((r) => r.value === "11")!;
        expect(answer.tabs.map((t) => t.id)).toContain("answer-correct-tag");
        expect(answer.tabs.map((t) => t.text).join(" ")).toMatch(/Correct answer/);
        const picked = s.rows.filter((r) => r.tabs.some((t) => t.id === "answer-your-pick"));
        if (mode === "timeout") {
          expect(picked, "a timeout has no pick tab").toHaveLength(0);
          expect(s.verdict).toBe("timeout");
        } else {
          expect(picked.map((r) => r.value)).toEqual([mode === "right" ? "11" : "9"]);
          expect(s.verdict).toBe(mode === "right" ? "correct" : "incorrect");
        }
        expect(s.rows.flatMap((r) => r.tabs.filter((t) => t.id === "answer-correct-tag"))).toHaveLength(1);
        for (const [i, row] of s.rows.entries()) {
          for (const tab of row.tabs) {
            expect(tab.rect.height, `"${tab.text}" wrapped`).toBeLessThanOrEqual(20);
            expect(tab.rect.left).toBeGreaterThanOrEqual(row.rect.left - 0.5);
            expect(tab.rect.right).toBeLessThanOrEqual(row.rect.right + 0.5);
            expect(tab.rect.left).toBeGreaterThanOrEqual(-0.5);
            expect(tab.rect.right).toBeLessThanOrEqual(s.vw + 0.5);
            // On the row's top edge: it rises above the row and dips into it by a few px.
            expect(tab.rect.top).toBeLessThan(row.rect.top);
            if (row.text) expect(intersects(tab.rect, row.text), `tab over the label "${row.value}"`).toBe(false);
            if (i > 0) expect(intersects(tab.rect, s.rows[i - 1].rect), "tab over the row above").toBe(false);
          }
          if (row.tabs.length === 2) expect(intersects(row.tabs[0].rect, row.tabs[1].rect)).toBe(false);
          expect(row.tabsInLive).toBe(false);
        }
      });
    }

    for (const mode of ["right", "wrong"] as const) {
      test(`comparison duel, ${mode}: the tags read the arena's words`, async ({ page }) => {
        await open(page, "masteryCompare", mode);
        const tags = await page.evaluate(() => {
          const r = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height }; };
          return {
            vw: window.innerWidth,
            all: [...document.querySelectorAll('[data-testid^="duel-tag-"]')]
              .map((e) => ({ id: e.getAttribute("data-testid")!, text: (e.textContent ?? "").trim(), rect: r(e) })),
            labels: ["left", "right", "tie"].map((w) => document.querySelector(`[data-testid="duel-side-${w}"]`)?.getAttribute("aria-label") ?? ""),
            body: document.body.innerText,
          };
        });
        const answer = tags.all.find((t) => t.id.startsWith("duel-tag-answer"))!;
        const pick = tags.all.find((t) => t.id.startsWith("duel-tag-pick"))!;
        expect(answer.text).toBe("Correct answer");
        expect(pick.text).toBe("Your pick");
        expect(answer.id.endsWith("left")).toBe(true);
        expect(pick.id.endsWith(mode === "right" ? "left" : "right")).toBe(true);
        expect(tags.body).not.toMatch(/\bLocked\b/);
        for (const t of tags.all) {
          expect(t.rect.left).toBeGreaterThanOrEqual(-0.5);
          expect(t.rect.right).toBeLessThanOrEqual(tags.vw + 0.5);
        }
        expect(tags.labels[0]).toContain("correct answer");
        expect(tags.labels.join(" ")).toContain("your pick");
      });
    }
  });
}
