import { describe, expect, it } from "vitest";
import {
  RoleChallengeContractError, readRoleChallengeCatalog,
  readRoleChallengeStatus, readRoleChallengeStart,
} from "./contracts";
const names = ["top", "jungle", "mid", "adc", "support"];
const champion = { id: "Aatrox", name: "Aatrox", riot_id: "Aatrox", roles: ["top", "jungle"] };
const catalog = () => ({
  schema_version: "role_challenge_catalog.v2",
  product: { answer_count: 12, format_id: "role_challenge_v1", format_version: 1, composer_version: "v2" },
  roles: names.map(role => ({
    role, label: role,
    champions: [{ ...champion, conventional: champion.roles.includes(role) }],
  })),
});
const run = () => ({
  run_id: "rcr_123", match_id: "rcm_123", challenge_date: "2026-10-14",
  slot_kind: "daily", role: "mid", champion: "Aatrox", champion_name: "Aatrox",
  answer_count: 12, host: "role_challenge", composer_version: "v2",
  created_at: "2026-10-14T00:00:00+00:00", match_status: "active", outline: [],
});
const status = () => ({
  schema_version: "role_challenge_status.v1", server_now: "2026-10-14T00:00:00+00:00",
  challenge_date: "2026-10-14", resets_at: "2026-10-15T00:00:00+00:00",
  answer_count: 12, daily_slot: { used: false, run: null as ReturnType<typeof run> | null },
  active_run: null, other_active_match: false,
  next_start: { slot_kind: "daily" as string | null, allowed: true as boolean | null, reason: null as string | null },
});
const start = () => ({
  projection_type: "queue_status", payload: { status: "matched", match_id: "rcm_123" },
  role_challenge: { schema_version: "role_challenge_start.v1", result: "created", run: run() },
});
describe("RC4 Role Challenge wire contracts", () => {
  it("accepts unconventional Aatrox Mid as selectable", () => {
    const result = readRoleChallengeCatalog(catalog());
    expect(result.roles.find(x => x.role === "mid")?.champions[0]).toMatchObject({
      id: "Aatrox", conventional: false, conventionalRoles: ["top", "jungle"],
    });
  });
  it("rejects a catalog missing a champion in one role", () => {
    const source = catalog();
    source.roles[2].champions = [];
    expect(() => readRoleChallengeCatalog(source)).toThrow(RoleChallengeContractError);
  });
  it("keeps unresolved Premium entitlement unknown", () => {
    const source = status();
    source.next_start = { slot_kind: "premium", allowed: null, reason: "entitlement_unavailable" };
    expect(readRoleChallengeStatus(source).nextStart.allowed).toBeNull();
  });
  it("refuses daily slot/run contradiction", () => {
    const source = status(); source.daily_slot.used = true;
    expect(() => readRoleChallengeStatus(source)).toThrow(RoleChallengeContractError);
  });
  it("refuses different match IDs in start envelope", () => {
    const source = start(); source.payload.match_id = "different";
    expect(() => readRoleChallengeStart(source)).toThrow(RoleChallengeContractError);
  });
  it("parses successful matched start", () => {
    expect(readRoleChallengeStart(start())).toMatchObject({ matchId: "rcm_123", run: { role: "mid" } });
  });
  it("refuses unknown schema versions", () => {
    const source = status(); source.schema_version = "role_challenge_status.v2";
    expect(() => readRoleChallengeStatus(source)).toThrow(RoleChallengeContractError);
  });
});
