/**
 * ACADEMY STARTUP RC2 — the Orrery's side of the held veil.
 *
 * While the veil is held (`veil-store.ts`), this reads the readiness contract
 * (`readiness.ts`) from the REAL page once per frame — the mounted <img>
 * elements (loaded, then `decode()`d), the engine's measured stage, the
 * document's fonts, the Patch Report feed — and lifts the veil once every
 * signal has settled and frames are flowing. A cap in the store lifts it
 * anyway. When nothing is held (an in-app navigation to /lol) it does nothing:
 * the page behaves exactly as before.
 *
 * Also owns the two reveal side effects: the arrival cue plays at the reveal
 * (it used to play at mount, under what is now the veil), and `data-startup`
 * on the page root records how the hold ended (pending | ready | degraded |
 * timeout | none) for tests and the measurement harness.
 */
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";

import {
  CRITICAL_FONTS,
  FrameFlow,
  evaluateReadiness,
  type SignalStatus,
} from "@/lib/academy-startup/readiness";
import {
  cancelAcademyVeil,
  getAcademyStartup,
  noteAcademyMounted,
  reportAcademyReadiness,
  revealAcademy,
  subscribeAcademyStartup,
} from "@/lib/academy-startup/veil-store";

const BOOK_IDS = ["leaguecraft", "pro-play", "combat-lab", "archives"] as const;

export interface StartupInputs {
  /** Desktop composition (the Patch Report is on the first screen). */
  fullLayout: boolean;
  /**
   * Each book's cover splash as the page renders it: a URL, null when the
   * manifest failed or names no splash (bare leather), undefined while the
   * manifest is still loading.
   */
  covers: Readonly<Record<string, string | null | undefined>>;
  /** The Patch Report feed's status ("loading" until it settles). */
  feedStatus: string;
}

export type StartupMark = "none" | "pending" | "ready" | "degraded" | "timeout";

/** Loaded-and-decoded state of the real <img> elements, remembered per element and src. */
export class ImageReadiness {
  private seen = new WeakMap<HTMLImageElement, { src: string; status: SignalStatus }>();
  /** Signal names whose image failed — kept even after the page removes the <img>. */
  readonly failed = new Set<string>();

  status(img: HTMLImageElement | null | undefined, name = ""): SignalStatus {
    if (name && this.failed.has(name)) return "error";
    if (!img) return "pending";
    const src = img.currentSrc || img.getAttribute("src") || "";
    const known = this.seen.get(img);
    if (known && known.src === src) return known.status;
    const entry: { src: string; status: SignalStatus } = { src, status: "pending" };
    this.seen.set(img, entry);
    const settle = (s: SignalStatus) => {
      if (entry.src !== src) return;
      entry.status = s;
      if (s === "error" && name) this.failed.add(name);
    };
    const decode = () => {
      if (typeof img.decode !== "function") { settle("ok"); return; }
      img.decode().then(() => settle("ok"), () => settle(img.naturalWidth > 0 ? "ok" : "error"));
    };
    if (img.complete) {
      if (img.naturalWidth > 0) decode();
      else if (src) settle("error"); // complete with no pixels: a broken image
    } else {
      img.addEventListener("load", decode, { once: true });
      img.addEventListener("error", () => settle("error"), { once: true });
    }
    return entry.status;
  }
}

function intersectsViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

function fontStatus(family: string, spec: string): SignalStatus {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts || typeof fonts.check !== "function") return "ok"; // no FontFaceSet: nothing can swap
  const faces: FontFace[] = [];
  fonts.forEach((f) => { if (f.family.replace(/["']/g, "") === family) faces.push(f); });
  if (faces.length === 0) return "pending"; // its stylesheet has not arrived yet
  if (faces.every((f) => f.status === "error")) return "error";
  if (fonts.check(spec)) return "ok";
  // A face loads only when something uses it, or when asked: ask (deduped by the browser).
  if (faces.some((f) => f.status === "unloaded")) void fonts.load(spec).catch(() => undefined);
  return "pending";
}

/**
 * Read every signal once. A signal's first final answer (ok or error) is kept
 * in `settled` and never re-read: it costs no DOM work on later frames, and a
 * failure that removes its own element (a cover that errors unmounts its
 * <img>) stays an error.
 */
export function readStartupSignals(
  root: HTMLElement,
  inputs: StartupInputs,
  images: ImageReadiness,
  books: readonly string[],
  settled: Map<string, SignalStatus>,
): Record<string, SignalStatus> {
  const out: Record<string, SignalStatus> = {};
  const put = (name: string, read: () => SignalStatus) => {
    const known = settled.get(name);
    if (known) { out[name] = known; return; }
    const s = read();
    if (s !== "pending") settled.set(name, s);
    out[name] = s;
  };

  put("stage", () => {
    const stage = root.querySelector<HTMLElement>(".o35-stage");
    // The engine starts only after measuring the stage (`data-ready`); a stage
    // with no size is not drawn yet. (Where nothing has layout at all — jsdom —
    // the page root has no size either, and a started engine counts.)
    if (!stage || stage.dataset.ready !== "true") return "pending";
    const r = stage.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return "ok";
    const page = root.getBoundingClientRect();
    return page.width === 0 && page.height === 0 ? "ok" : "pending";
  });

  for (const id of books) {
    const body = () => root.querySelector(`.o35-book[data-bay="${id}"] .academy-hub-book-body`);
    put(`frame:${id}`, () => images.status(body()?.querySelector<HTMLImageElement>(":scope > img"), `frame:${id}`));
    put(`cover:${id}`, () => {
      if (inputs.covers[id] === null) return "error"; // no manifest / no splash: bare leather
      const b = body();
      if (b?.getAttribute("data-cover") === "failed") return "error"; // the book dropped a failed <img>
      return images.status(b?.querySelector<HTMLImageElement>(":scope > div img"), `cover:${id}`);
    });
  }

  put("mogzy", () => images.status(root.querySelector<HTMLImageElement>('.o35-mogzy img[data-plate="rest"]'), "mogzy"));

  if (inputs.fullLayout) {
    put("patch", () => {
      if (inputs.feedStatus === "loading") return "pending";
      const book = root.querySelector('[data-testid="academy-core-book"]');
      const imgs = book ? Array.from(book.querySelectorAll("img")).filter(intersectsViewport) : [];
      const statuses = imgs.map((i) => images.status(i));
      return statuses.includes("pending") ? "pending" : statuses.includes("error") ? "error" : "ok";
    });
  }

  for (const f of CRITICAL_FONTS) put(f.name, () => fontStatus(f.family, f.spec));
  return out;
}

/** The books whose covers are on the first screen: all four on desktop, the visible ones on phones. */
function firstScreenBooks(root: HTMLElement, fullLayout: boolean): string[] {
  if (fullLayout) return [...BOOK_IDS];
  const slots = BOOK_IDS.map((id) => [id, root.querySelector(`.o35-book[data-bay="${id}"] .o35-slot`)] as const);
  const measured = slots.some(([, el]) => el && el.getBoundingClientRect().width > 0);
  if (!measured) return [...BOOK_IDS];
  return slots.filter(([, el]) => el && intersectsViewport(el)).map(([id]) => id);
}

let mountedGates = 0;

export function useAcademyStartupGate(rootRef: RefObject<HTMLElement>, inputs: StartupInputs): {
  /** False only while a held veil still covers the page. */
  shown: boolean;
  mark: StartupMark;
} {
  const s = useSyncExternalStore(subscribeAcademyStartup, getAcademyStartup, getAcademyStartup);
  // Whether THIS page arrived under a veil (an in-app navigation does not).
  const arrivedHeld = useRef(getAcademyStartup().phase === "held");
  const live = useRef(inputs);
  live.current = inputs;

  useLayoutEffect(() => { noteAcademyMounted(); }, []);

  // The page going away (not a StrictMode re-mount) drops the veil it was
  // holding — that hold only, never a later one.
  useEffect(() => {
    mountedGates += 1;
    return () => {
      mountedGates -= 1;
      const at = getAcademyStartup();
      if (at.phase !== "held") return;
      setTimeout(() => {
        const now = getAcademyStartup();
        if (mountedGates === 0 && now.phase === "held" && now.heldAt === at.heldAt) cancelAcademyVeil();
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (s.phase !== "held") return;
    const root = rootRef.current;
    if (!root) return;
    const images = new ImageReadiness();
    const settled = new Map<string, SignalStatus>();
    const flow = new FrameFlow();
    let books: string[] | null = null;
    let raf = 0;
    let done = false;
    // Ask for the faces now (a registered face loads only when something uses it).
    try { for (const f of CRITICAL_FONTS) void document.fonts?.load?.(f.spec).catch(() => undefined); } catch { /* no FontFaceSet */ }
    const tick = (t: number) => {
      if (done) return;
      const stage = root.querySelector<HTMLElement>(".o35-stage");
      if (!books && stage?.dataset.ready === "true") books = firstScreenBooks(root, live.current.fullLayout);
      const signals = readStartupSignals(root, live.current, images, books ?? [], settled);
      if (!books) signals.stage = "pending";
      const verdict = evaluateReadiness(signals);
      reportAcademyReadiness(verdict);
      if (verdict.settled) {
        if (flow.push(t)) {
          done = true;
          revealAcademy(verdict.degraded.length ? "degraded" : "ready", verdict);
          return;
        }
      } else {
        flow.reset();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { done = true; cancelAnimationFrame(raf); };
  }, [s.phase, rootRef]);

  const shown = !arrivedHeld.current || s.phase === "revealing" || s.phase === "revealed" || s.phase === "idle";
  const mark: StartupMark = !arrivedHeld.current
    ? "none"
    : s.phase === "held"
      ? "pending"
      : s.reason === "timeout" ? "timeout" : s.reason === "degraded" ? "degraded" : s.reason === "ready" ? "ready" : "none";
  return { shown, mark };
}
