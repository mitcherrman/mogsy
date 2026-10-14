/**
 * ASSEMBLY-PA3 — owner playtest of Roster Lock and Draft Memory, end to end,
 * in a real browser against a REAL local backend (`assembly/pa3-admin-live`).
 *
 * Each case starts where the owner starts: Admin → Leaguecraft → Ranked →
 * Playtests, the family's own launch button. Then three server-generated
 * boards in the real Ranked host:
 *
 *   board 1  PERFECT — the five true cards seated by real taps → server CORRECT
 *   board 2  WRONG   — Top and Jungle swapped               → server INCORRECT,
 *                      3 of 5 in position
 *   board 3  TIMEOUT — nothing touched until the 45 s deadline → match result
 *
 * The browser never learns an answer: the harness reads the true lineup for
 * boards 1 and 2 from the scratch backend's OWN database (the private half the
 * server froze), never from the page. Every `/api/ranked` response before the
 * first lock is scanned for reveal-only vocabulary.
 *
 * Needs (and is SKIPPED without):
 *   PA3_E2E_PERSONA   persona JSON ({token, user, admin:true}) the local
 *                     backend treats as the owner;
 *   PA3_SCRATCH_DB    path of that backend's scratch SQLite database;
 *   a vite server with VITE_E2E_AUTH=1 and VITE_COMBAT_API_URL at that
 *   backend (baseURL from the Playwright config / PA3_BASE_URL).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const PERSONA_PATH = process.env.PA3_E2E_PERSONA;
const SCRATCH_DB = process.env.PA3_SCRATCH_DB;
const SHOTS = process.env.ASSEMBLY_SHOTS ?? null;
const LANES = ["top", "jungle", "mid", "adc", "support"] as const;
const VIEWPORTS = [
  { name: "desktop", w: 1366, h: 768, mobile: false },
  { name: "mobile", w: 390, h: 844, mobile: true },
];
const FAMILIES = [
  { family: "roster_lock", launch: "roster-lock-launch" },
  { family: "draft_memory", launch: "draft-memory-launch" },
];
/** Reveal-only / private vocabulary (backend FORBIDDEN_PRE_REVEAL_KEYS ∪ the
 * private payload's own names). Matched as JSON keys. */
const FORBIDDEN = [
  "canonical_lineup", "position_correct", "card_facts", "historical_context",
  "matched", "role_anchor", "slot_anchor", "registry_evidence", "entry_digest",
  "catalog_digest", "canonical", "answer", "dealt", "tray_seed", "provenance",
];

test.skip(!PERSONA_PATH || !SCRATCH_DB, "PA3_E2E_PERSONA / PA3_SCRATCH_DB not set: no local backend");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const persona = PERSONA_PATH ? readFileSync(PERSONA_PATH, "utf8") : "{}";

/** The server's frozen true lineup for one board, read from the backend DB. */
function canonical(matchId: string, segment: number): string[] {
  const out = execFileSync("python3", ["-I", "-c", [
    "import json, sqlite3, sys",
    "c = sqlite3.connect(sys.argv[1])",
    "r = c.execute('select segment_private_json from ranked_rounds where match_id=? and round_number=?', (sys.argv[2], int(sys.argv[3]))).fetchone()",
    "print(json.dumps(json.loads(r[0])['canonical']) if r and r[0] else 'null')",
  ].join("\n"), SCRATCH_DB!, matchId, String(segment)], { encoding: "utf8" });
  const parsed = JSON.parse(out.trim());
  if (!Array.isArray(parsed) || parsed.length !== 5) throw new Error(`no frozen board ${matchId}#${segment}`);
  return parsed;
}

function forbiddenKeys(body: string): string[] {
  return FORBIDDEN.filter((k) => new RegExp(`"${k}"\\s*:`).test(body));
}

async function seat(page: Page, tokens: readonly string[]) {
  for (let i = 0; i < LANES.length; i++) {
    await page.getByTestId(`pa-card-${tokens[i]}`).click();
    await page.getByTestId(`pa-well-${LANES[i]}`).click();
  }
  for (let i = 0; i < LANES.length; i++) {
    await expect(page.getByTestId(`pa-well-${LANES[i]}`)).toHaveAttribute("data-token", tokens[i]);
  }
}

/** Record the in-board reveal as it happens (the host moves on after its hold). */
async function watchReveal(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const rec = { revealed: false, right: 0, wrong: 0, verdict: null as string | null, at: 0, until: 0 };
    w.__pa3 = rec;
    const tick = () => {
      const root = document.querySelector("[data-testid=mig-positional-assembly]");
      if (root?.getAttribute("data-phase") !== "revealed") {
        if (rec.revealed && !rec.until) rec.until = performance.now();
        return;
      }
      if (!rec.revealed) { rec.revealed = true; rec.at = performance.now(); }
      rec.right = Math.max(rec.right, root.querySelectorAll("[data-part=position][data-mark=right]").length);
      rec.wrong = Math.max(rec.wrong, root.querySelectorAll("[data-part=position][data-mark=wrong]").length);
      rec.verdict = root.querySelector("[data-verdict]")?.getAttribute("data-verdict") ?? rec.verdict;
    };
    new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
}

async function revealRecord(page: Page) {
  return page.evaluate(() => (window as unknown as { __pa3: Record<string, unknown> }).__pa3);
}

async function boardOpen(page: Page, segment: number) {
  const phase = page.getByTestId("assembly-phase");
  await expect(phase).toHaveAttribute("data-phase", "open", { timeout: 30_000 });
  await expect(phase).not.toHaveAttribute("data-not-open", "true", { timeout: 30_000 });
  await expect(page.locator("[data-testid^=pa-card-]")).toHaveCount(10);
  // The rules sheet (first match of the session) never hides the board.
  await page.getByTestId("ranked-rules-acknowledge").click({ timeout: 1_000 }).catch(() => {});
  void segment;
}

for (const { family, launch } of FAMILIES) {
  for (const vp of VIEWPORTS) {
    test(`${family} ${vp.name}: admin launch → perfect → wrong → timeout`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile,
      });
      const page = await context.newPage();
      const tag = `${family}-${vp.name}`;
      const shot = async (name: string) => {
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` });
      };
      await page.addInitScript((p) => { localStorage.setItem("mogsy_e2e_identity", p); }, persona);

      // ---- every /api/ranked body before the first lock is answer-free
      let locked = false;
      const preLockLeaks: string[] = [];
      page.on("response", async (resp) => {
        if (locked || !/\/api\/ranked\//.test(resp.url())) return;
        try {
          const leaks = forbiddenKeys(await resp.text());
          if (leaks.length && !locked) preLockLeaks.push(`${resp.url()} ${leaks.join(",")}`);
        } catch { /* body unavailable (redirect / aborted) */ }
      });

      // ---- Admin → Leaguecraft → Ranked → Playtests → this family's button
      await page.goto("/admin/leaguecraft?section=ranked&view=playtests");
      const button = page.getByTestId(`${launch}-button`);
      await expect(button).toBeVisible({ timeout: 30_000 });
      await shot("0-admin");
      const queued = page.waitForResponse((r) => /\/api\/ranked\/queue$/.test(r.url()) && r.request().method() === "POST");
      await button.click();
      const queue = await queued;
      expect(queue.status()).toBe(200);
      const matchId = (await queue.json()).payload.match_id as string;
      await expect(page).toHaveURL(/\/quiz\/ranked/);

      // ---- board 1: PERFECT
      await boardOpen(page, 1);
      await expect(page.getByTestId("assembly-phase")).toHaveAttribute("data-family", family);
      const pre = await page.getByTestId("mig-positional-assembly").evaluate((el) => el.outerHTML);
      expect(pre).not.toMatch(/data-mark=|data-verdict=|canonical|role_anchor|is_correct|historical/);
      const fit = await page.evaluate(() => {
        const r = (s: string) => [...document.querySelectorAll<HTMLElement>(s)].map((e) => e.getBoundingClientRect());
        return {
          small: [...r("[data-testid^=pa-card-]"), ...r("[data-testid^=pa-well-]")]
            .filter((b) => b.width < 44 || b.height < 44).length,
          hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      expect(fit.small, "targets under 44px").toBe(0);
      expect(fit.hOverflow, "horizontal page overflow").toBe(false);
      await shot("1-open");
      const truth1 = canonical(matchId, 1);
      await seat(page, truth1);
      await watchReveal(page);
      await shot("1-filled");
      expect(preLockLeaks, "pre-lock answer leak").toEqual([]);
      locked = true;
      await page.getByTestId("pa-lock").click();
      await expect.poll(async () => (await revealRecord(page)).revealed, { timeout: 15_000 }).toBe(true);
      await page.waitForTimeout(1_200);
      await shot("1-revealed");
      const r1 = await revealRecord(page);
      expect(r1.verdict).toBe("right");
      expect(r1.right).toBe(5);

      // ---- board 2: WRONG (Top and Jungle swapped)
      await expect.poll(async () => page.getByTestId("assembly-phase").getAttribute("data-phase"),
        { timeout: 30_000 }).toBe("open");
      await boardOpen(page, 2);
      const truth2 = canonical(matchId, 2);
      const swapped = [truth2[1], truth2[0], ...truth2.slice(2)];
      await seat(page, swapped);
      await watchReveal(page);
      await page.getByTestId("pa-lock").click();
      await expect.poll(async () => (await revealRecord(page)).revealed, { timeout: 15_000 }).toBe(true);
      await page.waitForTimeout(2_000);
      await shot("2-revealed");
      const r2 = await revealRecord(page);
      expect(r2.verdict).toBe("wrong");
      expect(r2.right).toBe(3);
      expect(r2.wrong).toBe(2);
      // The correction stays readable for the server's hold (4400 ms) before
      // the next board's title replaces it.
      await expect.poll(async () => {
        const r = await revealRecord(page);
        return r.until ? Number(r.until) - Number(r.at) : null;
      }, { timeout: 20_000 }).toBeGreaterThanOrEqual(4_000);

      // ---- board 3: TIMEOUT — nothing touched; the match ends on the server
      await boardOpen(page, 3);
      await shot("3-open");
      const result = await page.evaluate(async (mid) => {
        const api = await import("/src/lib/ranked-public/client.ts");
        const deadline = Date.now() + 75_000;
        for (;;) {
          try { return await api.getMatchResult(mid); } catch (e) {
            if (Date.now() > deadline) throw e;
            await new Promise((r) => setTimeout(r, 2_000));
          }
        }
      }, matchId);
      expect(result).toBeTruthy();
      await page.waitForTimeout(3_000);
      await shot("4-result");
      await expect(page.getByText(/unrated/i).first()).toBeVisible({ timeout: 20_000 });

      // ---- review: three server-graded boards, the true lineup after reveal
      const review = await page.evaluate(async (mid) => {
        const api = await import("/src/lib/ranked-public/client.ts");
        const rv = await api.getMatchReview(mid);
        return rv.rounds.map((r: { kind: string; revealed: boolean; assembly?: { outcome: string | null; matched: number | null } | null }) =>
          ({ kind: r.kind, revealed: r.revealed, outcome: r.assembly?.outcome ?? null, matched: r.assembly?.matched ?? null }));
      }, matchId);
      expect(review).toEqual([
        { kind: "assembly", revealed: true, outcome: "correct", matched: 5 },
        { kind: "assembly", revealed: true, outcome: "incorrect", matched: 3 },
        { kind: "assembly", revealed: true, outcome: "timeout", matched: 0 },
      ]);
      await context.close();
    });
  }
}
