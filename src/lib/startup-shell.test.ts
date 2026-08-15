/**
 * The startup contract: what the browser paints between navigation and React.
 *
 * index.html cannot import TypeScript, so its inline bootstrap duplicates the
 * colours and the LoL path test from startup-shell.ts by hand. These tests are
 * what keep that duplication honest — and they pin the two properties the whole
 * redesign rests on: no branded splash, and the shell can never sit on top of
 * the mounted app.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BASE_BG,
  ENTRY_BASE_BG,
  LOL_BASE_BG,
  baseBackgroundForPath,
  isEntryPath,
  isLolSectionPath,
} from "./startup-shell";

const indexHtml = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

/** The pre-paint bootstrap, pulled out of index.html so we can actually run it. */
function bootstrapSource(): string {
  const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const boot = scripts.find((s) => s.includes("data-startup-shell"));
  if (!boot) throw new Error("index.html no longer contains the startup bootstrap");
  return boot;
}

function runBootstrapAt(pathname: string) {
  window.history.pushState({}, "", pathname);
  new Function(bootstrapSource())();
}

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("data-startup-shell");
  document.body.removeAttribute("style");
  window.history.pushState({}, "", "/");
});

describe("no legacy branded splash", () => {
  it("never references the legacy Mogsy wordmark from the startup document", () => {
    expect(indexHtml).not.toContain("mogsy-logo-text.png");
  });

  it("ships a startup shell element that is completely empty", () => {
    const shell = indexHtml.match(/<div id="initial-shell"[^>]*>([\s\S]*?)<\/div>/);
    expect(shell).not.toBeNull();
    expect(shell![1].trim()).toBe("");
  });

  it("paints the shell as a flat colour, with no gradient or texture", () => {
    // Anything drawn here is a layer the real page then has to replace, which
    // the visitor reads as the page being assembled in front of them.
    const style = indexHtml
      .match(/<style>[\s\S]*?<\/style>/)![0]
      .replace(/\/\*[\s\S]*?\*\//g, ""); // prose about gradients is not a gradient
    const shellRules = style
      .split("}")
      .filter((r) => r.includes("#initial-shell"))
      .join("}");
    expect(shellRules).toContain("#initial-shell");
    expect(shellRules).not.toMatch(/gradient|background-image|url\(/);
    expect(shellRules).not.toMatch(/animation|transition|@keyframes/);
  });
});

describe("the startup shell cannot cover the mounted app", () => {
  it("pins #initial-shell behind the React tree", () => {
    const rule = indexHtml.match(/#initial-shell\s*\{[\s\S]*?\}/);
    expect(rule).not.toBeNull();
    // A negative z-index is the whole guarantee: even a shell that is never
    // removed paints underneath #root instead of masking it.
    expect(rule![0]).toMatch(/z-index:\s*-1/);
    expect(rule![0]).not.toMatch(/z-index:\s*9999/);
  });
});

describe("route → base background", () => {
  it("gives the entrance its own surface", () => {
    expect(baseBackgroundForPath("/")).toBe(ENTRY_BASE_BG);
  });

  it("gives every League surface the library base", () => {
    expect(baseBackgroundForPath("/lol")).toBe(LOL_BASE_BG);
    expect(baseBackgroundForPath("/lol/docs")).toBe(LOL_BASE_BG);
    expect(baseBackgroundForPath("/combat-lab")).toBe(LOL_BASE_BG);
    expect(baseBackgroundForPath("/quiz/ranked")).toBe(LOL_BASE_BG);
  });

  it("leaves unrelated routes on the general app base", () => {
    expect(baseBackgroundForPath("/settings")).toBe(DEFAULT_BASE_BG);
    expect(baseBackgroundForPath("/auth")).toBe(DEFAULT_BASE_BG);
  });

  it("does not treat lookalike paths as League surfaces", () => {
    expect(isLolSectionPath("/lolcat")).toBe(false);
    expect(isLolSectionPath("/quizzes")).toBe(false);
    expect(isEntryPath("/lol")).toBe(false);
  });

  // Meta Reflex (internally League Swipe) is League content on a public URL
  // that predates the /lol and /quiz prefixes. Its absence from this predicate
  // meant the page rendered with neither `theme-lol` nor `dark`, inheriting the
  // visitor's sitewide Mogsy theme — which put the cards' hardcoded near-black
  // text on a near-black ground for anyone on a light OS.
  it("treats Meta Reflex as a League surface", () => {
    expect(isLolSectionPath("/league-swipe")).toBe(true);
    expect(isLolSectionPath("/league-swipe/stats")).toBe(true);
    expect(isLolSectionPath("/league-swipe/item-cost-duel")).toBe(true);
    expect(baseBackgroundForPath("/league-swipe")).toBe(LOL_BASE_BG);
  });

  it("still rejects Meta Reflex lookalike paths", () => {
    expect(isLolSectionPath("/league-swipes")).toBe(false);
    expect(isLolSectionPath("/league")).toBe(false);
    // The legacy general-Mogsy swipe product is a DIFFERENT, non-League product
    // and must not pick up the League theme.
    expect(isLolSectionPath("/swipe")).toBe(false);
    expect(isLolSectionPath("/swipe-leagues")).toBe(false);
  });
});

describe("index.html bootstrap agrees with startup-shell.ts", () => {
  it("hard-codes exactly the three shared colours", () => {
    const boot = bootstrapSource();
    expect(boot).toContain(LOL_BASE_BG);
    expect(boot).toContain(ENTRY_BASE_BG);
    expect(boot).toContain(DEFAULT_BASE_BG);
  });

  it("paints /lol with the League theme before React runs", () => {
    runBootstrapAt("/lol");
    expect(document.documentElement.classList.contains("theme-lol")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-startup-shell")).toBe("lol");
    expect(document.body.style.background).not.toBe("");
  });

  it("applies the League theme to League sub-routes too", () => {
    runBootstrapAt("/combat-lab/diagnostics");
    expect(document.documentElement.classList.contains("theme-lol")).toBe(true);
  });

  it("paints / with the entrance surface and no League theme", () => {
    runBootstrapAt("/");
    expect(document.documentElement.getAttribute("data-startup-shell")).toBe("entry");
    expect(document.documentElement.classList.contains("theme-lol")).toBe(false);
  });

  it("does not force unrelated routes into the League theme", () => {
    runBootstrapAt("/settings");
    expect(document.documentElement.getAttribute("data-startup-shell")).toBe("default");
    expect(document.documentElement.classList.contains("theme-lol")).toBe(false);
  });

  it("still applies the accessibility classes before first paint", () => {
    // This runner exposes Node's own empty `localStorage` global rather than
    // jsdom's Storage, so stand up a minimal one for the duration of the test.
    const store = new Map<string, string>([
      ["mogsy-reduce-motion", "1"],
      ["mogsy-large-text", "1"],
      ["mogsy-high-contrast", "1"],
    ]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
    try {
      runBootstrapAt("/lol");
      expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
      expect(document.documentElement.classList.contains("large-text")).toBe(true);
      expect(document.documentElement.classList.contains("high-contrast")).toBe(true);
      // …and the League theme still lands alongside them.
      expect(document.documentElement.classList.contains("theme-lol")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("survives a hostile localStorage without losing the route theme", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    try {
      runBootstrapAt("/lol");
      expect(document.documentElement.classList.contains("theme-lol")).toBe(true);
      expect(document.documentElement.getAttribute("data-startup-shell")).toBe("lol");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads nothing but the pathname and the accessibility keys", () => {
    const boot = bootstrapSource();
    // A visual bootstrap must not start making identity or entitlement calls.
    expect(boot).not.toMatch(/fetch\(|supabase|document\.cookie|sessionStorage/);
    const storageKeys = [...boot.matchAll(/localStorage\.getItem\('([^']+)'\)/g)].map((m) => m[1]);
    expect(storageKeys.sort()).toEqual([
      "mogsy-high-contrast",
      "mogsy-large-text",
      "mogsy-reduce-motion",
    ]);
  });
});
