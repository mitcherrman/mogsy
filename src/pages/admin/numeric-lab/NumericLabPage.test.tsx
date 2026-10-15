import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json";
import { labFixturesFor, type DropFixture } from "@/pages/dev/interaction-lab/labFixtures";
import type { CapturedScenario } from "@/lib/combat-estimate/contract";
import { NumericLabApiError, numericLabApi, type CombatEstimateRounds, type NumericLabApi, type StatDropRounds } from "@/lib/numeric-lab/api";
import { combatEstimateCsv, statDropCsv, type PlaytestEntry } from "@/lib/numeric-lab/playtestLog";
import { parsePlaytestCsv } from "../../../../scripts/combat-estimate/grading/grade_playtest";
import NumericLabPage from "./NumericLabPage";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

// ---------------------------------------------------------------------------
// A stand-in for the BACKEND (`numeric_lab/service.py`): the same allow-listed
// public projection and the same release-after-lock, built here from the same
// historical captures the backend serves. Test-only; never bundled.
// ---------------------------------------------------------------------------
const SCENARIOS = (capture as unknown as { scenarios: CapturedScenario[] }).scenarios;
const COMMIT = (capture as { backend: { commit: string } }).backend.commit;
const DROPS = labFixturesFor("stat-drop") as DropFixture[];

function publicCe(s: CapturedScenario) {
  return {
    id: s.id, kind: s.kind, difficulty: s.difficulty, metric: s.metric,
    attacker: { champion: s.attacker.champion, level: s.attacker.level, items: s.attacker.items,
      stats: { attack_damage: s.attacker.stats.attack_damage, bonus_attack_damage: s.attacker.stats.bonus_attack_damage, ability_power: s.attacker.stats.ability_power } },
    ability: { slot: s.ability.slot, name: s.ability.name, rank: s.ability.rank, max_rank: s.ability.max_rank, component: s.ability.component },
    target: s.target, penetration: s.penetration, scale: s.scale, assumptions: s.assumptions,
  };
}

function fakeApi(over: Partial<NumericLabApi> = {}) {
  const calls: { lock: [string, number][] } = { lock: [] };
  const api: NumericLabApi = {
    statDropRounds: async () => ({
      contract: "numeric_lab.stat_drop.public.v1", authority_label: "Historical capture — not server-authoritatively graded",
      capture_source: { branch: "mig1/1-interaction-lab", commit: "b932af4b65e1a2225e4adb20a87430723788b358" },
      rounds: DROPS.map((f) => ({ id: f.id, domain: f.domain, title: f.title, shape: f.shape, provenance_label: f.provenance, content: f.content })),
    }) as StatDropRounds,
    lockStatDrop: async (id, value) => {
      calls.lock.push([id, value]);
      const f = DROPS.find((d) => d.id === id)!;
      return { contract: "numeric_lab.stat_drop.release.v1", round_id: id, value, authority_label: "x", released: f.hidden };
    },
    combatEstimateRounds: async () => ({
      contract: "numeric_lab.combat_estimate.public.v1", authority_label: "x",
      capture: { contract: "combat_estimate.capture.v1", captured_at: "2026-10-01T00:00:00Z", backend_commit: COMMIT,
        implementation: "combat_calculations.physical_ability_damage.v1", scale_policy: { id: "ce1.scale.four_times_attack_damage.dev-v0", development_only: true } },
      rounds: SCENARIOS.map(publicCe),
    }) as unknown as CombatEstimateRounds,
    lockCombatEstimate: async (id, estimate) => {
      calls.lock.push([id, estimate]);
      const s = SCENARIOS.find((x) => x.id === id)!;
      return {
        contract: "numeric_lab.combat_estimate.release.v1", round_id: id, estimate, authority_label: "x", backend_commit: COMMIT,
        released: { metric: s.metric, exact: s.answer.exact, whole: s.answer.whole, result: s.result, working: s.working,
          provenance: s.provenance, formula_text: s.ability.formula_text, tier: s.ability.tier },
      };
    },
    ...over,
  };
  return { api, calls };
}

const renderAt = (url: string, api: NumericLabApi) =>
  render(<MemoryRouter initialEntries={[url]}><NumericLabPage api={api} /></MemoryRouter>);

afterEach(() => { vi.useRealTimers(); });

// ------------------------------------------------------------------- the API

describe("numericLabApi", () => {
  it("sends the owner's admin headers and refuses an unknown contract", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ contract: "numeric_lab.stat_drop.public.v1", rounds: [] }), { status: 200 }));
    const api = numericLabApi(fetchImpl as unknown as typeof fetch);
    await api.statDropRounds();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://backend.test/api/admin/numeric-lab/stat-drop/rounds");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer owner-session");
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ contract: "something.else" }), { status: 200 }));
    await expect(api.statDropRounds()).rejects.toBeInstanceOf(NumericLabApiError);
  });

  it("posts exactly the locked value and surfaces the backend's refusal", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail: { error: { code: "input_refused", message: "estimate is off this round's beam" } } }), { status: 422 }));
    const api = numericLabApi(fetchImpl as unknown as typeof fetch);
    await expect(api.lockCombatEstimate("r1", 999)).rejects.toMatchObject({ status: 422, code: "input_refused", message: "estimate is off this round's beam" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/combat-estimate\/rounds\/r1\/lock$/);
    expect(JSON.parse(init.body as string)).toEqual({ estimate: 999 });
  });
});

// ------------------------------------------------------------------ the page

describe("NumericLabPage — Stat Drop (original MIG1.2 primitive)", () => {
  it("labels the authority and shows no answer before Lock", async () => {
    const { api } = fakeApi();
    renderAt("/admin/numeric-lab?mode=stat-drop&round=drop.lc.olaf-undertow-haste", api);
    await screen.findByTestId("owner-stat-drop");
    expect(screen.getByTestId("numeric-lab-banner")).toHaveTextContent(/not server-authoritatively graded/i);
    expect(screen.getByTestId("numeric-lab-banner")).toHaveTextContent(/historical captures/i);
    expect(screen.getByTestId("numeric-lab-authority")).toHaveTextContent("mig1/1-interaction-lab @ b932af4b");
    const html = screen.getByTestId("owner-stat-drop").innerHTML;
    expect(html).not.toContain("8.2");
    expect(html).not.toContain("8.18");
    expect(screen.queryByTestId("drop-true-flag")).toBeNull();
  });

  it("locks through the API and shows the released reveal, then asks for a blind gut call", async () => {
    const { api, calls } = fakeApi();
    renderAt("/admin/numeric-lab?mode=stat-drop&round=drop.pp.peanut-sejuani", api);
    const slider = await screen.findByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: /lock/i }));
    await waitFor(() => expect(screen.getByTestId("owner-stat-drop")).toHaveAttribute("data-phase", "revealed"), { timeout: 3000 });
    expect(calls.lock).toHaveLength(1);
    expect(calls.lock[0][0]).toBe("drop.pp.peanut-sejuani");
    expect(screen.getByTestId("drop-true-flag")).toHaveTextContent("113");
    const fb = screen.getByTestId("numeric-lab-feedback");
    expect(fb).toHaveTextContent(/logged blind/);
    expect(within(fb).getByTestId("gut-record")).toBeDisabled();
    fireEvent.click(within(fb).getByTestId("gut-fair-incorrect"));
    fireEvent.click(within(fb).getByTestId("gut-record"));
    expect(screen.getByTestId("numeric-lab-log-count")).toHaveTextContent("1 logged");
  });
});

describe("NumericLabPage — Combat Estimate (original CE1 two-beam balance)", () => {
  it("serves the certified premise, no answer before Lock, and CE1's descriptive reveal after it", async () => {
    const { api, calls } = fakeApi();
    const jarvan = SCENARIOS.find((s) => s.id === "jarvan-q-r3-l5-dirk-vs-olaf")!;
    renderAt(`/admin/numeric-lab?mode=combat-estimate&round=${jarvan.id}`, api);
    const root = await screen.findByTestId("owner-combat-estimate");
    expect(screen.getByTestId("numeric-lab-authority")).toHaveTextContent("8829fc3c");
    const before = root.textContent ?? "";
    expect(before).toContain("Dragon Strike");
    for (const secret of ["144.2259", "199", String(jarvan.result.mitigation_multiplier)]) expect(before).not.toContain(secret);
    const slider = within(root).getByRole("slider");
    act(() => { slider.focus(); });
    for (let i = 0; i < 3; i++) fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.click(within(root).getByRole("button", { name: /lock estimate/i }));
    await waitFor(() => expect(root).toHaveAttribute("data-phase", "revealed"));
    expect(calls.lock).toEqual([[jarvan.id, 150]]);
    expect(root.textContent).toMatch(/144/);
    // Descriptive only: no pass/fail word anywhere on the page.
    expect(document.body.textContent).not.toMatch(/\b(Correct|Incorrect|Passed|Failed)\b/);
  });

  it("explains a disabled backend and a refused session instead of rendering rounds", async () => {
    const disabled = fakeApi({ combatEstimateRounds: async () => { throw new NumericLabApiError("x", 404, "numeric_lab_disabled"); } });
    const first = renderAt("/admin/numeric-lab?mode=combat-estimate", disabled.api);
    expect(await screen.findByTestId("numeric-lab-error")).toHaveTextContent(/NUMERIC_LAB_ENABLED/);
    first.unmount();
    const refused = fakeApi({ statDropRounds: async () => { throw new NumericLabApiError("x", 403, null); } });
    renderAt("/admin/numeric-lab?mode=stat-drop", refused.api);
    expect(await screen.findByTestId("numeric-lab-error")).toHaveTextContent(/owner session/);
  });
});

// ------------------------------------------------------------- the CEG1 log

describe("playtest log", () => {
  const entries: PlaytestEntry[] = [
    { mode: "combat-estimate", round: "jarvan-q-r3-l5-dirk-vs-olaf", device: "phone", value: 150, seconds: 21, gut: "fair-correct", note: "fine, but the fine beam, small" },
    { mode: "combat-estimate", round: "zed-q-r1-l2-longsword-vs-ahri", device: "desktop", value: 60, seconds: null, gut: null, note: "line one\nline two" },
    { mode: "stat-drop", round: "drop.pp.peanut-sejuani", device: "desktop", value: 101, seconds: 4, gut: "unsure", note: "" },
  ];

  it("exports Combat Estimate rows that CEG1's own grader parses", () => {
    const rows = parsePlaytestCsv(combatEstimateCsv(entries));
    expect(rows).toEqual([
      { round: "jarvan-q-r3-l5-dirk-vs-olaf", device: "phone", estimate: 150, seconds: 21, gut: "fair-correct", note: "fine; but the fine beam; small" },
      { round: "zed-q-r1-l2-longsword-vs-ahri", device: "desktop", estimate: 60, seconds: null, gut: "unsure", note: "line one line two" },
    ]);
  });

  it("keeps Stat Drop in its own feedback-only log", () => {
    const csv = statDropCsv(entries);
    expect(csv).toContain("No grading policy exists for Stat Drop");
    expect(csv.trim().split("\n").at(-1)).toBe("drop.pp.peanut-sejuani,desktop,101,4,unsure,");
  });
});

// ------------------------------------------------------- routes and secrecy

describe("owner route and bundle secrecy", () => {
  const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");

  it("mounts /admin/numeric-lab behind AdminRoute, and the unguarded twin only in DEV", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('<Route path="/admin/numeric-lab" element={<AdminRoute><Suspense fallback={<RouteFallback />}><NumericLabPage /></Suspense></AdminRoute>} />');
    expect(app).toMatch(/const NumericLabPageDev = import\.meta\.env\.DEV\s*\?\s*lazy\(/);
    expect(app).toMatch(/\{NumericLabPageDev \? \(\s*<Route path="\/dev\/numeric-lab"/);
  });

  it("the owner page's whole import graph never reaches a fixture, capture or lab authority", () => {
    const seen = new Set<string>();
    const resolveImport = (from: string, spec: string): string | null => {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) return null; // packages
      const base = spec.startsWith("@/") ? resolve(process.cwd(), "src", spec.slice(2)) : resolve(dirname(from), spec);
      for (const c of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]) {
        if (existsSync(c) && !c.endsWith("/")) { try { readFileSync(c); return c; } catch { /* dir */ } }
      }
      return null;
    };
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/^\s*import\s+(type\s+)?(?:[^;]*?\sfrom\s+)?["']([^"']+)["'];?/gm)) {
        if (m[1]) continue; // type-only: erased
        const spec = m[2];
        expect(spec, `${file} imports ${spec}`).not.toMatch(/__fixtures__|labFixtures|labAuthority|combatAuthorityCapture|proPlaySamples|masterySlicePreviews|\.json$/);
        const next = resolveImport(file, spec);
        if (next && /\.(ts|tsx)$/.test(next)) walk(next);
      }
      for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
        expect(m[1], `${file} lazily imports ${m[1]}`).not.toMatch(/__fixtures__|labFixtures|labAuthority|\.json$/);
      }
    };
    walk(resolve(process.cwd(), "src/pages/admin/numeric-lab/NumericLabPage.tsx"));
    expect(seen.size).toBeGreaterThan(10);
  });
});
