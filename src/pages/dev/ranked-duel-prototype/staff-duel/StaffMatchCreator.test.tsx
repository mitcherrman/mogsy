import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StaffMatchCreator } from "./StaffMatchCreator";
import { errorBody } from "./testFixtures";

const ADMIN_KEY = "super-secret-admin-key";
const TOKEN_ALICE = "tok_alice_abcdefgh1234";
const TOKEN_BOB = "tok_bob_ijklmnop5678";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const created = (arm: string, tankHp: number) => ({
  match_id: "staff-demo-001",
  experiment: { arm, tank_starting_hp: tankHp },
  players: [
    { player_id: "player-one", class_id: "tank", starting_hp: tankHp },
    { player_id: "player-two", class_id: "mage", starting_hp: 90 },
  ],
  participants: [
    { player_id: "player-one", player_token: TOKEN_ALICE },
    { player_id: "player-two", player_token: TOKEN_BOB },
  ],
});

let clipboard: string[];

const renderCreator = () => {
  const onBaseUrlChange = vi.fn();
  render(<StaffMatchCreator baseUrl="http://127.0.0.1:8000" onBaseUrlChange={onBaseUrlChange} />);
};

const createWith = async (adminKey = ADMIN_KEY) => {
  fireEvent.change(screen.getByTestId("sd-admin-key"), { target: { value: adminKey } });
  await act(async () => {
    fireEvent.click(screen.getByTestId("sd-create-match"));
  });
};

beforeEach(() => {
  clipboard = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async (text: string) => void clipboard.push(text)) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StaffMatchCreator", () => {
  it("creates a control-arm match and masks both participant tokens by default", async () => {
    const spy = vi.fn(async () => json(created("control_hp_170", 170)));
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);

    renderCreator();
    await createWith();

    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Admin-Key"]).toBe(ADMIN_KEY);
    expect(JSON.parse(init.body as string)).toMatchObject({
      match_id: "staff-demo-001",
      player_one_class: "tank",
      player_two_class: "mage",
      experiment_arm: "control_hp_170",
    });

    expect(screen.getByTestId("sd-experiment-arm").textContent).toContain("control_hp_170");
    expect(screen.getByTestId("sd-created-player-player-one").textContent).toContain("170");
    const token = screen.getByTestId("sd-token-player-one");
    expect(token.textContent).not.toContain(TOKEN_ALICE);
    expect(token.textContent).toContain("1234");
  });

  it("reveals a token only on explicit click", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(created("control_hp_170", 170))) as unknown as typeof fetch);
    renderCreator();
    await createWith();

    fireEvent.click(screen.getByTestId("sd-reveal-player-one"));
    expect(screen.getByTestId("sd-token-player-one").textContent).toBe(TOKEN_ALICE);
    // The other player's token stays masked.
    expect(screen.getByTestId("sd-token-player-two").textContent).not.toContain(TOKEN_BOB);

    fireEvent.click(screen.getByTestId("sd-reveal-player-one"));
    expect(screen.getByTestId("sd-token-player-one").textContent).not.toContain(TOKEN_ALICE);
  });

  it("copies a join package that excludes the admin key and the other player's token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(created("control_hp_170", 170))) as unknown as typeof fetch);
    renderCreator();
    await createWith();

    await act(async () => {
      fireEvent.click(screen.getByTestId("sd-copy-player-one"));
    });

    expect(clipboard).toHaveLength(1);
    const pkg = JSON.parse(clipboard[0]);
    expect(pkg).toEqual({
      matchId: "staff-demo-001",
      playerId: "player-one",
      participantToken: TOKEN_ALICE,
    });
    expect(clipboard[0]).not.toContain(ADMIN_KEY);
    expect(clipboard[0]).not.toContain(TOKEN_BOB);
  });

  it("clears the admin key from the form after a successful creation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(created("control_hp_170", 170))) as unknown as typeof fetch);
    renderCreator();
    await createWith();
    expect((screen.getByTestId("sd-admin-key") as HTMLInputElement).value).toBe("");
  });

  it("creates a treatment-arm match and shows the assigned experiment metadata", async () => {
    const spy = vi.fn(async () => json(created("treatment_hp_160", 160)));
    vi.stubGlobal("fetch", spy as unknown as typeof fetch);

    renderCreator();
    fireEvent.change(screen.getByTestId("sd-arm"), { target: { value: "treatment_hp_160" } });
    await createWith();

    expect(JSON.parse((spy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({
      experiment_arm: "treatment_hp_160",
    });
    expect(screen.getByTestId("sd-experiment-arm").textContent).toContain("treatment_hp_160");
    expect(screen.getByTestId("sd-experiment-tank_starting_hp").textContent).toContain("160");
  });

  it("shows an authorization failure without leaking the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "Invalid or missing X-Admin-Key" }, 403)) as unknown as typeof fetch,
    );
    renderCreator();
    await createWith("wrong-key");

    expect(screen.getByTestId("sd-create-error").textContent).toBe("Invalid or missing X-Admin-Key");
    expect(screen.queryByTestId("sd-created")).toBeNull();
    expect(document.body.textContent).not.toContain("wrong-key");
  });

  it("shows a duplicate-match-id failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(errorBody("ranked_duel_match_already_exists", "match already exists: staff-demo-001"), 409),
      ) as unknown as typeof fetch,
    );
    renderCreator();
    await createWith();
    expect(screen.getByTestId("sd-create-error").textContent).toContain("already exists");
  });

  it("shows the experiment kill switch failure for a treatment request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          errorBody(
            "ranked_duel_experiment_disabled",
            "treatment arm requested while the experiment kill switch is disabled",
          ),
          409,
        ),
      ) as unknown as typeof fetch,
    );
    renderCreator();
    fireEvent.change(screen.getByTestId("sd-arm"), { target: { value: "treatment_hp_160" } });
    await createWith();
    expect(screen.getByTestId("sd-create-error").textContent).toContain("kill switch");
  });
});
