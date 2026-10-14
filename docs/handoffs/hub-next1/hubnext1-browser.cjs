// HUB-NEXT1 real-browser verification: headless Edge against production
// preview builds (base 9fb89ac3 :5277, branch flag OFF :5278, branch flag ON
// :5279), real production API. Writes results JSON + screenshots.
const path = require("path");
const fs = require("fs");
const { chromium } = require("C:/Users/mlmit/mogzy-wt/ux3a-worlds/node_modules/playwright");

const BASE = "http://localhost:5277";
const OFF = "http://localhost:5278";
const ON = "http://localhost:5279";
const HUB = "/lol/pro-play";
const FINAL = "115660540726095133"; // Worlds 2026 Knockout Final, 14 Nov
const OUT = process.env.OUT_DIR || path.join(__dirname, "hubnext1-out");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`);
};

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

async function board(page) {
  return page.evaluate(() => {
    const mc = document.getElementById("match-center");
    const fx = mc?.querySelector('[data-testid="tournament-fixture"]');
    const un = mc?.querySelector('[data-testid="next-unresolved"]');
    return {
      url: location.pathname + location.search,
      h2: mc?.querySelector("h2")?.textContent ?? null,
      h3: mc?.querySelector("h3")?.textContent ?? null,
      loading: !!mc?.querySelector('[data-testid="match-center-loading"]'),
      fixture: fx ? { id: fx.dataset.matchId, state: fx.dataset.state, link: fx.querySelector('[data-testid="fixture-event-link"]')?.getAttribute("href") } : null,
      unresolved: un ? { reason: un.dataset.reason, partial: un.dataset.partial ?? null, text: un.innerText.slice(0, 400) } : null,
      upcoming: !!mc?.querySelector('[data-testid="upcoming-summary"]'),
      summary: !!mc?.querySelector('[data-testid="match-summary"]'),
      gone: !!mc?.querySelector('[data-testid="next-gone"]'),
      pill: document.querySelector('[data-testid="tournament-spotlight"]')?.getAttribute("href") ?? null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      tournamentReqs: performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\/tournament\/[a-z0-9-]+$/.test(n)).map((n) => n.replace(/^.*\/tournament\//, "")),
    };
  });
}

async function settle(page, ms = 45000) {
  await page
    .waitForFunction(
      () => {
        const mc = document.getElementById("match-center");
        if (!mc || mc.querySelector('[data-testid="match-center-loading"]')) return false;
        const un = mc.querySelector('[data-testid="next-unresolved"]');
        if (un && un.dataset.reason === "slow") return false;
        return !!mc.querySelector('[data-testid="tournament-fixture"],[data-testid="next-unresolved"],[data-testid="upcoming-summary"],[data-testid="match-summary"],h3');
      },
      null,
      { timeout: ms },
    )
    .catch(() => {});
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function open(ctx, url) {
  const page = await ctx.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      break;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  await settle(page);
  return page;
}

async function shot(page, name) {
  const mc = await page.$("#match-center");
  await page.screenshot({ path: path.join(OUT, `${name}-viewport.png`) });
  if (mc) await mc.screenshot({ path: path.join(OUT, `${name}-board.png`) });
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const phone = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    // 1. The original defect, on the starting commit.
    let p = await open(ctx, `${BASE}${HUB}?next=${FINAL}`);
    let b = await board(p);
    check("base 9fb89ac3 reproduces: ?next=<Final> shows an unrelated match", b.gone && (b.upcoming || b.summary) && b.h3 !== "TBD vs TBD", b);
    await shot(p, "01-base-wrong-match-desktop");
    await p.close();

    // 2. The fix, flag OFF, desktop: the Final itself, canonical link.
    p = await open(ctx, `${OFF}${HUB}?next=${FINAL}`);
    b = await board(p);
    check("OFF desktop: Final drawn from the tournament schedule", b.fixture?.id === FINAL && b.fixture.state === "upcoming" && !b.summary && !b.upcoming && !b.gone, b);
    check("OFF: link is the canonical Worlds page", b.fixture?.link === "/lol/pro-play/tournament/worlds-2026", b.fixture?.link);
    check("OFF: DCGI stays featured on 13 Oct; Worlds read only for the link", b.pill === "/lol/pro-play/tournament/dcgi-2026" && b.tournamentReqs.includes("worlds-2026"), { pill: b.pill, reqs: b.tournamentReqs });
    check("OFF: URL keeps the requested match id", b.url === `${HUB}?next=${FINAL}`, b.url);
    await shot(p, "02-off-final-desktop");
    // Refresh the direct link.
    await p.reload({ waitUntil: "domcontentloaded" });
    await settle(p);
    b = await board(p);
    check("OFF desktop: refresh keeps the Final", b.fixture?.id === FINAL && !b.summary, b.fixture);
    // The link opens the published Worlds page.
    await p.click('[data-testid="fixture-event-link"]');
    await p.waitForURL(/tournament\/worlds-2026/, { timeout: 30000 }).catch(() => {});
    check("OFF: event link opens /lol/pro-play/tournament/worlds-2026", /\/lol\/pro-play\/tournament\/worlds-2026$/.test(new URL(p.url()).pathname), p.url());
    await p.close();

    // 3. Phone, flag OFF, plus refresh.
    p = await open(phone, `${OFF}${HUB}?next=${FINAL}`);
    b = await board(p);
    check("OFF phone: Final drawn, no horizontal scroll", b.fixture?.id === FINAL && b.scrollWidth <= b.innerWidth, { fixture: b.fixture, sw: b.scrollWidth, iw: b.innerWidth });
    await shot(p, "03-off-final-phone");
    await p.reload({ waitUntil: "domcontentloaded" });
    await settle(p);
    b = await board(p);
    check("OFF phone: refresh keeps the Final", b.fixture?.id === FINAL && !b.summary, b.fixture);
    await p.close();

    // 4. Flag ON: same board, link to the experience's Schedule for that match.
    p = await open(ctx, `${ON}${HUB}?next=${FINAL}`);
    b = await board(p);
    check("ON desktop: Final drawn", b.fixture?.id === FINAL && !b.summary, b.fixture);
    check("ON: link is the Worlds Schedule screen for the match", b.fixture?.link === `/lol/pro-play/tournament/worlds-2026/schedule?match=${FINAL}`, b.fixture?.link);
    await shot(p, "04-on-final-desktop");
    await p.click('[data-testid="fixture-event-link"]');
    await p.waitForURL(/\/schedule/, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(3000);
    const sched = await p.evaluate(() => ({ url: location.pathname + location.search, exp: !!document.querySelector("[data-testid='worlds-experience']") }));
    check("ON: link lands on the experience Schedule with ?match=", sched.url === `/lol/pro-play/tournament/worlds-2026/schedule?match=${FINAL}` && sched.exp, sched);
    await p.screenshot({ path: path.join(OUT, "05-on-schedule-landing-desktop.png") });
    await p.close();
    p = await open(phone, `${ON}${HUB}?next=${FINAL}`);
    b = await board(p);
    check("ON phone: Final drawn, no horizontal scroll", b.fixture?.id === FINAL && b.scrollWidth <= b.innerWidth, { fixture: b.fixture, sw: b.scrollWidth });
    await shot(p, "06-on-final-phone");
    await p.close();

    // 5. Unknown fixture: honest unresolved state; clearing returns to normal.
    p = await open(ctx, `${OFF}${HUB}?next=999999999999999999`);
    b = await board(p);
    check("unknown id: 'unverified', nothing in its place", b.unresolved?.reason === "unverified" && !b.summary && !b.upcoming && !b.fixture, b.unresolved);
    await shot(p, "07-off-unknown-desktop");
    await p.click('[data-testid="next-unresolved"] button:has-text("Show the latest match")');
    await settle(p);
    b = await board(p);
    check("clearing returns to the normal Match Center (clean URL)", b.url === HUB && (b.summary || b.upcoming) && !b.unresolved, { url: b.url, h2: b.h2, h3: b.h3 });
    await p.close();
    p = await open(phone, `${OFF}${HUB}?next=999999999999999999`);
    await shot(p, "08-off-unknown-phone");
    b = await board(p);
    check("unknown id phone: no horizontal scroll", b.scrollWidth <= b.innerWidth && b.unresolved?.reason === "unverified", { sw: b.scrollWidth });
    await p.close();

    // 6. Ordinary visit: unchanged automatic pick, no Worlds read (DCGI featured).
    const pb = await open(ctx, `${BASE}${HUB}`);
    const bb = await board(pb);
    await pb.close();
    p = await open(ctx, `${OFF}${HUB}`);
    b = await board(p);
    check("ordinary visit: same automatic board as base", b.h2 === bb.h2 && b.h3 === bb.h3, { base: [bb.h2, bb.h3], branch: [b.h2, b.h3] });
    check("ordinary visit: no Worlds tournament request", !b.tournamentReqs.includes("worlds-2026"), b.tournamentReqs);
    // 7. A fixture from the live upcoming feed: existing presentation, no lookup.
    const chip = await p.$('[data-testid="upcoming-chip"]');
    if (chip) {
      await chip.click();
      await p.waitForURL(/next=/, { timeout: 15000 }).catch(() => {});
      const nextUrl = new URL(p.url());
      await p.close();
      p = await open(ctx, `${OFF}${nextUrl.pathname}${nextUrl.search}`);
      b = await board(p);
      check("feed-listed ?next=: upcoming board, no tournament lookup", b.upcoming && !b.fixture && !b.tournamentReqs.includes("worlds-2026"), { url: b.url, h3: b.h3, reqs: b.tournamentReqs });
    } else {
      check("feed-listed ?next=: (no upcoming chip in production right now)", true, "skipped");
    }
    // 8. ?game= from the rail keeps working.
    const series = await p.$('[data-testid="series-chip"]');
    if (series) {
      await series.click();
      await p.waitForURL(/game=/, { timeout: 15000 }).catch(() => {});
      const gameUrl = new URL(p.url());
      await p.close();
      p = await open(ctx, `${OFF}${gameUrl.pathname}${gameUrl.search}`);
      b = await board(p);
      check("?game= deep link: the chosen game", b.summary && b.url === gameUrl.pathname + gameUrl.search, { url: b.url, h3: b.h3 });
      const gameId = gameUrl.searchParams.get("game");
      await p.close();
      // 9. Both parameters: the fixture keeps the board.
      p = await open(ctx, `${OFF}${HUB}?next=${FINAL}&game=${gameId}`);
      b = await board(p);
      check("?next=<Final>&game=<id>: the Final, not the game", b.fixture?.id === FINAL && !b.summary, b.fixture);
      await p.close();
      const pb2 = await open(ctx, `${BASE}${HUB}?next=${FINAL}&game=${gameId}`);
      const bb2 = await board(pb2);
      check("(base, for comparison) ?next=<Final>&game=<id> showed the game", bb2.summary, { h3: bb2.h3, gone: bb2.gone });
      await pb2.close();
    } else {
      await p.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, "browser-results.json"), JSON.stringify(results, null, 2));
    console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
    await browser.close();
  }
})();
