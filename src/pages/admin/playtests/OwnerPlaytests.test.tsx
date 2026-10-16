/**
 * UGMP — the owner lab modes at /admin/playtests/:mode, against a stand-in for
 * the backend's `interaction_lab` contract (MOCKED: no real backend here; the
 * backend's own tests cover its grading, secrecy and authorization).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlyphPressCell } from "@/lib/interaction-grammar/types";
import {
  PlaytestApiError, type GlyphPressSession, type PlaytestsApi, type RangefinderSession,
} from "@/lib/playtests/api";
import RangefinderOwnerPlaytest, { toRangefinderReveal } from "./RangefinderOwnerPlaytest";
import GlyphPressOwnerPlaytest from "./GlyphPressOwnerPlaytest";
import OwnerPlaytestPage from "./OwnerPlaytestPage";
import { InteractionLabsRedirect, NumericLabRedirect, PerfectTimingRedirect } from "./legacyRedirects";
import { PlaytestLead } from "./ownerArena";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

/** jsdom has no layout: give the instrument boxes a size, as the primitive suites do. */
function mockBoxes() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute?.("data-testid");
    const size: Record<string, [number, number]> = {
      "rangefinder-field": [668, 420], "gp-bed": [600, 300], "gp-drum-window": [400, 56],
    };
    const [w, h] = size[id ?? ""] ?? [0, 0];
    return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: h, width: w, height: h, toJSON() {} } as DOMRect;
  });
}

beforeEach(() => {
  mockBoxes();
  // jsdom has no object URLs; the Glyph Press host revokes its clue blobs on unmount.
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// ---------------------------------------------------------------- Rangefinder

const stops = (seed: string) => {
  const out = [];
  for (let u = 100; u <= 6000; u += 25) out.push({ token: `rf_${seed}_${u}`, units: u });
  return out;
};

function rfSession(): RangefinderSession {
  return {
    contract: "interaction_lab.rangefinder.session.v1", session_id: "sess-rf", authority_label: "x", pool_size: 227,
    rounds: [0, 1].map((i) => ({
      index: i,
      content: {
        prompt: i === 0 ? "Set the target at the cast limit of Zephyr." : "Set the target at the cast limit of Spirit Rush.",
        measureLabel: "Rangefinder · Cast range",
        subject: i === 0
          ? { label: "Zephyr", sublabel: "Janna · W", slot: "W", monogram: "W" }
          : { label: "Spirit Rush", sublabel: "Ahri · R", slot: "R", monogram: "R" },
        field: { unitLabel: "units", stops: stops(String(i)) },
        footnote: "Cast range as the League Wiki publishes it",
      },
      art: i === 0 ? { champion: "Janna", slot: "W" } : { champion: "Ahri", slot: "R" },
      locked: false,
    })),
  };
}

function rfApi(over: Partial<PlaytestsApi> = {}) {
  const locks: [string, number, string][] = [];
  const api = {
    startRangefinder: vi.fn(async () => rfSession()),
    lockRangefinder: vi.fn(async (sid: string, index: number, stop: string) => {
      locks.push([sid, index, stop]);
      const units = Number(stop.split("_")[2]);
      const canonical = 550;
      return {
        contract: "interaction_lab.rangefinder.reveal.v1" as const, session_id: sid, index,
        reveal: {
          lockedToken: stop, canonicalToken: `rf_${index}_${canonical}`, verdict: units === canonical ? "exact" as const : units < canonical ? "short" as const : "long" as const,
          measurementLabel: "Cast range", canonicalUnits: canonical, lockedUnits: units, deltaUnits: units - canonical,
          note: "Zephyr is unit-targeted.", source: { label: "League Wiki", url: "https://wiki.leagueoflegends.com/en-us/x" },
        },
      };
    }),
    ...over,
  } as unknown as PlaytestsApi;
  return { api, locks };
}

const renderHost = (node: React.ReactNode) =>
  render(<MemoryRouter initialEntries={["/admin/playtests/x"]}>{node}</MemoryRouter>);

describe("Rangefinder owner playtest", () => {
  it("deals a session from the backend, locks by keyboard and draws the server's reveal", async () => {
    const { api, locks } = rfApi();
    renderHost(<RangefinderOwnerPlaytest api={api} lead={<PlaytestLead mode="rangefinder" />} />);
    expect(screen.getByTestId("owner-playtest-loading")).toBeTruthy();
    await screen.findByTestId("rangefinder-owner");
    expect(api.startRangefinder).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rangefinder-owner-counter").textContent).toBe("Round 1 / 2");
    expect(screen.getByTestId("playtest-back").getAttribute("href")).toBe("/admin/leaguecraft?section=ranked&view=playtests");
    const field = screen.getByTestId("rangefinder-field");
    fireEvent.keyDown(field, { key: "Home" });
    for (let i = 0; i < 18; i++) fireEvent.keyDown(field, { key: "ArrowRight" });
    fireEvent.click(screen.getByTestId("rangefinder-lock"));
    await waitFor(() => expect(screen.getByTestId("rangefinder-owner").dataset.phase).toBe("revealed"), { timeout: 3000 });
    expect(locks).toEqual([["sess-rf", 0, "rf_0_550"]]);
    expect(screen.getByTestId("rangefinder-owner-rail-right").textContent).toContain("Exact1");
    // Next is armed only after the reveal; the last round offers a new session.
    fireEvent.click(screen.getByTestId("rangefinder-owner-next"));
    expect(screen.getByTestId("rangefinder-owner-counter").textContent).toBe("Round 2 / 2");
    expect(screen.getByTestId("rangefinder-owner").dataset.phase).toBe("open");
    expect((screen.getByTestId("rangefinder-owner-restart") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the round open and offers a new session when the backend expired it", async () => {
    const { api } = rfApi({
      lockRangefinder: vi.fn(async () => { throw new PlaytestApiError("expired", 404, "session_expired"); }),
    } as Partial<PlaytestsApi>);
    renderHost(<RangefinderOwnerPlaytest api={api} lead={null} />);
    await screen.findByTestId("rangefinder-owner");
    fireEvent.keyDown(screen.getByTestId("rangefinder-field"), { key: "End" });
    fireEvent.click(screen.getByTestId("rangefinder-lock"));
    const alert = await screen.findByTestId("rangefinder-owner-error", undefined, { timeout: 3000 });
    expect(alert.textContent).toMatch(/expired/i);
    expect(screen.getByTestId("rangefinder-owner").dataset.phase).toBe("open");
    fireEvent.click(screen.getByText("Start a new session"));
    await waitFor(() => expect(api.startRangefinder).toHaveBeenCalledTimes(2));
  });

  it("states an actionable failure instead of a playable round", async () => {
    const { api } = rfApi({
      startRangefinder: vi.fn(async () => { throw new PlaytestApiError("Not Found", 404, null); }),
    } as Partial<PlaytestsApi>);
    renderHost(<RangefinderOwnerPlaytest api={api} lead={null} />);
    const err = await screen.findByTestId("owner-playtest-error");
    expect(err.textContent).toMatch(/does not serve the owner playtests yet/);
    expect(screen.queryByTestId("rangefinder-field")).toBeNull();
  });

  it("formats the server's numbers into the primitive's reveal", () => {
    expect(toRangefinderReveal({
      lockedToken: "a", canonicalToken: "b", verdict: "long", measurementLabel: "Cast range",
      canonicalUnits: 1100, lockedUnits: 1150, deltaUnits: 50, note: null, source: null,
    })).toMatchObject({ measurement: { valueText: "1 100" }, lockedText: "1 150", deltaText: "+50 units" });
  });
});

// ---------------------------------------------------------------- Glyph Press

/** "Kai'Sa" → K A I ' S A: five sockets and an engraved mark. */
const KAISA_CELLS: GlyphPressCell[] = [
  { kind: "glyph", index: 0 }, { kind: "glyph", index: 1 }, { kind: "glyph", index: 2 },
  { kind: "mark", text: "'" }, { kind: "glyph", index: 3 }, { kind: "glyph", index: 4 },
];
const KAISA = ["K", "A", "I", "S", "A"];

function gpSession(): GlyphPressSession {
  return {
    contract: "interaction_lab.glyph_press.session.v1", session_id: "sess-gp", authority_label: "x", pool_size: 9,
    rounds: [{
      index: 0,
      content: {
        prompt: "Set this champion's name.", categoryLabel: "Champion",
        clue: { caption: null, monogram: "Ch", mediaPath: "/glyph-press/sessions/sess-gp/rounds/0/clue" },
        structure: { cells: KAISA_CELLS, glyphCount: 5 },
        alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", soundingsAllowed: 3, footnote: "League Wiki · ability data templates",
      },
      ledger: { engraved: [null, null, "I", null, null], soundings: [] },
      locked: false,
    }],
  };
}

function gpApi() {
  const sounds: string[] = [];
  const locks: (string | null)[][] = [];
  const api = {
    startGlyphPress: vi.fn(async () => gpSession()),
    clueImage: vi.fn(async () => "blob:clue"),
    soundGlyphPress: vi.fn(async (sid: string, index: number, glyph: string) => {
      sounds.push(glyph);
      const engraved = [null, null, "I", null, null].map((e, i) => (KAISA[i] === glyph ? glyph : e));
      return { contract: "interaction_lab.glyph_press.ledger.v1" as const, session_id: sid, index,
        ledger: { engraved, soundings: [{ glyph, hits: KAISA.filter((g) => g === glyph).length }] } };
    }),
    lockGlyphPress: vi.fn(async (sid: string, index: number, glyphs: readonly (string | null)[]) => {
      locks.push([...glyphs]);
      return {
        contract: "interaction_lab.glyph_press.reveal.v1" as const, session_id: sid, index,
        reveal: { glyphs: KAISA, results: ["right", "sounded", "given", "right", "sounded"] as const, locked: [...glyphs],
          verdict: "solved" as const, answerText: "Kai'Sa", scoreText: "2 of 2 glyphs set right", note: null, source: null },
      };
    }),
  } as unknown as PlaytestsApi;
  return { api, sounds, locks };
}

describe("Glyph Press owner playtest", () => {
  it("fetches the clue privately, sounds through the backend, and locks for the server's reveal", async () => {
    const { api, sounds, locks } = gpApi();
    renderHost(<GlyphPressOwnerPlaytest api={api} lead={<PlaytestLead mode="glyph-press" />} />);
    await screen.findByTestId("glyph-press-owner");
    expect(api.clueImage).toHaveBeenCalledWith("/glyph-press/sessions/sess-gp/rounds/0/clue");
    // The answer is in no pre-reveal text.
    expect(document.body.textContent).not.toMatch(/Kai'?Sa/i);
    fireEvent.click(screen.getByTestId("gp-sound"));
    fireEvent.keyDown(screen.getByTestId("gp-forme"), { key: "a" });
    await waitFor(() => expect(sounds).toEqual(["A"]));
    await waitFor(() => expect(screen.getByTestId("glyph-press-owner-rail-left").textContent).toContain("1 of 3 used"));
    const forme = screen.getByTestId("gp-forme");
    fireEvent.keyDown(forme, { key: "k" });
    fireEvent.keyDown(forme, { key: "s" });
    fireEvent.click(screen.getByTestId("gp-lock"));
    await waitFor(() => expect(screen.getByTestId("glyph-press-owner").dataset.phase).toBe("revealed"), { timeout: 3000 });
    expect(locks).toHaveLength(1);
    expect(locks[0][0]).toBe("K");
    expect(locks[0][3]).toBe("S");
    expect(screen.getByTestId("glyph-press-owner-rail-right").textContent).toContain("Solved1");
  });
});

// ------------------------------------------------------------- the play route

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

const at = (url: string, path: string, element: React.ReactNode) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path={path} element={element} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

describe("/admin/playtests/:mode and the retired lab URLs", () => {
  it("names an unknown mode and links back to Playtests", () => {
    at("/admin/playtests/nope", "/admin/playtests/:mode", <OwnerPlaytestPage />);
    expect(screen.getByTestId("owner-playtest-unknown").textContent).toContain("nope");
    expect(screen.getByRole("link", { name: /back to playtests/i }).getAttribute("href"))
      .toBe("/admin/leaguecraft?section=ranked&view=playtests");
  });

  it("hosts Perfect Timing at /admin/playtests/perfect-timing with the way back to Playtests", async () => {
    // The page deals on mount; a 404 with the PT3 flag code stands in for a backend with the lab off.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ detail: { error: { code: "PT_LAB_DISABLED", message: "off" } } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    ));
    at("/admin/playtests/perfect-timing", "/admin/playtests/:mode", <OwnerPlaytestPage />);
    expect(await screen.findByTestId("perfect-timing-page", {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByTestId("owner-playtest-page").dataset.mode).toBe("perfect-timing");
    // PT4.4: the way back alone — no mode title, no prototype badge.
    expect(screen.queryByTestId("playtest-mode-title")).toBeNull();
    expect(screen.getByTestId("playtest-back").getAttribute("href")).toBe("/admin/leaguecraft?section=ranked&view=playtests");
    expect(screen.queryByRole("link", { name: "Exit" })).toBeNull();
    // PT5: the mode pick comes first; Random Run then deals.
    fireEvent.click(screen.getByTestId("pt-mode-random"));
    expect(await screen.findByText(/PERFECT_TIMING_LAB_ENABLED/)).toBeInTheDocument();
  });

  it.each([
    ["/admin/interaction-labs", "/admin/interaction-labs", "/admin/leaguecraft?section=ranked&view=playtests"],
    ["/admin/interaction-labs/rangefinder", "/admin/interaction-labs/:lab", "/admin/playtests/rangefinder"],
    ["/admin/interaction-labs/word-puzzle", "/admin/interaction-labs/:lab", "/admin/playtests/glyph-press"],
  ])("redirects %s", async (url, path, to) => {
    at(url, path, <InteractionLabsRedirect />);
    expect((await screen.findByTestId("where")).textContent).toBe(to);
  });

  it.each([
    ["/admin/numeric-lab", "/admin/playtests/stat-drop"],
    ["/admin/numeric-lab?mode=stat-drop", "/admin/playtests/stat-drop"],
    ["/admin/numeric-lab?mode=combat-estimate", "/admin/playtests/combat-estimate"],
  ])("redirects %s", async (url, to) => {
    at(url, "/admin/numeric-lab", <NumericLabRedirect />);
    expect((await screen.findByTestId("where")).textContent).toBe(to);
  });

  it("redirects the PT4 lab URL /admin/perfect-timing to its hub route", async () => {
    at("/admin/perfect-timing", "/admin/perfect-timing", <PerfectTimingRedirect />);
    expect((await screen.findByTestId("where")).textContent).toBe("/admin/playtests/perfect-timing");
  });
});

describe("no answer-bearing data in the owner chunks (source walk)", () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  const OWNER = [
    "src/pages/admin/playtests/OwnerPlaytestPage.tsx",
    "src/pages/admin/playtests/RangefinderOwnerPlaytest.tsx",
    "src/pages/admin/playtests/GlyphPressOwnerPlaytest.tsx",
    "src/pages/admin/playtests/ownerArena.tsx",
    "src/pages/admin/playtests/legacyRedirects.tsx",
    "src/pages/admin/ranked/PlaytestHub.tsx",
    "src/pages/admin/ranked/PlaytestModeCard.tsx",
    "src/lib/playtests/api.ts",
    "src/lib/playtests/modes.ts",
  ];
  it("imports no fixture, capture or lab authority that carries answers", () => {
    for (const p of OWNER) {
      const imports = src(p).split("\n").filter((l) => /^\s*import\b/.test(l) || /import\(/.test(l));
      expect(imports.filter((l) => /__fixtures__|\.json["']|labFixtures|devCapture|devRounds|ranked-public\/fixtures/.test(l)), p).toEqual([]);
    }
  });
  it("the whole import graph of /admin/playtests/:mode, lazy hosts included, never reaches a fixture, capture or lab authority", () => {
    const seen = new Set<string>();
    const resolveImport = (from: string, spec: string): string | null => {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) return null; // packages
      const base = spec.startsWith("@/") ? resolve(process.cwd(), "src", spec.slice(2)) : resolve(dirname(from), spec);
      for (const c of [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx"), base]) {
        if (existsSync(c) && statSync(c).isFile()) return c;
      }
      return null;
    };
    const BAD = /__fixtures__|labFixtures|labAuthority|devCapture|devRounds|combatAuthorityCapture|ranked-public\/fixtures|\.json$/;
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      const specs = [
        ...[...text.matchAll(/^\s*import\s+(type\s+)?(?:[^;]*?\sfrom\s+)?["']([^"']+)["'];?/gm)].filter((m) => !m[1]).map((m) => m[2]),
        ...[...text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
      ];
      for (const spec of specs) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(BAD);
        const next = resolveImport(file, spec);
        if (next && /\.(ts|tsx)$/.test(next)) walk(next);
      }
    };
    walk(resolve(process.cwd(), "src/pages/admin/playtests/OwnerPlaytestPage.tsx"));
    walk(resolve(process.cwd(), "src/pages/admin/ranked/PlaytestHub.tsx"));
    expect([...seen].some((f) => f.endsWith("RangefinderOwnerPlaytest.tsx"))).toBe(true);
    expect([...seen].some((f) => f.endsWith("GlyphPressOwnerPlaytest.tsx"))).toBe(true);
    expect([...seen].some((f) => f.endsWith("NumericLabPage.tsx"))).toBe(true);
    expect([...seen].some((f) => f.endsWith("PerfectTimingPage.tsx"))).toBe(true);
  });
});
