/**
 * ACADEMY STARTUP — in-page probe, injected by run.mjs before any page script.
 * Measurement only: it never changes what the app does, EXCEPT that it answers
 * Supabase writes (analytics rows, RPCs) locally so a measurement never lands
 * in the production funnel. Reads pass through.
 *
 * Records on window.__acs:
 *   frames   every requestAnimationFrame timestamp
 *   cond     first frame at which each readiness condition held (root,
 *            framesLoaded, visibleCoversLoaded, mogzyLoaded, patchLoaded,
 *            fontsReady, layoutOpaque, visuallyComplete, vcNoPatch, ...)
 *   marks    navLol (the client-side hand-off), veilOn/veilLift
 *   lt/loaf  long tasks / long animation frames (Chromium)
 *   el/lcp/paint  element timing, LCP, paint timing
 *   surface  when the shell's startup surface was shown / removed
 *   quality  the Orrery's data-quality over time
 * Optional window.__ACS_VEIL = {maxMs, smooth, opaque} prototypes a held veil
 * (an overlay from the hand-off until the first screen is ready).
 */
(() => {
  if (window.__acs) return;
  const T = (window.__acs = {
    frames: [], marks: {}, cond: {}, lt: [], loaf: [], lcp: [], paint: [], el: [], nav: [],
    quality: [], surface: [], imgs: {}, stubbed: 0, coverRects: null,
  });
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  const now = () => performance.now();
  const mark = (k) => { if (T.marks[k] == null) T.marks[k] = now(); };

  // ---- never write analytics into the production funnel (reads pass through) ----
  const isWrite = (url, method) => /supabase\.co\/(rest\/v1|functions\/v1)\//.test(url) && method && method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD";
  const of = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const method = (init && init.method) || (input && input.method) || "GET";
      if (url && isWrite(url, method)) {
        T.stubbed++;
        const isRpc = /\/rpc\//.test(url);
        return Promise.resolve(new Response(isRpc ? "null" : "", { status: isRpc ? 200 : 201, headers: { "content-type": "application/json" } }));
      }
    } catch (e) {}
    return of(input, init);
  };
  if (navigator.sendBeacon) {
    const ob = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => (/supabase\.co/.test(String(url)) ? (T.stubbed++, true) : ob(url, data));
  }

  // ---- route changes (React Router uses history.replaceState for replace:true) ----
  for (const m of ["pushState", "replaceState"]) {
    const o = history[m];
    history[m] = function (...a) {
      const r = o.apply(this, a);
      T.nav.push([now(), location.pathname]);
      if (location.pathname === "/lol") mark("navLol");
      return r;
    };
  }

  // ---- performance observers ----
  const po = (type, fn) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) {} };
  po("longtask", (e) => T.lt.push([Math.round(e.startTime), Math.round(e.duration)]));
  po("long-animation-frame", (e) =>
    T.loaf.push({
      s: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration || 0),
      render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
      style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
      scripts: (e.scripts || []).slice(0, 5).map((s) => ({
        src: (s.sourceURL || "").split("/").pop(), fn: s.sourceFunctionName, inv: (s.invoker || "").slice(0, 60),
        d: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration || 0),
      })),
    }));
  po("largest-contentful-paint", (e) => T.lcp.push([Math.round(e.startTime), e.size, e.url ? e.url.split("/").pop() : e.element && e.element.tagName]));
  po("paint", (e) => T.paint.push([e.name, Math.round(e.startTime)]));
  po("element", (e) => T.el.push([e.identifier, Math.round(e.renderTime), Math.round(e.loadTime), (e.url || "").split("/").pop()]));

  // ---- tag images for Element Timing as they are inserted (before first paint) ----
  const tag = (img, given) => {
    if (!img || img.tagName !== "IMG" || img.hasAttribute("elementtiming")) return;
    const src = given || img.getAttribute("src") || "";
    let id = null;
    if (/academy-book-frame/.test(src)) id = "frame";
    else if (/\/splash\//.test(src)) id = "cover:" + (src.match(/champions\/([^/]+)\//) || [])[1];
    else if (/mascot/.test(src)) id = "mascot:" + src.split("/").pop();
    else if (/academy-broadcast-book/.test(src)) id = "patchbook";
    else if (/icon\.png/.test(src)) id = "icon:" + (src.match(/champions\/([^/]+)\//) || [])[1];
    else if (/skyline/.test(src)) id = "skyline";
    if (id) Element.prototype.__sa ? Element.prototype.__sa.call(img, "elementtiming", id) : img.setAttribute("elementtiming", id);
  };
  // Cached images load synchronously when src is set, before insertion: tag at src-set time.
  try {
    const sa = Element.prototype.setAttribute;
    Object.defineProperty(Element.prototype, "__sa", { value: sa });
    Element.prototype.setAttribute = function (n, v) {
      if (this.tagName === "IMG" && n === "src") tag(this, String(v));
      return sa.call(this, n, v);
    };
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set(v) { tag(this, String(v)); d.set.call(this, v); },
    });
  } catch (e) {}
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === "attributes") { tag(r.target); continue; }
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "IMG") tag(n);
        else n.querySelectorAll && n.querySelectorAll("img").forEach(tag);
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });

  // ---- per-frame readiness ----
  const first = (k, t) => { if (T.cond[k] == null) T.cond[k] = Math.round(t); };
  const ok = (img) => img && img.complete && img.naturalWidth > 0;
  let lastQuality = null, lastSurface = false, checksUntil = Infinity;
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh() && r.right > 0 && r.left < vw() && r.width > 0; };
  function check(t) {
    if (document.querySelector('[data-testid="mogzy-entry-v2"]')) first("landingDom", t);
    const lm = document.querySelector('[data-testid="mogzy-entry-v2"] img');
    if (ok(lm)) first("landingMascot", t);
    if (document.querySelector('[data-testid="mogzy-entry-v2"][data-entering="true"]')) first("entering", t);
    const surface = !!document.querySelector("[data-startup-surface]");
    if (surface !== lastSurface) { T.surface.push([Math.round(t), surface]); lastSurface = surface; }
    if (location.pathname !== "/lol") return;
    first("onLol", t);
    if (t > checksUntil) return;
    const root = document.querySelector(".o35-root");
    if (!root) return;
    first("root", t);
    const q = root.getAttribute("data-quality");
    if (q !== lastQuality) { T.quality.push([Math.round(t), q]); lastQuality = q; }
    const fade = document.querySelector(".animate-page-fade-in");
    const fadeOk = !fade || parseFloat(getComputedStyle(fade).opacity) >= 0.99;
    if (fadeOk) first("layoutOpaque", t);
    if (document.querySelector('.o35-stage[data-ready="true"]')) first("engineReady", t);
    const imgs = Array.from(document.querySelectorAll(".o35-book img"));
    const frames = imgs.filter((i) => /academy-book-frame/.test(i.src));
    const covers = imgs.filter((i) => /\/splash\//.test(i.src));
    const frameOk = frames.length === 4 && frames.every(ok);
    if (frameOk) first("framesLoaded", t);
    if (covers.length === 4) first("coversInDom", t);
    const slots = Array.from(document.querySelectorAll(".o35-book .o35-slot"));
    const visSlots = slots.filter(onScreen);
    const visCoversOk = visSlots.length > 0 && visSlots.every((s) => ok(s.querySelector('img[src*="/splash/"]')));
    if (visCoversOk) first("visibleCoversLoaded", t);
    if (covers.length === 4 && covers.every(ok)) first("allCoversLoaded", t);
    const mog = document.querySelector(".o35-mogzy img");
    const mogOk = ok(mog);
    if (mogOk) first("mogzyLoaded", t);
    const full = root.getAttribute("data-layout") === "full";
    const pc = document.querySelector(full ? '[data-testid="academy-broadcast-centerpiece"]' : '[data-testid="academy-broadcast-centerpiece-mobile"]');
    let patchOk = false;
    if (pc) {
      const loading = /Receiving transmission/.test(pc.textContent || "");
      if (!loading) first("patchFeedSettled", t);
      const pimgs = Array.from(pc.querySelectorAll("img"));
      patchOk = !loading && pimgs.length > 0 && pimgs.every(ok);
      if (patchOk) first("patchLoaded", t);
    }
    const patchVisible = pc ? onScreen(pc) : false;
    const fontsOk = document.fonts && document.fonts.check('700 20px "Cinzel"') && document.fonts.check('500 20px "Cinzel"') && document.fonts.check('400 12px "Space Mono"') && document.fonts.check('400 12px "Inter"');
    if (fontsOk) first("fontsReady", t);
    // Visually complete: everything ON THE FIRST SCREEN is in (below-the-fold extras excluded).
    if (fadeOk && frameOk && visCoversOk && mogOk && fontsOk) first("vcNoPatch", t);
    if (frameOk && visCoversOk && mogOk && fontsOk && (patchVisible ? patchOk : true)) first("vcNoFade", t);
    const vc = fadeOk && frameOk && visCoversOk && mogOk && (patchVisible ? patchOk : true) && fontsOk;
    if (vc) { first("visuallyComplete", t); if (checksUntil === Infinity) checksUntil = t + 3000; }
    if (!T.coverRects && vc) T.coverRects = { visSlots: visSlots.length, slots: slots.length, patchVisible, full };
  }
  // ---- harness-only veil prototype (window.__ACS_VEIL = {opaque, maxMs, smooth}) ----
  // Holds an overlay from the moment the route becomes /lol until the first-screen
  // readiness conditions hold AND `smooth` consecutive frames come in under 25 ms,
  // or maxMs passes. Measures what a readiness-aware handoff would reveal.
  let veil = null, veilSince = null, smoothRun = 0, lastT = null;
  function veilTick(t) {
    const V = window.__ACS_VEIL;
    if (!V) return;
    if (!veil && location.pathname === "/lol" && T.marks.veilLift == null) {
      veil = document.createElement("div");
      veil.setAttribute("data-acs-veil", "");
      veil.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;" + (V.opaque
        ? "background:#04070f;"
        : "background:radial-gradient(circle at 50% 50%, rgba(240,215,140,0.95) 0%, rgba(127,214,239,0.5) 35%, rgba(4,7,15,1) 78%);");
      document.documentElement.appendChild(veil);
      veilSince = t; mark("veilOn");
    }
    if (!veil) return;
    const dt = lastT == null ? 0 : t - lastT;
    const readyNow = T.cond.visuallyComplete != null || (T.cond.readyUnderVeil != null);
    smoothRun = readyNow && dt > 0 && dt < 25 ? smoothRun + 1 : readyNow ? 0 : 0;
    const timeout = t - veilSince > (V.maxMs || 2000);
    if ((readyNow && smoothRun >= (V.smooth || 4)) || timeout) {
      veil.remove(); veil = null; mark("veilLift"); T.veilReason = timeout ? "timeout" : "ready";
    }
  }
  function frame(t) { T.frames.push(Math.round(t * 10) / 10); try { check(t); veilTick(t); } catch (e) { T.err = String(e); } lastT = t; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
})();
