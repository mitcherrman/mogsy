/**
 * PA2B — Pro Play Assembly through the REAL Ranked host, against a REAL local
 * backend (`pa2b/assembly-ranked-integration`), in a real browser.
 *
 * Nothing is mocked: the admin preset is joined through the frontend's own
 * `joinQueue` (the call `PresetLaunch` makes), the arena is `QuizRankedMatch →
 * CanonicalArena`, cards are seated with real pointer taps, the Lock goes over
 * HTTP, and the reveal is the server's. Each case ends its match with the real
 * forfeit route so the next case can start.
 *
 * Needs (and is SKIPPED without):
 *   PA2B_E2E_PERSONA  path to a persona JSON ({token, user, admin:false}) for an
 *                     account the local backend treats as the owner;
 *   a vite server with VITE_E2E_AUTH=1 pointing VITE_COMBAT_API_URL at that
 *   backend (baseURL from the Playwright config).
 *
 * Matrix: both families × six viewports × normal / reduced motion.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const PERSONA_PATH = process.env.PA2B_E2E_PERSONA;
const SHOTS = process.env.ASSEMBLY_SHOTS ?? null;
const LANES = ["top", "jungle", "mid", "adc", "support"] as const;
const VIEWPORTS = [
  { w: 1600, h: 900 }, { w: 1280, h: 720 }, { w: 1366, h: 650 },
  { w: 1280, h: 600 }, { w: 390, h: 844 }, { w: 360, h: 640 },
];
const FAMILIES = [
  { preset: "admin.roster_lock", family: "roster_lock" },
  { preset: "admin.draft_memory", family: "draft_memory" },
];

test.skip(!PERSONA_PATH, "PA2B_E2E_PERSONA is not set: no local backend to play against");

const persona = PERSONA_PATH ? readFileSync(PERSONA_PATH, "utf8") : "{}";

async function launch(page: Page, preset: string): Promise<string> {
  await page.addInitScript((p) => { localStorage.setItem("mogsy_e2e_identity", p); }, persona);
  await page.goto("/");
  const matchId = await page.evaluate(async (pr) => {
    const api = await import("/src/lib/ranked-public/client.ts");
    const s = await api.joinQueue(null, undefined, { matchWithBot: true, preset: pr });
    // Exactly PresetLaunch's handoff: /quiz/ranked with the match id in router state.
    history.replaceState({ usr: { matchId: s.matchId }, key: "pa2b", idx: 1 }, "", "/quiz/ranked");
    return s.matchId as string;
  }, preset);
  await page.reload();
  return matchId;
}

async function forfeit(page: Page, matchId: string) {
  await page.evaluate(async (mid) => {
    const api = await import("/src/lib/ranked-public/client.ts");
    try { await api.forfeitMatch(mid); } catch { /* already over */ }
  }, matchId);
}

for (const { preset, family } of FAMILIES) {
  for (const vp of VIEWPORTS) {
    for (const motion of ["normal", "reduce"] as const) {
      test(`${family} ${vp.w}x${vp.h} ${motion}`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
        });
        const page = await context.newPage();
        const tag = `${family}-${vp.w}x${vp.h}${motion === "reduce" ? "-reduced" : ""}`;
        const shot = async (name: string) => {
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` });
        };
        const matchId = await launch(page, preset);
        try {
          const phase = page.getByTestId("assembly-phase");
          await expect(phase).toHaveAttribute("data-phase", "open", { timeout: 30_000 });
          await expect(phase).toHaveAttribute("data-family", family);
          await page.getByTestId("ranked-rules-acknowledge").click({ timeout: 2_000 }).catch(() => {});
          // The board becomes answerable at the server's boundary.
          await expect(phase).not.toHaveAttribute("data-not-open", "true", { timeout: 20_000 });
          await shot("1-open");

          // ---- leak: nothing pre-lock can carry the answer
          const pre = await page.getByTestId("mig-positional-assembly").evaluate((el) => el.outerHTML);
          expect(pre).not.toMatch(/data-mark=|data-verdict=|canonical|role_anchor|is_correct|historical/);

          // ---- fit: no page overflow; every card, well and Lock >= 44x44
          const fit = await page.evaluate(() => {
            const r = (s: string) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.getBoundingClientRect());
            const small = [...r("[data-testid^=pa-card-]"), ...r("[data-testid^=pa-well-]"), ...r("[data-testid=pa-lock]")]
              .filter((b) => b.width < 44 || b.height < 44).length;
            const root = document.querySelector("[data-testid=mig-positional-assembly]")!.getBoundingClientRect();
            const stage = document.querySelector(".ranked-question-stage")?.getBoundingClientRect() ?? null;
            return {
              small,
              hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
              inStage: stage ? root.top >= stage.top - 1 && root.bottom <= stage.bottom + 1 : null,
            };
          });
          expect(fit.small, "targets under 44px").toBe(0);
          expect(fit.hOverflow, "horizontal page overflow").toBe(false);
          expect(fit.inStage, "instrument inside the question stage").not.toBe(false);

          // ---- seat five by real taps (card, then position)
          const cards = page.locator("[data-testid^=pa-card-]");
          await expect(cards).toHaveCount(10);
          for (let i = 0; i < LANES.length; i++) {
            await cards.nth(i).click();
            await page.getByTestId(`pa-well-${LANES[i]}`).click();
          }
          for (const lane of LANES) {
            await expect(page.getByTestId(`pa-well-${lane}`)).toHaveAttribute("data-token", /^pa_/);
          }
          await shot("2-filled");

          // ---- Lock once (double press), then the server's reveal
          const lock = page.getByTestId("pa-lock");
          const posts: string[] = [];
          page.on("request", (req) => {
            if (req.method() === "POST" && /\/challenges\/0$/.test(req.url())) posts.push(req.postData() ?? "");
          });
          // Against the bot the Lock POST settles the segment and the host moves
          // on after its result beat, so the reveal is RECORDED as it happens
          // (every DOM commit) rather than polled for afterwards.
          await page.evaluate(() => {
            const w = window as unknown as Record<string, unknown>;
            w.__pa2b = { revealed: false, marks: 0, verdict: null as string | null };
            const rec = w.__pa2b as { revealed: boolean; marks: number; verdict: string | null };
            const tick = () => {
              const root = document.querySelector("[data-testid=mig-positional-assembly]");
              if (root?.getAttribute("data-phase") !== "revealed") return;
              rec.revealed = true;
              // Every position carries the server's mark (PAV1 drops a wrong position's
              // seal once the true card has risen into it, so seals are not counted).
              rec.marks = Math.max(rec.marks, root.querySelectorAll("[data-part=position][data-mark]").length);
              rec.verdict = root.querySelector("[data-testid=pa-status]")?.getAttribute("data-verdict") ?? rec.verdict;
            };
            new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true });
          });
          await lock.dblclick();
          const recorded = () => page.evaluate(() =>
            (window as unknown as { __pa2b: { revealed: boolean; marks: number; verdict: string | null } }).__pa2b);
          await expect.poll(async () => (await recorded()).revealed, { timeout: 10_000 }).toBe(true);
          await shot("3-revealed");
          await expect.poll(async () => (await recorded()).marks, { timeout: 5_000 }).toBe(5);
          expect(posts).toHaveLength(1);
          expect(JSON.parse(posts[0])).toEqual({ placement: expect.any(Array) });
          expect(JSON.parse(posts[0]).placement).toHaveLength(5);
        } finally {
          await forfeit(page, matchId);
          await context.close();
        }
      });
    }
  }
}
