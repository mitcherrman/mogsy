import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewPanel } from "./ReviewPanel";
import { StructuralQueueSummary } from "./StructuralSection";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type { UpdateDetail, UpdateRow } from "@/lib/knowledge-admin/types";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "admin@test" } }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const baseUpdate = (over: Partial<UpdateRow> = {}): UpdateRow => ({
  id: 42,
  entity_type: "champion",
  entity_name: "Zenara",
  ability_key: "Q",
  property: "structural:ability_create",
  rank: 1,
  current_value: null,
  proposed_value: null,
  change_type: "STRUCTURAL",
  status: "PENDING",
  provider: "wiki",
  source_url: "https://wiki.example/Zenara",
  confidence: 0.9,
  patch_version: "26.14",
  created_at: "2026-07-24T00:00:00Z",
  delta: null,
  delta_pct: null,
  severity: "info",
  flags: [],
  group_key: "Zenara|Q|structural:ability_create",
  ...over,
});

const ABILITY_PAYLOAD = JSON.stringify({
  target: "structural",
  kind: "ability_create",
  champion: "Zenara",
  slot: "Q",
  fields: {
    ability_name: "Starfall Lance",
    description: "Hurls a lance of starlight.",
    cooldown: "9 / 8 / 7 / 6 / 5",
    cost: "50 / 55 / 60 / 65 / 70",
    range_text: "1100",
  },
});

const detailFixture = (over: Partial<UpdateDetail> = {}): UpdateDetail => ({
  champion: "Zenara",
  ability: { key: "Q", name: null },
  property: "structural:ability_create",
  affected_ranks: [1],
  db_live_progression: [],
  proposed_progression: [],
  diff: [],
  providers: ["wiki"],
  confidence: 0.9,
  confidence_breakdown: {
    parser_confidence: 0.9,
    record_confidence: 0.9,
    provider_weight: 1,
    parser_name: "wiki_champion_identity_parser",
  },
  patch_version: "26.14",
  source_url: "https://wiki.example/Zenara",
  raw_evidence: {
    raw_value: null,
    parsed_text: "Ability infobox for Q parsed from wiki.",
    proposed_raw_value: null,
    proposed_full_progression: ABILITY_PAYLOAD,
  },
  grammar_type: null,
  consensus: null,
  apply_history: [],
  warnings: [],
  recommended_action: "approve",
  update: baseUpdate() as UpdateDetail["update"],
  sibling_pending_ranks: [],
  status: "PENDING",
  ...over,
});

function install(detail: UpdateDetail) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/updates\/\d+$/.test(url)) return json(detail);
      return json({ detail: `unexpected ${url}` }, 500);
    }),
  );
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReviewPanel updateId={42} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setAdminKey("secret-admin");
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  clearAdminKey();
  vi.unstubAllGlobals();
});

describe("ReviewPanel — structural ability creation", () => {
  it("renders labeled fields, never null → null, and hides numeric-only controls", async () => {
    install(detailFixture());
    renderPanel();

    expect(await screen.findByText("Structural Change")).toBeInTheDocument();
    // Labeled fields with values
    expect(screen.getByText("Ability name")).toBeInTheDocument();
    expect(screen.getByText("Starfall Lance")).toBeInTheDocument();
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
    expect(screen.getByText("9 / 8 / 7 / 6 / 5")).toBeInTheDocument();
    expect(screen.getByText("Resource cost")).toBeInTheDocument();
    expect(screen.getByText("50 / 55 / 60 / 65 / 70")).toBeInTheDocument();
    expect(screen.getByText("Range")).toBeInTheDocument();
    expect(screen.getByText("1100")).toBeInTheDocument();
    // Record + patch identity
    expect(screen.getByText("champion_abilities")).toBeInTheDocument();
    expect(screen.getByText("Patch identity")).toBeInTheDocument();
    // What approval does
    expect(screen.getByText(/Creates a NEW ability row/)).toBeInTheDocument();
    // Raw payload is available but collapsed (details/summary)
    expect(screen.getByText("Raw payload (debug)")).toBeInTheDocument();

    // Never "null → null" anywhere
    expect(document.body.textContent).not.toMatch(/null\s*→\s*null/);
    // Numeric-only UI hidden for structural rows
    expect(screen.queryByText("Progression Diff")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve rank/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve all/ })).not.toBeInTheDocument();
    // Single structural approve control, enabled
    const approve = screen.getByRole("button", { name: /Approve structural change/ });
    expect(approve).toBeEnabled();
  });

  it("shows skipped deterministic-parse fields with the reason", async () => {
    const payload = JSON.parse(ABILITY_PAYLOAD);
    payload.fields.cooldown = "";
    install(
      detailFixture({
        raw_evidence: {
          raw_value: null,
          parsed_text: "evidence",
          proposed_raw_value: null,
          proposed_full_progression: JSON.stringify(payload),
        },
      }),
    );
    renderPanel();
    expect(await screen.findByText("Skipped by deterministic parsing")).toBeInTheDocument();
    expect(screen.getAllByText(/value pipeline/).length).toBeGreaterThan(0);
  });
});

describe("ReviewPanel — structural champion identity & roles", () => {
  it("renders identity fields", async () => {
    install(
      detailFixture({
        property: "structural:champion_identity",
        ability: { key: null, name: null },
        update: baseUpdate({ property: "structural:champion_identity", ability_key: null }) as UpdateDetail["update"],
        raw_evidence: {
          raw_value: null,
          parsed_text: "Champion infobox fields parsed from wiki",
          proposed_raw_value: null,
          proposed_full_progression: JSON.stringify({
            target: "structural",
            kind: "champion_identity",
            champion: "Zenara",
            fields: { title: "the Starlit Warden", resource_type: "Mana" },
          }),
        },
      }),
    );
    renderPanel();
    expect((await screen.findAllByText("Champion identity")).length).toBeGreaterThan(0);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("the Starlit Warden")).toBeInTheDocument();
    expect(screen.getByText("Resource type")).toBeInTheDocument();
    expect(screen.getByText("champion_metadata")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/null\s*→\s*null/);
  });

  it("renders the proposed role set", async () => {
    install(
      detailFixture({
        property: "structural:role_tags",
        ability: { key: null, name: null },
        update: baseUpdate({ property: "structural:role_tags", ability_key: null }) as UpdateDetail["update"],
        raw_evidence: {
          raw_value: null,
          parsed_text: "Champion roles parsed from wiki",
          proposed_raw_value: null,
          proposed_full_progression: JSON.stringify({
            target: "structural",
            kind: "role_tags",
            champion: "Zenara",
            roles: ["Mage", "Artillery"],
          }),
        },
      }),
    );
    renderPanel();
    expect(await screen.findByText("Proposed role set")).toBeInTheDocument();
    expect(screen.getByText("Mage")).toBeInTheDocument();
    expect(screen.getByText("Artillery")).toBeInTheDocument();
    expect(screen.getByText(/Replaces the champion's full role\/tag set/)).toBeInTheDocument();
  });
});

describe("ReviewPanel — malformed structural payloads block approval", () => {
  it.each([
    ["invalid JSON", "{nope"],
    ["missing payload", null],
    ["unsupported fields", JSON.stringify({ target: "structural", kind: "ability_create", champion: "Z", slot: "Q", fields: { ability_name: "X", icon_url: "no" } })],
  ])("%s → explicit error + approval disabled", async (_label, payloadJson) => {
    install(
      detailFixture({
        raw_evidence: {
          raw_value: null,
          parsed_text: null,
          proposed_raw_value: null,
          proposed_full_progression: payloadJson,
        },
      }),
    );
    renderPanel();
    expect(
      await screen.findByText("Structural payload cannot be understood"),
    ).toBeInTheDocument();
    const approve = screen.getByRole("button", { name: /Approve structural change/ });
    expect(approve).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("ReviewPanel — numeric proposals unchanged", () => {
  it("still renders the progression diff and rank approvals", async () => {
    install(
      detailFixture({
        property: "cooldown",
        diff: [
          { rank: 1, current: 9, proposed: 8, delta: -1, delta_pct: -11.1, changed: true, pending_update_id: 42 },
        ] as UpdateDetail["diff"],
        raw_evidence: {
          raw_value: "9 / 8 / 7",
          parsed_text: "Q cooldown reduced",
          proposed_raw_value: "8 / 8 / 7",
          proposed_full_progression: "8 / 8 / 7",
        },
        update: baseUpdate({ property: "cooldown", current_value: 9, proposed_value: 8, change_type: "STAT_CHANGE" }) as UpdateDetail["update"],
      }),
    );
    renderPanel();
    expect(await screen.findByText("Progression Diff")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve rank/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve all/ })).toBeInTheDocument();
    expect(screen.queryByText("Structural Change")).not.toBeInTheDocument();
    // Numeric interpretation box still shows the progression string
    expect(screen.getAllByText("8 / 8 / 7").length).toBeGreaterThan(0);
  });
});

describe("StructuralQueueSummary — queue rows", () => {
  it("summarises structural rows without null → null", () => {
    render(
      <StructuralQueueSummary
        updates={[baseUpdate({ proposed_full_progression: ABILITY_PAYLOAD })]}
      />,
    );
    expect(screen.getByText("Ability creation")).toBeInTheDocument();
    expect(screen.getByText("Zenara Q")).toBeInTheDocument();
    expect(screen.getByText("Starfall Lance")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/null/);
  });

  it("renders a safe fallback when the payload is missing (older backend list)", () => {
    render(<StructuralQueueSummary updates={[baseUpdate()]} />);
    expect(
      screen.getByText(/Structural payload cannot be understood/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/null\s*→\s*null/);
  });
});
