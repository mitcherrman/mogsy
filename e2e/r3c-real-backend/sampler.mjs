// In-page geometry sampler (serialised into the page by Playwright).
// Records, on every animation frame, DOM mutation, scroll, resize and focus change:
//   * bounding boxes (viewport + document coords) of every region the R3A brief lists
//   * window / document / ancestor scroll offsets, scrollHeight/clientHeight
//   * focused element, viewport + scrollbar presence, layout-shift entries
export const REGIONS = {
  appRoot: '[data-testid="ranked-shell-probe"], #root',
  shell: '[data-testid="ranked-match"]',
  header: '[data-testid="ranked-header"]',
  railL: '.ranked-arena-grid > div:nth-child(1)',
  railR: '.ranked-arena-grid > div:nth-child(2)',
  focusCol: '[data-testid="ranked-focus-column"]',
  board: '[data-testid="ranked-question"]',
  body: '[data-testid="ranked-question-body"]',
  module: '[data-testid="mig-reconstruct"]',
  target: '[data-testid="reconstruct-target"]',
  sockets: '[data-testid="reconstruct-sockets"]',
  socket0: '[data-testid="reconstruct-socket-0"]',
  status: '[data-testid="reconstruct-hint"],[data-testid="reconstruct-verdict"]',
  region: '[data-testid="reconstruct-tray-box"]',
  tray: '[data-testid="reconstruct-tray"]',
  evidence: '[data-testid="reconstruct-evidence"]',
  breakdown: '[data-part="breakdown"]',
  equation: '[data-testid="reconstruct-evidence-total"]',
  lock: '[data-testid="reconstruct-lock"]',
  footer: '[data-part="footer"]',
  opponentLine: '[data-testid="reconstruct-opponent-progress"]',
  timeline: '[data-testid="ranked-round-timeline"]',
  outro: '[data-testid="ranked-match-outro"]',
  endScreen: '[data-testid="ranked-match-over"]',
  grid: '.ranked-arena-grid',
  outroResult: '[data-testid="match-outro-result"]',
  outroScore: '[data-testid="match-outro-score"]',
};

export function installSampler(regions) {
  const frames = [];
  const shifts = [];
  const t0 = performance.now();
  let running = true;
  let last = "";
  const desc = (el) => {
    if (!el || el === document.body) return el ? "body" : "none";
    return el.getAttribute?.("data-testid") || el.getAttribute?.("data-part") || el.tagName.toLowerCase();
  };
  const ancestors = (from) => {
    const out = [];
    for (let e = from; e; e = e.parentElement) {
      const overflow = e.scrollHeight - e.clientHeight;
      if (e.scrollTop !== 0 || e.scrollLeft !== 0 || overflow > 0.5) {
        out.push([desc(e) + (e.className && typeof e.className === "string" ? "." + e.className.split(/\s+/)[0] : ""),
          e.scrollTop, e.scrollLeft, e.scrollHeight, e.clientHeight]);
      }
    }
    return out;
  };
  const sample = (why) => {
    if (!running) return;
    const mod = document.querySelector(regions.module);
    const f = {
      t: Math.round((performance.now() - t0) * 10) / 10,
      why,
      step: window.__step ?? null,
      phase: mod?.getAttribute("data-phase") ?? null,
      stage: mod?.getAttribute("data-reveal-stage") ?? null,
      target: document.querySelector(regions.target + " p")?.textContent ?? null,
      slots: mod?.getAttribute("data-slots") ?? null,
      filled: mod?.getAttribute("data-filled") ?? null,
      sy: window.scrollY, sx: window.scrollX,
      docTop: document.scrollingElement?.scrollTop ?? 0,
      docSH: document.scrollingElement?.scrollHeight ?? 0,
      docCH: document.scrollingElement?.clientHeight ?? 0,
      iw: window.innerWidth, ih: window.innerHeight,
      cw: document.documentElement.clientWidth, ch: document.documentElement.clientHeight,
      focus: desc(document.activeElement),
      host: (() => {
        const sh = document.querySelector('[data-testid="ranked-match"]');
        return [
          sh?.getAttribute("data-reveal-hold") ?? "-",
          sh?.getAttribute("data-presentation-phase") ?? "-",
          document.querySelector('[data-testid="ranked-match-outro"]') ? "outro" : "",
          document.querySelector('[data-testid="ranked-match-over"]') ? "over" : "",
          document.querySelector('[data-testid="ranked-recovering"]') ? "recov" : "",
        ].join("|");
      })(),
      anc: mod ? ancestors(mod) : [],
      // R3C: the arena grid row's own overflow (content taller than its box).
      gridOv: (() => { const g = document.querySelector(regions.grid); return g ? g.scrollHeight - g.clientHeight : null; })(),
      r: {},
    };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      if (b.width || b.height) {
        f.r[k] = [Math.round(b.top * 10) / 10, Math.round(b.left * 10) / 10,
          Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10];
      }
    }
    const key = JSON.stringify([f.step, f.phase, f.stage, f.target, f.slots, f.filled, f.sy, f.sx, f.docTop, f.host, f.gridOv,
      f.docSH, f.docCH, f.iw, f.ih, f.cw, f.focus, f.anc, f.r]);
    if (key !== last) { last = key; frames.push(f); }
  };
  const raf = () => { sample("raf"); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const mo = new MutationObserver(() => sample("mut"));
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const onScroll = () => sample("scroll");
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);
  document.addEventListener("focusin", () => sample("focus"));
  let po = null;
  try {
    po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        shifts.push({ t: Math.round(e.startTime - t0), value: e.value, hadInput: e.hadRecentInput,
          sources: (e.sources || []).map((s) => ({ node: desc(s.node),
            from: [s.previousRect.y, s.previousRect.height], to: [s.currentRect.y, s.currentRect.height] })) });
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch { /* unsupported */ }
  window.__rcStop = () => {
    running = false; mo.disconnect(); window.removeEventListener("scroll", onScroll, true);
    if (po) po.disconnect();
    return { frames, shifts };
  };
  window.__rcSnap = () => sample("manual");
}

/** Analyse samples: per-region movement of TOP / HEIGHT / LEFT / WIDTH. */
export function analyse(frames, { skip = [], viewportCoords = false } = {}) {
  const keys = new Set(frames.flatMap((f) => Object.keys(f.r)));
  const out = {};
  for (const k of keys) {
    if (skip.includes(k)) continue;
    const seen = frames.filter((f) => f.r[k]).map((f) => ({ f, r: f.r[k], sy: f.sy }));
    if (!seen.length) continue;
    let maxStepTop = 0, maxStepH = 0, maxStepLeft = 0, maxStepW = 0;
    let who = null;
    // document-coordinate top: viewport top + scrollY (a real user scroll is not a shift)
    const docTop = (s) => (viewportCoords ? s.r[0] : s.r[0] + s.sy);
    for (let i = 1; i < seen.length; i++) {
      const dT = Math.abs(docTop(seen[i]) - docTop(seen[i - 1]));
      const dH = Math.abs(seen[i].r[3] - seen[i - 1].r[3]);
      const dL = Math.abs(seen[i].r[1] - seen[i - 1].r[1]);
      const dW = Math.abs(seen[i].r[2] - seen[i - 1].r[2]);
      if (dT > maxStepTop) { maxStepTop = dT; who = seen[i].f.step + "/" + seen[i].f.phase + "/" + seen[i].f.stage; }
      maxStepH = Math.max(maxStepH, dH); maxStepLeft = Math.max(maxStepLeft, dL); maxStepW = Math.max(maxStepW, dW);
    }
    const tops = seen.map(docTop);
    out[k] = {
      n: seen.length, maxStepTop: +maxStepTop.toFixed(1), maxStepH: +maxStepH.toFixed(1),
      maxStepLeft: +maxStepLeft.toFixed(1), maxStepW: +maxStepW.toFixed(1),
      spreadTop: +(Math.max(...tops) - Math.min(...tops)).toFixed(1),
      spreadH: +(Math.max(...seen.map((s) => s.r[3])) - Math.min(...seen.map((s) => s.r[3]))).toFixed(1),
      first: seen[0].r, last: seen[seen.length - 1].r, at: who,
    };
  }
  return out;
}
