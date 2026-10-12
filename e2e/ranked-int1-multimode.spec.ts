/**
 * RANKED-INT1 — Scrub, Match Grid and Pro Play Assembly in ONE integrated
 * host, against ONE real local integrated backend, in a real browser.
 *
 * Each case is a complete admin bot match through the frontend's own
 * `joinQueue` (the call `PresetLaunch` makes) → `QuizRankedMatch →
 * CanonicalArena` → three boards played with real input → the final round's
 * correction → the match-complete outro → the end screen → completed-match
 * history and Review, read through the real client readers.
 *
 * Plans:
 *   full   round 1 CORRECT, round 2 TIMEOUT (no lock), round 3 WRONG;
 *   quick  three WRONG boards (fast), to measure the final round everywhere.
 *
 * "Correct" and "wrong" are chosen by a TEST-HARNESS oracle that reads the
 * frozen answer from the disposable scratch DB the local backend writes
 * (`INT1_ORACLE`, a python script). The client under test never sees it.
 *
 * The final round (INT0 B4): every phase change is recorded with a timestamp
 * by a MutationObserver, and the spec asserts that the match-complete outro
 * does not cover the correction before the module's server hold has run
 * (Assembly 4400 ms, Match Grid 4500 ms after the reveal starts) and that the
 * reveal reached `done` first; Scrub keeps its ordinary result beat.
 *
 * Needs (and is SKIPPED without):
 *   INT1_E2E_PERSONA  persona JSON ({token, user, admin:false}) for the owner
 *                     account of the local backend (HS256 test path);
 *   INT1_ORACLE       path to the oracle script;
 *   a vite server with VITE_E2E_AUTH=1 pointing at that backend (baseURL).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

const PERSONA_PATH = process.env.INT1_E2E_PERSONA ?? "";
const ORACLE = process.env.INT1_ORACLE ?? "";
const OUT = process.env.INT1_SHOTS ?? path.resolve("test-results/ranked-int1");
const ONLY = process.env.INT1_ONLY ?? "";
mkdirSync(OUT, { recursive: true });

test.skip(!PERSONA_PATH || !ORACLE, "INT1_E2E_PERSONA / INT1_ORACLE not set: no local backend");

const persona = PERSONA_PATH ? readFileSync(PERSONA_PATH, "utf8") : "{}";

type Kind = "assembly" | "match" | "scrub";
const PRESETS: Record<string, { kind: Kind; family?: string }> = {
  "admin.roster_lock": { kind: "assembly", family: "roster_lock" },
  "admin.draft_memory": { kind: "assembly", family: "draft_memory" },
  "admin.match": { kind: "match" },
  "admin.scrub": { kind: "scrub" },
};
const PHASE_ID: Record<Kind, string> = {
  assembly: "assembly-phase", match: "match-grid-phase", scrub: "scrub-phase",
};
/** The server's post-settlement hold for a WRONG board (backend settlement_hold_ms). */
const SERVER_HOLD: Record<Kind, number | null> = { assembly: 4400, match: 4500, scrub: null };
const LANES = ["top", "jungle", "mid", "adc", "support"] as const;

const VIEWPORTS = [
  { w: 1600, h: 900 }, { w: 1280, h: 720 }, { w: 1366, h: 650 },
  { w: 1280, h: 600 }, { w: 390, h: 844 }, { w: 360, h: 640 },
];

interface Case { preset: string; vp: { w: number; h: number }; reduced: boolean; plan: "full" | "quick" }
const CASES: Case[] = [];
for (const preset of Object.keys(PRESETS)) {
  CASES.push({ preset, vp: { w: 1280, h: 720 }, reduced: false, plan: "full" });
}
for (const preset of ["admin.roster_lock", "admin.match", "admin.scrub"]) {
  for (const vp of VIEWPORTS) CASES.push({ preset, vp, reduced: false, plan: "quick" });
  for (const vp of [{ w: 1280, h: 600 }, { w: 390, h: 844 }]) {
    CASES.push({ preset, vp, reduced: true, plan: "quick" });
  }
}

function oracle(matchId: string, round: number): Record<string, unknown> {
  return JSON.parse(execFileSync("python", [ORACLE, matchId, String(round)], { encoding: "utf8" }));
}

async function launch(page: Page, preset: string): Promise<string> {
  await page.addInitScript((p) => { localStorage.setItem("mogsy_e2e_identity", p); }, persona);
  await page.goto("/");
  const matchId = await page.evaluate(async (pr) => {
    const api = await import("/src/lib/ranked-public/client.ts");
    const s = await api.joinQueue(null, undefined, { matchWithBot: true, preset: pr });
    history.replaceState({ usr: { matchId: s.matchId }, key: "int1", idx: 1 }, "", "/quiz/ranked");
    return s.matchId as string;
  }, preset);
  await page.reload();
  return matchId;
}

/** Records every phase change of the module, the arena and the ending. */
function installRecorder(phaseId: string) {
  const w = window as unknown as { __int1: { t: number; ev: string; v: string | null }[] };
  w.__int1 = [];
  const last: Record<string, string | null> = {};
  const put = (ev: string, v: string | null) => {
    if (last[ev] === v) return;
    last[ev] = v;
    w.__int1.push({ t: performance.now(), ev, v });
  };
  const tick = () => {
    const m = document.querySelector(`[data-testid="${phaseId}"]`);
    put("phase", m?.getAttribute("data-phase") ?? null);
    const stageEl = m?.querySelector("[data-reveal-stage]");
    put("stage", stageEl?.getAttribute("data-reveal-stage") ?? null);
    const arena = document.querySelector('[data-testid="ranked-match"]');
    put("hold", arena?.getAttribute("data-reveal-hold") ?? null);
    put("presentation", arena?.getAttribute("data-presentation-phase") ?? null);
    put("outro", document.querySelector('[data-testid="ranked-match-outro"]') ? "on" : "off");
    put("end", document.querySelector('[data-testid="ranked-match-over"]') ? "on" : "off");
    put("plate", document.querySelector('[data-testid="pa-context"]')?.getAttribute("data-shown") ?? null);
  };
  new MutationObserver(tick).observe(document.body, { subtree: true, childList: true, attributes: true });
  const raf = () => { tick(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

async function signature(page: Page, kind: Kind): Promise<string> {
  return page.evaluate((k) => {
    if (k === "assembly") {
      return [...document.querySelectorAll("[data-testid^=pa-card-]")].map((e) => e.getAttribute("data-testid")).join(",");
    }
    if (k === "match") {
      return [...document.querySelectorAll('[data-mig-primitive="match-grid"] [data-part="sigil"]')]
        .map((e) => e.getAttribute("aria-label") ?? e.textContent).join(",");
    }
    return document.querySelector('[data-testid="chronoscope-prompt"]')?.textContent ?? "";
  }, kind);
}

async function waitForOpenBoard(page: Page, kind: Kind, previous: string | null) {
  const phase = page.getByTestId(PHASE_ID[kind]);
  await expect.poll(async () => {
    if (await phase.count() === 0) return "absent";
    const p = await phase.getAttribute("data-phase");
    const notOpen = await phase.getAttribute("data-not-open");
    if (p !== "open" || notOpen === "true") return `phase:${p}:${notOpen}`;
    const sig = await signature(page, kind);
    return previous !== null && sig === previous ? "same-board" : "ready";
  }, { timeout: 90_000, intervals: [100] }).toBe("ready");
  await page.getByTestId("ranked-rules-acknowledge").click({ timeout: 1_000 }).catch(() => {});
  return signature(page, kind);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function playBoard(page: Page, kind: Kind, answer: Record<string, unknown>, correct: boolean) {
  if (kind === "assembly") {
    const placement = [...(answer.placement as string[])];
    if (!correct) [placement[0], placement[1]] = [placement[1], placement[0]];
    for (let i = 0; i < LANES.length; i++) {
      await page.getByTestId(`pa-card-${placement[i]}`).click();
      await page.getByTestId(`pa-well-${LANES[i]}`).click();
    }
    for (const lane of LANES) {
      await expect(page.getByTestId(`pa-well-${lane}`)).toHaveAttribute("data-token", /^pa_/);
    }
    await page.getByTestId("pa-lock").click();
    return;
  }
  if (kind === "match") {
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
    return;
  }
  const canon = answer.index as number;
  const count = answer.count as number;
  const pick = correct ? canon : (canon === 0 ? count - 1 : 0);
  const d = await page.evaluate((n) => {
    const r = document.querySelector(`[data-testid="chronoscope-detent-${n}"]`)!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, pick);
  await page.mouse.click(d.x, d.y);
  await expect(page.locator('[data-testid="chronoscope-reading-label"]')).toHaveText(String(pick + 1));
  await page.getByTestId("chronoscope-lock").click();
}

for (const c of CASES) {
  const { kind, family } = PRESETS[c.preset];
  const tag = `${c.plan}-${c.preset.replace("admin.", "")}-${c.vp.w}x${c.vp.h}${c.reduced ? "-reduced" : ""}`;
  test(tag, async ({ browser }) => {
    test.skip(!!ONLY && !tag.includes(ONLY), `INT1_ONLY=${ONLY}`);
    const context = await browser.newContext({
      viewport: { width: c.vp.w, height: c.vp.h },
      reducedMotion: c.reduced ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    const shot = (name: string) => page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
    const matchId = await launch(page, c.preset);
    let finished = false;
    try {
      await page.evaluate(installRecorder, PHASE_ID[kind]);
      const plays: ("correct" | "timeout" | "wrong")[] =
        c.plan === "full" ? ["correct", "timeout", "wrong"] : ["wrong", "wrong", "wrong"];
      let sig: string | null = null;
      let finalLockAt = 0;
      for (let round = 1; round <= 3; round++) {
        sig = await waitForOpenBoard(page, kind, sig);
        if (family) await expect(page.getByTestId("assembly-phase")).toHaveAttribute("data-family", family);
        if (round === 1) {
          const fit = await page.evaluate(() => ({
            hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          }));
          expect(fit.hOverflow, "horizontal page overflow").toBe(false);
          await shot("r1-open");
        }
        const play = plays[round - 1];
        if (play === "timeout") continue; // leave the board untouched; the deadline settles it
        await playBoard(page, kind, oracle(matchId, round), play === "correct");
        if (round === 3) finalLockAt = await page.evaluate(() => performance.now());
        await expect(page.getByTestId(PHASE_ID[kind])).toHaveAttribute("data-phase", "revealed", { timeout: 30_000 });
        if (round === 3) await shot("r3-revealed");
      }
      await expect(page.getByTestId("ranked-match-outro")).toBeVisible({ timeout: 30_000 });
      await shot("outro");
      await expect(page.getByTestId("ranked-match-over")).toBeVisible({ timeout: 30_000 });
      finished = true;
      await shot("end");

      // ---- the final round's timeline
      const ev = await page.evaluate(() =>
        (window as unknown as { __int1: { t: number; ev: string; v: string | null }[] }).__int1);
      const after = (pred: (e: { ev: string; v: string | null; t: number }) => boolean, t0: number) =>
        ev.find((e) => e.t >= t0 && pred(e))?.t ?? null;
      const revealAt = after((e) => e.ev === "phase" && e.v === "revealed", finalLockAt);
      const doneAt = after((e) => e.ev === "stage" && e.v === "done", finalLockAt)
        ?? (c.reduced ? revealAt : null);
      const plateAt = kind === "assembly" ? after((e) => e.ev === "plate" && e.v === "true", finalLockAt) : null;
      const outroAt = after((e) => e.ev === "outro" && e.v === "on", finalLockAt);
      const endAt = after((e) => e.ev === "end" && e.v === "on", finalLockAt);
      const report = {
        tag, matchId, finalLockAt, revealAt, doneAt, plateAt, outroAt, endAt,
        lockToReveal: revealAt !== null ? revealAt - finalLockAt : null,
        revealToOutro: revealAt !== null && outroAt !== null ? outroAt - revealAt : null,
        doneToOutro: doneAt !== null && outroAt !== null ? outroAt - doneAt : null,
        plateToOutro: plateAt !== null && outroAt !== null ? outroAt - plateAt : null,
        outroToEnd: outroAt !== null && endAt !== null ? endAt - outroAt : null,
      };
      expect(revealAt, "final reveal observed").not.toBeNull();
      expect(outroAt, "outro observed").not.toBeNull();
      expect(endAt, "end screen observed").not.toBeNull();
      expect(outroAt!).toBeGreaterThan(revealAt!);
      expect(endAt!).toBeGreaterThan(outroAt!);
      const hold = SERVER_HOLD[kind];
      if (hold !== null) {
        // The match-complete beat never covers the correction before the
        // server's hold has run, and the reveal finished first.
        expect(report.revealToOutro!, "outro came before the server hold").toBeGreaterThanOrEqual(hold - 300);
        expect(doneAt, "reveal reached done").not.toBeNull();
        expect(doneAt!).toBeLessThan(outroAt!);
        expect(report.doneToOutro!, "readable time after the reveal completed").toBeGreaterThanOrEqual(2000);
        if (kind === "assembly") {
          expect(plateAt, "context plate shown").not.toBeNull();
          expect(report.plateToOutro!, "context plate readable").toBeGreaterThanOrEqual(2000);
        }
      } else {
        // Scrub keeps its ordinary beat (REVEAL_HOLD_MS) — not extended.
        expect(report.revealToOutro!).toBeLessThan(4000);
      }

      // ---- completed-match history and Review, through the real readers
      const after1 = await page.evaluate(async (mid) => {
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
      expect(after1.inHistory, "match listed in history").toBe(true);
      expect(after1.rounds.map((r) => r.kind)).toEqual([kind, kind, kind]);
      expect(after1.rounds.every((r) => r.revealed)).toBe(true);
      const expected = plays.map((p) => (p === "wrong" ? "incorrect" : p));
      expect(after1.rounds.map((r) => r.outcome)).toEqual(expected);

      expect(errors.filter((e) => /contract|failed to parse|Uncaught|TypeError/i.test(e)),
        "contract/parse errors in the console").toEqual([]);
      writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify({ ...report, review: after1 }, null, 1));
      test.info().annotations.push({ type: "final-round", description: JSON.stringify(report) });
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
