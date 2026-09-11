/**
 * The Combat Lab champion deep link — Matchup Explorer Step 10.
 *
 * WHAT IS BEING PINNED. `/combat-lab?attacker=<slug>&defender=<slug>` opens
 * the simulator on two named champions, and does NOTHING else. Combat Lab's
 * champion state lives in two localStorage records — `combat-lab:last-config`
 * for the attacker and `combat-lab:target-setup` for the defender — so those
 * records are the contract these tests read: they are what a refresh, a
 * re-mount and the simulate request all agree on, and they carry every default
 * the link must leave alone.
 *
 * THE DEFAULTS ARE THE POINT. A link that quietly set a level, an item or an
 * ability rank would be claiming to recreate a pro game, which is a different
 * product and a different authority. Each test that applies a link also
 * asserts the untouched fields are still untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CombatLab from "./CombatLab";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/usePremiumSession", () => ({
  usePremiumSession: () => ({ proStatus: "free" }),
}));

/** The `champions` table's own spellings, as /api/meta/champions serves them. */
const CHAMPIONS = [
  "Olaf",
  "K'Sante",
  "Cho'Gath",
  "Kai'Sa",
  "Dr Mundo",
  "Aurelion Sol",
  "Ahri",
];

/**
 * A real localStorage.
 *
 * The jsdom build these tests run under exposes a `localStorage` OBJECT with
 * no methods on it, so every `setItem` in the page hits its own try/catch and
 * is silently dropped — which would make this whole file pass vacuously.
 * Installing a working one is what lets the tests read the two records the
 * contract actually lives in.
 */
function installLocalStorage() {
  let store: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    },
  });
}

const CONFIG_KEY = "combat-lab:last-config";
const TARGET_KEY = "combat-lab:target-setup";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String((input as Request).url ?? input);
      if (url.includes("/api/meta/champions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, champions: CHAMPIONS }),
          text: () => Promise.resolve(""),
        } as unknown as Response);
      }
      return Promise.reject(new Error("offline in test"));
    }),
  );
}

beforeEach(() => {
  installLocalStorage();
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mount(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/combat-lab${search}`]}>
        <CombatLab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stored(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

/** Wait for the page to have finished reading the champion manifest and
 *  applying whatever the URL asked for. */
async function settle() {
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
}

describe("opening Combat Lab on a named matchup", () => {
  it("selects both champions", async () => {
    mount("?attacker=olaf&defender=ksante");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Olaf"));
    await waitFor(() => expect(stored(TARGET_KEY).targetChampionName).toBe("K'Sante"));
  });

  it("switches the target to the champion, so the defender is actually fought", async () => {
    // The stock target is the dummy, in which `targetChampionName` is never
    // read. Storing a defender without switching would show the reader a
    // champion the simulator is not fighting.
    mount("?attacker=olaf&defender=ksante");
    await waitFor(() => expect(stored(TARGET_KEY).targetMode).toBe("target_champion"));
  });

  it("leaves every other Combat Lab default exactly as it found it", async () => {
    mount("?attacker=olaf&defender=ksante");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Olaf"));
    const config = stored(CONFIG_KEY);
    // No inferred build, level, rank or rotation crosses the seam from
    // historical pro evidence into mechanical simulation.
    expect(config.items).toEqual([]);
    expect(config.runes).toEqual([]);
    expect(config.stats).toEqual({ LEVEL: 18 });
    expect(config.ranks).toEqual({ Q: 5, W: 5, E: 5, R: 3 });
    expect(config.sequence).toBe("Q,AA,E,AA,R");
    expect(config.target_profile).toBe("");
    expect(config.crit_mode).toBe("expected");

    await waitFor(() => expect(stored(TARGET_KEY).targetMode).toBe("target_champion"));
    const target = stored(TARGET_KEY);
    expect(target.targetLevel).toBe(18);
    expect(target.targetItemNames).toEqual([]);
    expect(target.targetRuneNames).toEqual([]);
    expect(target.dummyHP).toBe(4000);
  });

  it("carries a punctuation-heavy champion on both sides", async () => {
    mount("?attacker=chogath&defender=kaisa");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Cho'Gath"));
    await waitFor(() => expect(stored(TARGET_KEY).targetChampionName).toBe("Kai'Sa"));
  });

  it("resolves the champion the two authorities spell differently", async () => {
    // Leaguepedia writes "Dr. Mundo"; the manifest writes "Dr Mundo". The
    // Explorer emits `dr-mundo` and the page must land on the manifest's name.
    mount("?attacker=dr-mundo&defender=aurelion-sol");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Dr Mundo"));
    await waitFor(() =>
      expect(stored(TARGET_KEY).targetChampionName).toBe("Aurelion Sol"),
    );
  });

  it("survives a refresh, because the URL is the state", async () => {
    mount("?attacker=olaf&defender=ksante");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Olaf"));
    cleanup();
    // A refresh is a fresh mount at the same address, with nothing else
    // carried over.
    localStorage.clear();
    mount("?attacker=olaf&defender=ksante");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Olaf"));
    await waitFor(() => expect(stored(TARGET_KEY).targetChampionName).toBe("K'Sante"));
  });
});

describe("failing safely", () => {
  it("changes nothing when the URL names no champion", async () => {
    mount();
    await settle();
    // Long enough for the manifest to have arrived and any effect to have run.
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe(""));
    expect(stored(TARGET_KEY).targetMode ?? "target_dummy").toBe("target_dummy");
  });

  it("leaves the current selection alone for an unknown champion", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ champion: "Ahri" }));
    mount("?attacker=not-a-champion&defender=also-not");
    await settle();
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Ahri"));
    expect(stored(TARGET_KEY).targetMode ?? "target_dummy").toBe("target_dummy");
  });

  it("leaves the current selection alone for a malformed parameter", async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ champion: "Ahri" }));
    mount("?attacker=%3Cscript%3E&defender=olaf%2Cksante");
    await settle();
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Ahri"));
    expect(stored(TARGET_KEY).targetMode ?? "target_dummy").toBe("target_dummy");
  });

  it("applies the half it understands when the opponent is missing", async () => {
    // The Explorer can reach a study with a subject and no opposing champion.
    // One champion is still a destination.
    mount("?attacker=olaf");
    await waitFor(() => expect(stored(CONFIG_KEY).champion).toBe("Olaf"));
    expect(stored(TARGET_KEY).targetMode ?? "target_dummy").toBe("target_dummy");
  });
});
