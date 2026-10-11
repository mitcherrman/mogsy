/**
 * MG-P3 — MATCH GRID CONTINUITY IN THE REAL HOST, against a REAL `match.v1`
 * backend (P2), measured on every animation frame.
 *
 * Unlike `match-grid-continuity.spec.ts` (the M1 DEV lab, kept for visual
 * diagnosis), this drives `QuizRankedMatch → CanonicalArena`: an `admin.match`
 * bot match is created through the ordinary queue join, the first segment is
 * played (drag, keyboard reassignment, digits), locked, revealed by the
 * server, and followed into the next segment. Structural regions — the
 * arena's question stage, the module viewport and the primitive's own frame —
 * are held to ≤1px of frame-to-frame movement in both motion modes at the M1
 * viewports; the stage must never overflow, the page must never scroll, no
 * sigil may clip outside the board and no two ledger seal names may collide.
 *
 * Needs (all local, nothing else is contacted):
 *   * the P2 backend on :8077 with SUPABASE_ALLOW_HS256 + a local secret,
 *   * vite on :8123 with VITE_E2E_AUTH=1 and VITE_COMBAT_API_URL=:8077,
 *   * MG_P3_PERSONA = path to a JSON E2E persona whose HS256 token that
 *     backend verifies (see MATCH_GRID_P3_HANDOFF.md). Skipped without it.
 *
 *   MG_P3_PERSONA=... npx playwright test -c playwright.arena.config.ts match-grid-arena-continuity
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const PERSONA_PATH = process.env.MG_P3_PERSONA ?? "";
const PERSONA = PERSONA_PATH ? readFileSync(PERSONA_PATH, "utf8") : "";
const SHOTS = process.env.MATCH_GRID_SHOTS ?? path.resolve("test-results/match-grid-arena");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

const REGIONS: Record<string, string> = {
  stage: ".ranked-question-stage",
  viewport: '[data-testid="match-grid-viewport"]',
  root: '[data-mig-primitive="match-grid"]',
  head: '[data-mig-primitive="match-grid"] [data-part="head"]',
  board: '[data-mig-primitive="match-grid"] [data-part="board"]',
  foot: '[data-mig-primitive="match-grid"] [data-part="foot"]',
  status: '[data-mig-primitive="match-grid"] [data-part="status"]',
  lock: '[data-mig-primitive="match-grid"] [data-part="lock"]',
};
const BUDGET_PX = 1;

interface Frame {
  phase: string | null; stage: string | null; seg: string | null; scrollY: number; t: number; node: number;
  fit: string | null;
  /** Sampled in requestAnimationFrame (a painted frame) vs. on a DOM commit (may never paint). */
  painted: boolean;
  r: Record<string, [number, number, number, number]>;
}

function installSampler(regions: Record<string, string>) {
  const frames: Frame[] = [];
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  let running = true;
  let paused = false;
  const sample = (painted = false) => {
    if (!running || paused) return;
    const m = document.querySelector('[data-mig-primitive="match-grid"]');
    const f: Frame = {
      phase: m?.getAttribute("data-phase") ?? null,
      stage: m?.getAttribute("data-reveal-stage") ?? null,
      seg: String(document.querySelectorAll('[data-part="sigil"]').length),
      fit: document.querySelector('[data-testid="match-grid-fit"]')?.getAttribute("data-fit-scale") ?? null,
      painted,
      scrollY: window.scrollY,
      t: Math.round(performance.now()),
      node: m ? (ids.get(m) ?? (ids.set(m, nextId++), nextId - 1)) : 0,
      r: {},
    };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      if (b.width || b.height) f.r[k] = [b.left + window.scrollX, b.top + window.scrollY, b.width, b.height];
    }
    frames.push(f);
  };
  // Painted-state sampling: rAF runs BEFORE the frame's layout/ResizeObserver
  // steps, so a sample there can read a layout that is corrected before paint.
  // A message posted from rAF is delivered after that frame paints.
  const mc = new MessageChannel();
  mc.port1.onmessage = () => sample(true);
  const raf = () => { mc.port2.postMessage(0); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const mo = new MutationObserver(() => sample(false));
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const w = window as unknown as { __mgStop: () => Frame[]; __mgPause: (p: boolean) => void };
  w.__mgStop = () => { running = false; mo.disconnect(); return frames; };
  w.__mgPause = (p) => { paused = p; };
}

async function shot(page: Page, file: string) {
  await page.evaluate(() => (window as unknown as { __mgPause?: (p: boolean) => void }).__mgPause?.(true));
  await page.screenshot({ path: file });
  await page.waitForTimeout(50);
  await page.evaluate(() => (window as unknown as { __mgPause?: (p: boolean) => void }).__mgPause?.(false));
}

/**
 * Worst consecutive PAINTED-frame movement per region, excluding the
 * next-segment board swap. DOM-commit samples are kept for the phase record
 * but not measured: React layout effects and ResizeObserver callbacks settle
 * before paint, so an intermediate commit there is never seen.
 */
function worstMovement(all: Frame[]) {
  const frames = all.filter((f) => f.painted);
  const worst: Record<string, { frame: number; max: number; from: string; to: string }> = {};
  for (let i = 1; i < frames.length; i++) {
    const a0 = frames[i - 1];
    const b0 = frames[i];
    // A new segment (different deal) or the module leaving/arriving is a deliberate swap.
    if (a0.seg !== b0.seg || a0.phase === null || b0.phase === null) continue;
    if (a0.phase === "revealed" && b0.phase === "open") continue;
    for (const k of Object.keys(b0.r)) {
      const a = a0.r[k];
      const b = b0.r[k];
      if (!a || !b) continue;
      // M1's measure: position and height. Width is text-driven (a status
      // line's length) and is used only for the overflow check below.
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[3] - b[3]));
      if (!worst[k] || d > worst[k].max) {
        worst[k] = { frame: i, max: d, from: `${a0.phase}/${a0.stage}`, to: `${b0.phase}/${b0.stage}` };
      }
    }
  }
  return worst;
}

const root = (page: Page) => page.locator('[data-mig-primitive="match-grid"]');
const sigils = (page: Page) => page.locator('[data-mig-primitive="match-grid"] [data-part="sigil"]');
const sealButtons = (page: Page) => page.locator('[data-mig-primitive="match-grid"] [data-part="seal"] .mg-seal');

async function startAdminMatch(page: Page): Promise<string> {
  await page.goto("/quiz/ranked");
  await page.waitForLoadState("load");
  // The app's own module, imported the way the page imports it (retried: the
  // first dev-server load may still be warming its dependency graph).
  for (let i = 0; i < 10; i++) {
    const ok = await page.evaluate(async () => {
      try { await import("/src/lib/ranked-public/client.ts"); return true; } catch { return false; }
    }).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(1000);
  }
  const id = await page.evaluate(async () => {
    const api = await import("/src/lib/ranked-public/client.ts");
    const active = await api.getActiveMatch().catch(() => null);
    if (active && (active as { matchId?: string }).matchId) {
      await api.forfeitMatch((active as { matchId: string }).matchId).catch(() => null);
    }
    const s = await api.joinQueue(null, undefined, { matchWithBot: true, preset: "admin.match" });
    window.history.replaceState({ usr: { matchId: s.matchId }, key: "mgp3", idx: 0 }, "", "/quiz/ranked");
    return s.matchId as string;
  });
  await page.reload();
  return id;
}

async function forfeit(page: Page, id: string) {
  await page.evaluate(async (matchId) => {
    const api = await import("/src/lib/ranked-public/client.ts");
    await api.forfeitMatch(matchId).catch(() => null);
  }, id);
}

for (const reduced of [false, true]) {
  for (const vp of VIEWPORTS) {
    test(`arena continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
      test.skip(!PERSONA, "MG_P3_PERSONA not set (needs the local P2 backend)");
      // `admin: false`: the client-side admin flag only drives the Admin shell
      // (whose dev-only E2E owner branch re-renders forever); the SERVER
      // authorizes `admin.match` from the bearer alone.
      await page.addInitScript((p) => localStorage.setItem("mogsy_e2e_identity", p),
        JSON.stringify({ ...JSON.parse(PERSONA), admin: false }));
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const matchId = await startAdminMatch(page);
      try {
        await expect(root(page)).toHaveAttribute("data-phase", "open", { timeout: 20_000 });
        await expect(page.locator('[data-testid="match-grid-phase"]')).not.toHaveAttribute("data-not-open", "true", { timeout: 20_000 });
        const rules = page.getByRole("button", { name: /got it/i });
        if (await rules.isVisible().catch(() => false)) await rules.click();
        const n = await sigils(page).count();
        const k = await sealButtons(page).count();
        await page.waitForTimeout(300);
        await page.evaluate(installSampler, REGIONS);
        const tag = `${vp.name}${reduced ? "-rm" : ""}`;
        await shot(page, path.join(SHOTS, `${tag}-01-open.png`));

        // First assignment by direct drag.
        const s0 = (await sigils(page).nth(0).boundingBox())!;
        const d1 = (await sealButtons(page).nth(Math.min(1, k - 1)).boundingBox())!;
        await page.mouse.move(s0.x + s0.width / 2, s0.y + s0.height / 2);
        await page.mouse.down();
        await page.mouse.move(s0.x + s0.width / 2 + 12, s0.y + 12, { steps: 3 });
        await page.mouse.move(d1.x + d1.width / 2, d1.y + d1.height / 2, { steps: 10 });
        await page.mouse.up();
        await expect(sigils(page).nth(0)).toHaveAttribute("data-state", "seated");
        await page.waitForTimeout(450);
        await shot(page, path.join(SHOTS, `${tag}-02-first.png`));

        // Reassignment by keyboard, then a partial board, then the rest.
        await sigils(page).nth(0).focus();
        await page.keyboard.press(String(k));
        const half = Math.ceil(n / 2);
        for (let i = 1; i < half; i++) {
          await sigils(page).nth(i).focus();
          await page.keyboard.press(String((i % k) + 1));
        }
        await page.waitForTimeout(450);
        await shot(page, path.join(SHOTS, `${tag}-03-partial.png`));
        for (let i = half; i < n; i++) {
          await sigils(page).nth(i).focus();
          await page.keyboard.press(String((i % k) + 1));
        }
        await page.waitForTimeout(650);
        await shot(page, path.join(SHOTS, `${tag}-04-full.png`));

        // Clipped seats: every sigil sits inside the board.
        const clip = await page.evaluate(() => {
          const b = document.querySelector('[data-mig-primitive="match-grid"] [data-part="board"]')!.getBoundingClientRect();
          return Array.from(document.querySelectorAll('[data-part="sigil"]')).map((e) => {
            const r = e.getBoundingClientRect();
            return Math.max(b.left - r.left, r.right - b.right, b.top - r.top, r.bottom - b.bottom);
          }).reduce((a, x) => Math.max(a, x), -Infinity);
        });
        expect(clip, "a sigil is clipped outside the board").toBeLessThanOrEqual(1);
        // Seal names never collide (ledger) and never leave the board.
        const names = await page.evaluate(() => {
          const b = document.querySelector('[data-mig-primitive="match-grid"] [data-part="board"]')!.getBoundingClientRect();
          const rs = Array.from(document.querySelectorAll(".mg-seal-name")).map((e) => e.getBoundingClientRect());
          let overlap = 0;
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i]; const c = rs[j];
            const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
            const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
            if (w > 1 && h > 1) overlap++;
          }
          const outside = rs.map((r) => Math.max(b.left - r.left, r.right - b.right)).reduce((a, x) => Math.max(a, x), -Infinity);
          return { overlap, outside };
        });
        expect(names.overlap, "seal names collide").toBe(0);
        expect(names.outside, "a seal name leaves the board").toBeLessThanOrEqual(1);

        const lock = page.locator('[data-mig-primitive="match-grid"] [data-part="lock"]');
        await expect(lock).toBeEnabled();
        await lock.click();
        await expect(root(page)).toHaveAttribute("data-phase", /locked|revealed/);
        await expect(root(page)).toHaveAttribute("data-phase", "revealed", { timeout: 25_000 });
        if (!reduced) {
          for (let i = 0; i < 4; i++) {
            await shot(page, path.join(SHOTS, `${tag}-05-reveal-f${i}.png`));
            await page.waitForTimeout(250);
          }
        }
        // The arena holds the settled board for the server's reveal window,
        // then opens the next deal; capture it if it is still on screen.
        if (await root(page).getAttribute("data-reveal-stage").catch(() => null) === "done") {
          await shot(page, path.join(SHOTS, `${tag}-06-settled.png`));
        }
        // Next segment: a new deal opens in the same host.
        await expect.poll(async () => sigils(page).count(), { timeout: 30_000 }).not.toBe(n);
        await expect(root(page)).toHaveAttribute("data-phase", "open", { timeout: 20_000 });
        await page.waitForTimeout(400);
        await shot(page, path.join(SHOTS, `${tag}-07-next.png`));

        const frames = await page.evaluate(() => (window as unknown as { __mgStop: () => Frame[] }).__mgStop());
        expect(frames.length).toBeGreaterThan(30);
        const seq: string[] = [];
        for (const f of frames) {
          const key = `${f.seg}@${f.fit}#${f.node}:${f.phase}/${f.stage}`;
          if (seq.length === 0 || !seq[seq.length - 1].startsWith(key + "@")) seq.push(`${key}@${f.t}`);
        }
        test.info().annotations.push({ type: "sequence", description: seq.join(" → ") });
        console.log("SEQ", seq.join(" -> "));
        // The server's reveal reached the board, and (normal motion) the
        // corrections visibly resolved, before the next deal replaced it. The
        // ledger/settled stages are recorded, not required: P2's frozen
        // `reveal_window_ms` (3000) minus the next module's title leaves the
        // arena ~1.5s, the M1 choreography's whole budget (see handoff).
        const reached = new Set(frames.filter((f) => f.phase === "revealed").map((f) => f.stage));
        test.info().annotations.push({ type: "reveal-stages", description: [...reached].join(",") });
        expect(reached.size, "the server reveal never reached the board").toBeGreaterThan(0);
        if (reduced) expect(reached.has("done"), "reduced motion must settle instantly").toBe(true);
        else expect(reached.has("travel") || reached.has("ledger") || reached.has("done")).toBe(true);
        const worst = worstMovement(frames);
        const report = Object.entries(worst).map(([r, w]) => `${r}: ${w.max.toFixed(2)}px @${w.frame} (${w.from} → ${w.to})`).join("\n");
        test.info().annotations.push({ type: "movement", description: report });
        // No page scroll at any point (focus moves included).
        const ys = frames.map((f) => f.scrollY);
        expect(Math.max(...ys) - Math.min(...ys), "the page scrolled").toBeLessThanOrEqual(BUDGET_PX);
        // The module never overflows the arena stage.
        for (const f of frames.filter((x) => x.painted)) {
          const st = f.r.stage; const v = f.r.viewport;
          if (!st || !v) continue;
          expect(v[1] + v[3], `stage overflow ${(v[1] + v[3] - st[1] - st[3]).toFixed(0)}px (deal ${f.seg}, ${f.phase}/${f.stage}, stage h ${st[3].toFixed(0)}, module h ${v[3].toFixed(0)})`).toBeLessThanOrEqual(st[1] + st[3] + BUDGET_PX);
          expect(v[0] + v[2], "stage overflow (x)").toBeLessThanOrEqual(st[0] + st[2] + BUDGET_PX);
        }
        for (const [r, w] of Object.entries(worst)) {
          expect(w.max, `${r} moved ${w.max}px between frames ${w.from} → ${w.to}\n${report}`).toBeLessThanOrEqual(BUDGET_PX);
        }
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflowX).toBeLessThanOrEqual(0);
      } finally {
        await forfeit(page, matchId);
      }
    });
  }
}
