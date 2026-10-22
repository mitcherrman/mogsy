/**
 * PM2 — shared fixtures and geometry for the one-screen Practice specs.
 * Not a spec file: imported by `practice-one-screen.spec.ts` and
 * `practice-video.spec.ts`.
 */
import { expect, type Page } from "@playwright/test";

export const SHOTS = "test-results/pm2";

export const identity = {
  token: "pm2-practice-token",
  user: { id: "pm2-user", email: "pm2@example.test", is_anonymous: false },
  admin: false,
};

export type Choice = string | { label: string; image_path: string };
export type Q = {
  id: number; category: string; question_text: string; format: string; choices: Choice[];
  image_path?: string; metadata?: Record<string, unknown>; difficulty?: number;
  /** Long-text stress fixtures: may grow the page on a 360x640 phone. */
  stress?: boolean;
};

export const QUESTIONS: Q[] = [
  { id: 9101, category: "Summoner Spells", question_text: "What is the base cooldown of Flash, in seconds?",
    format: "multiple_choice", choices: ["300 seconds", "240 seconds", "180 seconds", "360 seconds"] },
  { id: 9102, category: "Item Components", question_text: "Which component builds into this item?",
    format: "multiple_choice", image_path: "assets/items/3031.png", metadata: { item_name: "Infinity Edge" },
    choices: ["B. F. Sword", "Pickaxe", "Cloak of Agility", "Long Sword"] },
  { id: 9103, category: "Champion Abilities", question_text: "What is the base cooldown of this champion's ultimate at rank 1?",
    format: "multiple_choice", metadata: {
      champion_name: "Lux", champion_icon_path: "assets/champions/Lux/icon.png",
      champion_splash_path: "assets/champions/Lux/splash.jpg",
    }, choices: ["60 seconds", "80 seconds", "40 seconds", "100 seconds"] },
  { id: 9104, category: "Champion Recognition", question_text: "Which of these champions is Lux?",
    format: "multiple_choice", choices: [
      { label: "Lux", image_path: "assets/champions/Lux/icon.png" },
      { label: "Ahri", image_path: "assets/champions/Ahri/icon.png" },
      { label: "Jinx", image_path: "assets/champions/Jinx/icon.png" },
      { label: "Garen", image_path: "assets/champions/Garen/icon.png" },
    ] },
  { id: 9105, category: "Objectives", stress: true, question_text:
      "When the Elder Dragon is slain after a team has already secured its Dragon Soul, how long does the "
      + "Aspect of the Dragon execute buff last on every living member of the slaying team, in seconds?",
    format: "multiple_choice", choices: ["150 seconds", "180 seconds", "120 seconds", "210 seconds"] },
  { id: 9106, category: "Wave Management", stress: true,
    question_text: "What is the main benefit of slow pushing a wave before an objective spawns?",
    format: "multiple_choice", choices: [
      "It builds a large wave that crashes into the enemy tower while your team takes the objective",
      "It guarantees the enemy jungler cannot contest the objective for the next forty-five seconds",
      "It resets the minion wave timer so the next cannon minion spawns one wave earlier than usual",
      "It grants your team bonus gold for every minion that dies under the enemy turret afterwards",
    ] },
  { id: 9107, category: "Runes", question_text: "Which keystone rune is shown here?",
    format: "multiple_choice", image_path: "assets/runes/Precision/Conqueror/Conqueror.png",
    metadata: { rune_name: "Conqueror" }, choices: ["Conqueror", "Press the Attack", "Lethal Tempo", "Fleet Footwork"] },
  { id: 9108, category: "Summoner Spells", question_text: "Which summoner spell is this?",
    format: "multiple_choice", image_path: "assets/summoners/SummonerTeleport.png",
    metadata: { summoner_name: "Teleport" }, choices: ["Teleport", "Ghost", "Cleanse", "Exhaust"] },
  { id: 9109, category: "Jungle", question_text: "At what game time does the first Scuttle Crab spawn?",
    format: "multiple_choice", choices: ["3:30", "2:30", "4:00"] },
  { id: 9110, category: "Items", question_text: "Does Guardian Angel revive its holder after a fatal hit?",
    format: "multiple_choice", choices: ["Yes", "No"] },
];
export const CORRECT: Record<number, string> = {
  9101: "300 seconds", 9102: "B. F. Sword", 9103: "80 seconds", 9104: "Lux", 9105: "150 seconds",
  9106: "It builds a large wave that crashes into the enemy tower while your team takes the objective",
  9107: "Conqueror", 9108: "Teleport", 9109: "3:30", 9110: "Yes",
};
/** Answered wrong on purpose, so the run has misses to replay. */
export const WRONG = new Set([9101, 9105, 9106]);
/** With `failFirst`, its first submit fails (HTTP 500): the reveal must hold for Try again. */
export const FAIL_FIRST = 9109;
export const DENSE_EXPLANATION = "Slow pushing stacks two or three waves into one, so the crash arrives while the enemy "
  + "is choosing between the objective and the tower. Done well it forces a lose-lose decision; done late it "
  + "simply hands the enemy a free wave to catch under their turret while they set up vision around the pit.";

export interface Counters {
  attempts: Record<number, number>;
  completions: number;
  analytics: string[];
  /** Question requests since the last launch (reset it before each launch). */
  served: number;
}

export async function prepare(page: Page, opts: { failFirst?: boolean } = {}): Promise<Counters> {
  const counters: Counters = { attempts: {}, completions: 0, analytics: [], served: 0 };
  await page.addInitScript(({ identity }) => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
    // Every header-title change, in order — the "advances exactly once" record.
    const w = window as unknown as { __pm2Titles: string[] };
    w.__pm2Titles = [];
    const watch = () => {
      const el = document.querySelector('[data-testid="ranked-header-title"]');
      const text = el?.textContent?.trim() ?? "";
      const done = document.body?.textContent?.includes("Quiz Complete") ? "RESULTS" : "";
      const value = text || done;
      if (value && w.__pm2Titles[w.__pm2Titles.length - 1] !== value) w.__pm2Titles.push(value);
    };
    new MutationObserver(watch).observe(document, { childList: true, subtree: true, characterData: true });
  }, { identity });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!["fetch", "xhr"].includes(request.resourceType())) return route.continue();
    if (url.hostname === "127.0.0.1" && !url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    if (p.endsWith("/rest/v1/analytics_events") && request.method() === "POST") {
      try {
        const body = JSON.parse(request.postData() ?? "{}");
        for (const row of Array.isArray(body) ? body : [body]) counters.analytics.push(String(row.event_name));
      } catch { /* not ours */ }
      return route.fulfill({ status: 201, json: [] });
    }
    if (p === "/api/quiz/sets") return route.fulfill({ json: { sets: [
      { id: 1, name: "All Current Questions", description: "Fixture", question_count: 10 },
    ] } });
    if (p === "/api/quiz/questions") {
      // A Quick Study subject deals round-robin across several categories:
      // the launch's first request gets the whole set, the rest get nothing.
      const batch = counters.served === 0 ? QUESTIONS.map(({ stress: _s, ...q }) => q) : [];
      counters.served += 1;
      return route.fulfill({ json: { questions: batch } });
    }
    if (p === "/api/quiz/attempts") {
      const body = JSON.parse(request.postData() ?? "{}");
      const id = Number(body.question_id);
      counters.attempts[id] = (counters.attempts[id] ?? 0) + 1;
      if (opts.failFirst && id === FAIL_FIRST && counters.attempts[id] === 1) {
        return route.fulfill({ status: 500, json: { detail: "fixture grading failure" } });
      }
      const correct = CORRECT[id] ?? "";
      const ok = body.selected_answer === correct;
      const explanation = id === 9106 ? DENSE_EXPLANATION
        : ok ? "That's right."
          : `The answer is ${correct}. Practice explanations can run to a couple of sentences, and the reveal box holds them.`;
      return route.fulfill({ json: {
        is_correct: ok, correct_answer: correct, explanation,
        xp_earned: ok ? 12 : 2, current_xp: 1240, current_streak: ok ? 3 : 0, rank: "Gold",
      } });
    }
    if (p === "/api/quiz/sessions") return route.fulfill({ json: { ok: true, session_id: 77 } });
    if (/\/api\/quiz\/sessions\/77\/complete$/.test(p)) {
      counters.completions += 1;
      return route.fulfill({ json: { ok: true } });
    }
    if (p === "/api/quiz/history") return route.fulfill({ json: {
      ok: true, is_pro: false, total_count: 0, limited: false, free_limit: 10, upsell_message: null, results: [],
    } });
    if (p.includes("/progress/")) return route.fulfill({ json: { attempts: 4, accuracy: 50, rank_name: "Gold", total_xp: 1200 } });
    if (p.includes("/categories/")) return route.fulfill({ json: { categories: [] } });
    if (p.includes("/achievements/")) return route.fulfill({ json: { achievements: [] } });
    if (p.includes("/missed-questions") || p.includes("/question-library")) {
      return route.fulfill({ json: { ok: true, results: [], total_count: 0 } });
    }
    if (p.startsWith("/api/ranked/") || p.startsWith("/api/history/")) return route.fulfill({ json: { results: [], records: [] } });
    if (p.includes("/profiles")) return route.fulfill({ json: { id: "p1", user_id: "pm2-user", display_name: "PM2 Tester", is_anonymous: false, socials: {} } });
    return route.fulfill({ json: [] });
  });
  return counters;
}

export const VIEWPORTS = [
  { name: "360x640", width: 360, height: 640, kind: "portrait" },
  { name: "390x844", width: 390, height: 844, kind: "portrait" },
  { name: "430x932", width: 430, height: 932, kind: "portrait" },
  { name: "844x390", width: 844, height: 390, kind: "landscape" },
  { name: "1280x800", width: 1280, height: 800, kind: "desktop" },
  { name: "1440x900", width: 1440, height: 900, kind: "desktop" },
] as const;
export type Viewport = (typeof VIEWPORTS)[number];

export async function startPractice(page: Page, tile = 0) {
  await page.goto("/quiz", { waitUntil: "domcontentloaded" });
  const rail = page.getByRole("navigation", { name: "Practice by subject" });
  await expect(rail).toBeVisible({ timeout: 30_000 });
  await rail.scrollIntoViewIfNeeded();
  await rail.getByRole("button").nth(tile).click();
  await expect(page.getByTestId("ranked-question")).toBeVisible({ timeout: 30_000 });
}

/** The tablets' entrance (350ms + stagger) settles before geometry is read. */
export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

export async function onStage(page: Page): Promise<Q> {
  const prompt = (await page.locator('[data-testid="ranked-question"] [data-surface-region="prompt"] h2').innerText()).trim();
  const q = QUESTIONS.find((x) => x.question_text === prompt);
  expect(q, `unknown prompt on stage: ${prompt}`).toBeTruthy();
  return q!;
}

export interface Geometry {
  vh: number; vw: number; vOverflow: number; hOverflow: number;
  chrome: { top: number; bottom: number; height: number; oneLine: boolean };
  brand: { visible: boolean; text: string };
  stage: { top: number; bottom: number; left: number; right: number };
  prompt: { top: number; bottom: number; clipped: boolean };
  grid: { top: number };
  tablets: Array<{ top: number; bottom: number; left: number; right: number; h: number; clipped: boolean }>;
  reveal: { top: number; bottom: number; height: number } | null;
  revealDocTop: number | null;
  bar: { top: number; bottom: number } | null;
  matchBottom: number;
  scrollers: string[];
  nextButtons: number;
  friendsVisible: boolean;
}

export async function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
    const chromeEl = document.querySelector<HTMLElement>('[data-testid="practice-chrome"]')!;
    const c = box(chromeEl);
    const kids = [...chromeEl.querySelectorAll<HTMLElement>("a, h1, span")].filter((el) => el.getBoundingClientRect().height > 1);
    const oneLine = kids.every((el) => { const r = el.getBoundingClientRect(); return r.top >= c.top - 1 && r.bottom <= c.bottom + 1; });
    const brandEl = document.querySelector<HTMLElement>('[data-testid="practice-brand"]')!;
    const b = box(brandEl);
    const stageEl = document.querySelector<HTMLElement>('[data-testid="ranked-question"]')!;
    const promptEl = stageEl.querySelector<HTMLElement>('[data-surface-region="prompt"] h2')!;
    const tablets = [...stageEl.querySelectorAll<HTMLElement>("[data-quiz-choice]")].map((t) => ({
      ...box(t), h: t.getBoundingClientRect().height,
      clipped: t.scrollHeight > t.clientHeight + 2 || t.scrollWidth > t.clientWidth + 2,
    }));
    const revealEl = document.querySelector<HTMLElement>(".practice-reveal-slot");
    const barEl = document.querySelector<HTMLElement>('[data-testid="ranked-mobile-bottombar"]');
    const root = document.querySelector<HTMLElement>('[data-testid="practice-arena"]')!;
    const scrollers: string[] = [];
    root.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const cs = getComputedStyle(el);
      if ((/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)
        || (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)) {
        scrollers.push(`${el.tagName}.${String(el.className).slice(0, 60)}`);
      }
    });
    const nextButtons = [...document.querySelectorAll("button, a")].filter((el) =>
      /^(next question|see results)$/i.test((el.textContent ?? "").trim())
      || el.getAttribute("data-testid") === "practice-next").length;
    const friends = document.querySelector<HTMLElement>('[data-testid="friends-drawer-trigger"]');
    const de = document.documentElement;
    return {
      vh: window.innerHeight, vw: window.innerWidth,
      vOverflow: de.scrollHeight - de.clientHeight, hOverflow: de.scrollWidth - de.clientWidth,
      chrome: { top: c.top, bottom: c.bottom, height: c.height, oneLine },
      brand: { visible: b.height > 0 && b.top >= 0 && b.bottom <= window.innerHeight && b.right <= window.innerWidth + 1, text: brandEl.textContent ?? "" },
      stage: box(stageEl), prompt: { ...box(promptEl), clipped: promptEl.scrollHeight > promptEl.clientHeight + 2 },
      // Document coordinates: holding the reveal may scroll a landscape page.
      grid: { top: box(stageEl.querySelector('[data-testid="answer-grid"]')!).top + window.scrollY },
      revealDocTop: revealEl ? box(revealEl).top + window.scrollY : null,
      tablets,
      reveal: revealEl ? box(revealEl) : null,
      bar: barEl ? box(barEl) : null,
      matchBottom: box(document.querySelector('[data-testid="ranked-match"]')!).bottom,
      scrollers, nextButtons,
      friendsVisible: !!friends && friends.getBoundingClientRect().width > 0 && getComputedStyle(friends).display !== "none",
    };
  });
}

export function assertFits(vp: Viewport, q: Q, m: Geometry, label: string) {
  console.log(`[pm2] ${label} ${JSON.stringify({ vOverflow: m.vOverflow, hOverflow: m.hOverflow, chrome: m.chrome,
    stage: m.stage, prompt: m.prompt, grid: m.grid, reveal: m.reveal, bar: m.bar, matchBottom: m.matchBottom,
    tablets: m.tablets.map((t) => [Math.round(t.top), Math.round(t.bottom), Math.round(t.h)]) })}`);
  expect(m.hOverflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(m.scrollers, `${label}: inner scroll containers`).toEqual([]);
  expect(m.nextButtons, `${label}: a Next / See results control`).toBe(0);
  expect(m.chrome.oneLine, `${label}: header wraps`).toBe(true);
  expect(m.chrome.height, `${label}: header taller than one line`).toBeLessThanOrEqual(34);
  expect(m.brand.text).toBe("mogzy.lol");
  expect(m.prompt.clipped, `${label}: prompt clipped`).toBe(false);
  expect(m.prompt.top).toBeGreaterThanOrEqual(m.stage.top - 1);
  expect(m.prompt.bottom).toBeLessThanOrEqual(m.stage.bottom + 1);
  expect(m.tablets.length).toBeGreaterThan(0);
  for (const t of m.tablets) {
    expect(t.clipped, `${label}: tablet text clipped`).toBe(false);
    expect(t.top).toBeGreaterThanOrEqual(m.stage.top - 1);
    expect(t.bottom, `${label}: tablet outside the stage`).toBeLessThanOrEqual(m.stage.bottom + 1);
    expect(t.left).toBeGreaterThanOrEqual(m.stage.left - 1);
    expect(t.right).toBeLessThanOrEqual(m.stage.right + 1);
    expect(t.h, `${label}: tablet below a touch target`).toBeGreaterThanOrEqual(40);
  }
  const mustFit = vp.kind === "portrait" && !(vp.height < 700 && q.stress);
  if (mustFit) {
    expect(m.vOverflow, `${label}: the page scrolls`).toBeLessThanOrEqual(1);
    expect(m.brand.visible, `${label}: mogzy.lol off screen`).toBe(true);
    for (const t of m.tablets) expect(t.bottom, `${label}: tablet below the fold`).toBeLessThanOrEqual(m.vh + 1);
    if (m.reveal) expect(m.reveal.bottom, `${label}: reveal box below the fold`).toBeLessThanOrEqual(m.vh + 1);
    if (m.bar) expect(m.bar.bottom, `${label}: bottom bar below the fold`).toBeLessThanOrEqual(m.vh + 1);
  }
  if (vp.kind === "desktop") {
    expect(m.matchBottom, `${label}: arena taller than the viewport`).toBeLessThanOrEqual(m.vh + 1);
    expect(m.brand.visible).toBe(true);
  }
  if (vp.kind !== "desktop") {
    expect(m.friendsVisible, `${label}: Community trigger over the arena`).toBe(false);
  }
}

/** Holding the reveal pauses the countdown — what a reader does, and what a check needs. */
export async function holdReveal(page: Page) {
  const footer = page.locator("[data-practice-reveal-footer]");
  await expect(footer).toBeVisible();
  // The box's centre, on screen: its edges can sit under the dock's fixed
  // tabs on desktop, and below the fold on a landscape phone.
  // Centred, not merely in view: on a scrolling landscape page the sticky
  // bottom bar covers the last 50px of the screen.
  await footer.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await footer.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(footer).toHaveAttribute("data-advance-paused", "true");
  return async () => { await page.mouse.up(); };
}

export function tablet(page: Page, label: string) {
  return page.getByRole("group", { name: "Answer options" }).getByRole("button", { name: label, exact: false }).first();
}

export async function expectAdvanced(page: Page, next: number, total: number) {
  if (next > total) await expect(page.getByText("Quiz Complete")).toBeVisible({ timeout: 20_000 });
  else await expect(page.getByTestId("ranked-header-title")).toContainText(`Question ${next} / ${total}`, { timeout: 20_000 });
}

