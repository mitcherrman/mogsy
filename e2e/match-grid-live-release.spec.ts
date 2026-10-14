/**
 * MATCH-GRID-LIVE — Match Grid in the real host against a real local release
 * backend, in a real browser (adapted from RANKED-INT1's multi-mode spec, with
 * Scrub and Assembly removed and a score check added).
 *
 * Each case is a complete `admin.match` bot match through the frontend's own
 * `joinQueue` (the call `PresetLaunch` makes) → `QuizRankedMatch →
 * CanonicalArena` → three boards played with real keyboard input → the final
 * round's correction → the match-complete outro → the end screen → history and
 * Review through the real client readers. The end screen's scoreline must equal
 * the score the server STORED for the match (read by the oracle from the DB).
 *
 * Plans:
 *   full   round 1 CORRECT, round 2 TIMEOUT (no lock), round 3 WRONG;
 *   quick  three WRONG boards, to measure the final round everywhere.
 *
 * "Correct" / "wrong" and the stored score come from a TEST-HARNESS oracle that
 * reads the disposable scratch DB the local backend writes (`MG_ORACLE`, a
 * python script). The client under test never sees it.
 *
 * Needs (and is SKIPPED without):
 *   MG_E2E_PERSONA  persona JSON ({token, user, admin:false}) for the owner
 *                   account of the local backend (HS256 test path);
 *   MG_ORACLE       path to the oracle script;
 *   a vite server with VITE_E2E_AUTH=1 pointing at that backend (baseURL).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

const PERSONA_PATH = process.env.MG_E2E_PERSONA ?? "";
const ORACLE = process.env.MG_ORACLE ?? "";
const OUT = process.env.MG_SHOTS ?? path.resolve("test-results/match-grid-live");
const ONLY = process.env.MG_ONLY ?? "";
mkdirSync(OUT, { recursive: true });

test.skip(!PERSONA_PATH || !ORACLE, "MG_E2E_PERSONA / MG_ORACLE not set: no local backend");

const persona = PERSONA_PATH ? readFileSync(PERSONA_PATH, "utf8") : "{}";
const userId: string = PERSONA_PATH ? JSON.parse(persona).user.id : "";

const PHASE = "match-grid-phase";
/** The server's post-settlement hold for a WRONG board (MatchModule.settlement_hold_ms). */
const SERVER_HOLD_MS = 4500;

interface Case { vp: { w: number; h: number }; reduced: boolean; plan: "full" | "quick" }
const CASES: Case[] = [
  { vp: { w: 1280, h: 720 }, reduced: false, plan: "full" },
  { vp: { w: 390, h: 844 }, reduced: false, plan: "full" },
  { vp: { w: 1600, h: 900 }, reduced: false, plan: "quick" },
  { vp: { w: 1366, h: 650 }, reduced: false, plan: "quick" },
  { vp: { w: 1280, h: 600 }, reduced: false, plan: "quick" },
  { vp: { w: 360, h: 640 }, reduced: false, plan: "quick" },
  { vp: { w: 1280, h: 600 }, reduced: true, plan: "quick" },
  { vp: { w: 390, h: 844 }, reduced: true, plan: "quick" },
];

function oracle(...args: string[]): Record<string, unknown> {
  return JSON.parse(execFileSync("python", [ORACLE, ...args], { encoding: "utf8" }));
}

async function launch(page: Page): Promise<string> {
  await page.addInitScript((p) => { localStorage.setItem("mogsy_e2e_identity", p); }, persona);
  await page.goto("/");
  const matchId = await page.evaluate(async () => {
    const api = await import("/src/lib/ranked-public/client.ts");
    const s = await api.joinQueue(null, undefined, { matchWithBot: true, preset: "admin.match" });
    history.replaceState({ usr: { matchId: s.matchId }, key: "mglive", idx: 1 }, "", "/quiz/ranked");
    return s.matchId as string;
  });
  await page.reload();
  // `/quiz/ranked` takes ~17-25 s to first render under the E2E identity on
  // clean main too (RANKED-INT1); wait for the arena itself.
  await page.locator('[data-testid="ranked-match"]').waitFor({ timeout: 90_000 });
  return matchId;
}

/** Records every phase change of the board, the arena and the ending. */
function installRecorder(phaseId: string) {
  const w = window as unknown as { __mg: { t: number; ev: string; v: string | null }[] };
  w.__mg = [];
  const last: Record<string, string | null> = {};
  const put = (ev: string, v: string | null) => {
    if (last[ev] === v) return;
    last[ev] = v;
    w.__mg.push({ t: performance.now(), ev, v });
  };
  const tick = () => {
    const m = document.querySelector(`[data-testid="${phaseId}"]`);
    put("phase", m?.getAttribute("data-phase") ?? null);
    put("stage", m?.querySelector("[data-reveal-stage]")?.getAttribute("data-reveal-stage") ?? null);
    put("outro", document.querySelector('[data-testid="ranked-match-outro"]') ? "on" : "off");
    put("end", document.querySelector('[data-testid="ranked-match-over"]') ? "on" : "off");
  };
  new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true });
  const raf = () => { tick(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

async function signature(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-mig-primitive="match-grid"] [data-part="sigil"]')]
      .map((e) => e.getAttribute("aria-label") ?? e.textContent).join(","));
}

async function waitForOpenBoard(page: Page, previous: string | null) {
  const phase = page.getByTestId(PHASE);
  await expect.poll(async () => {
    if (await phase.count() === 0) return "absent";
    const p = await phase.getAttribute("data-phase");
    const notOpen = await phase.getAttribute("data-not-open");
    if (p !== "open" || notOpen === "true") return `phase:${p}:${notOpen}`;
    const sig = await signature(page);
    return previous !== null && sig === previous ? "same-board" : "ready";
  }, { timeout: 90_000, intervals: [100] }).toBe("ready");
  await page.getByTestId("ranked-rules-acknowledge").click({ timeout: 1_000 }).catch(() => {});
  return signature(page);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function playBoard(page: Page, answer: Record<string, unknown>, correct: boolean) {
  const seats = answer.seats as { label: string; seal: number; entity: string }[];
  const count = answer.seal_count as number;
  for (const s of seats) {
    const seal = !correct && s.entity === "e0" ? (s.seal % count) + 1 : s.seal;
    const sigil = page.locator('[data-mig-primitive="match-grid"]')
      .getByRole("button", { name: new RegExp(`^${escape(s.label)}\\.`) });
    await sigil.focus();
    await page.keyboard.press(String(seal));
  }
  const lock = page.locator('[data-mig-primitive="match-grid"] [data-part="lock"]');
  await lock.scrollIntoViewIfNeeded();
  await expect(lock).toBeEnabled();
  await lock.click();
}

for (const c of CASES) {
  const tag = `${c.plan}-match-${c.vp.w}x${c.vp.h}${c.reduced ? "-reduced" : ""}`;
  test(tag, async ({ browser }) => {
    test.skip(!!ONLY && !tag.includes(ONLY), `MG_ONLY=${ONLY}`);
    const context = await browser.newContext({
      viewport: { width: c.vp.w, height: c.vp.h },
      reducedMotion: c.reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const brokenMedia: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => {
      if (/\/assets\/runes\//.test(r.url()) && r.status() >= 400) brokenMedia.push(`${r.status()} ${r.url()}`);
    });
    const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
    const matchId = await launch(page);
    let finished = false;
    try {
      await page.evaluate(installRecorder, PHASE);
      const plays: ("correct" | "timeout" | "wrong")[] =
        c.plan === "full" ? ["correct", "timeout", "wrong"] : ["wrong", "wrong", "wrong"];
      let sig: string | null = null;
      let finalLockAt = 0;
      for (let round = 1; round <= 3; round++) {
        sig = await waitForOpenBoard(page, sig);
        if (round === 1) {
          const hOverflow = await page.evaluate(() =>
            document.documentElement.scrollWidth > window.innerWidth + 1);
          expect(hOverflow, "horizontal page overflow").toBe(false);
          // Every dealt rune shows its icon (served by the backend's /assets).
          await expect.poll(() => page.evaluate(() => {
            const imgs = [...document.querySelectorAll('[data-mig-primitive="match-grid"] [data-part="sigil"] img')] as HTMLImageElement[];
            return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
          }), { timeout: 15_000 }).toBe(true);
          await shot("r1-open");
        }
        const play = plays[round - 1];
        if (play === "timeout") continue; // leave the board untouched; the deadline settles it
        await playBoard(page, oracle(matchId, String(round)), play === "correct");
        if (round === 3) finalLockAt = await page.evaluate(() => performance.now());
        await expect(page.getByTestId(PHASE)).toHaveAttribute("data-phase", "revealed", { timeout: 30_000 });
        if (round === 3) await shot("r3-revealed");
      }
      await expect(page.getByTestId("ranked-match-outro")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("ranked-match-over")).toBeVisible({ timeout: 30_000 });
      finished = true;
      await shot("end");

      // ---- the final round's timeline
      const ev = await page.evaluate(() =>
        (window as unknown as { __mg: { t: number; ev: string; v: string | null }[] }).__mg);
      const after = (pred: (e: { ev: string; v: string | null; t: number }) => boolean, t0: number) =>
        ev.find((e) => e.t >= t0 && pred(e))?.t ?? null;
      const revealAt = after((e) => e.ev === "phase" && e.v === "revealed", finalLockAt);
      const doneAt = after((e) => e.ev === "stage" && e.v === "done", finalLockAt)
        ?? (c.reduced ? revealAt : null);
      const outroAt = after((e) => e.ev === "outro" && e.v === "on", finalLockAt);
      const endAt = after((e) => e.ev === "end" && e.v === "on", finalLockAt);
      const report = {
        tag, matchId, revealToOutro: revealAt !== null && outroAt !== null ? outroAt - revealAt : null,
        doneToOutro: doneAt !== null && outroAt !== null ? outroAt - doneAt : null,
        outroToEnd: outroAt !== null && endAt !== null ? endAt - outroAt : null,
      };
      expect(revealAt, "final reveal observed").not.toBeNull();
      expect(outroAt!).toBeGreaterThan(revealAt!);
      expect(endAt!).toBeGreaterThan(outroAt!);
      // The match-complete beat never covers the correction before the
      // server's hold has run, and the reveal finished first.
      expect(report.revealToOutro!, "outro came before the server hold").toBeGreaterThanOrEqual(SERVER_HOLD_MS - 300);
      expect(doneAt, "reveal reached done").not.toBeNull();
      expect(doneAt!).toBeLessThan(outroAt!);
      expect(report.doneToOutro!, "readable time after the reveal completed").toBeGreaterThanOrEqual(2000);

      // ---- the end screen's score IS the server's stored score
      const shown = {
        you: Number((await page.getByTestId("final-score-you").first().textContent())?.trim()),
        opponent: Number((await page.getByTestId("final-score-opponent").first().textContent())?.trim()),
      };
      const stored = oracle(matchId, "score", userId) as {
        status: string; rounds: number; you: number; opponent: number;
        summed_you: number; summed_opponent: number };
      expect(stored.status).toBe("complete");
      expect(stored.rounds).toBe(3);
      // The stored total equals the sum of every round's own award.
      expect({ you: stored.you, opponent: stored.opponent })
        .toEqual({ you: stored.summed_you, opponent: stored.summed_opponent });
      expect(shown, "end-screen score vs server-stored score").toEqual({ you: stored.you, opponent: stored.opponent });

      // ---- completed-match history, result and Review, through the real readers
      const read = await page.evaluate(async (mid) => {
        const api = await import("/src/lib/ranked-public/client.ts");
        const hist = await api.getMatchHistory(20);
        const review = await api.getMatchReview(mid);
        return {
          inHistory: JSON.stringify(hist).includes(mid),
          rounds: review.rounds.map((r: Record<string, unknown>) => {
            const body = r[r.kind as string] as Record<string, unknown> | null | undefined;
            return { kind: r.kind, revealed: r.revealed, outcome: body?.outcome ?? null };
          }),
        };
      }, matchId);
      expect(read.inHistory, "match listed in history").toBe(true);
      expect(read.rounds.map((r) => r.kind)).toEqual(["match", "match", "match"]);
      expect(read.rounds.every((r) => r.revealed)).toBe(true);
      expect(read.rounds.map((r) => r.outcome)).toEqual(plays.map((p) => (p === "wrong" ? "incorrect" : p)));

      expect(brokenMedia, "rune icons that failed to load").toEqual([]);
      expect(errors.filter((e) => /contract|failed to parse|Uncaught|TypeError/i.test(e)),
        "contract/parse errors in the console").toEqual([]);
      writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ ...report, shown, stored, review: read }, null, 1));
      test.info().annotations.push({ type: "final-round", description: JSON.stringify({ ...report, shown, stored }) });
    } finally {
      if (!finished) {
        await page.evaluate(async (mid) => {
          const api = await import("/src/lib/ranked-public/client.ts");
          try { await api.forfeitMatch(mid); } catch { /* already over */ }
        }, matchId).catch(() => {});
      }
      await context.close();
    }
  });
}
