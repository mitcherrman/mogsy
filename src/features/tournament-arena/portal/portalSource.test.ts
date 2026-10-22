import { beforeEach, describe, expect, it, vi } from "vitest";

const createArenaEvent = vi.fn();
const inviteToArenaEvent = vi.fn();
vi.mock("../api/arenaApi", async (orig) => ({
  ...(await orig<typeof import("../api/arenaApi")>()),
  createArenaEvent: (...a: unknown[]) => createArenaEvent(...a),
  inviteToArenaEvent: (...a: unknown[]) => inviteToArenaEvent(...a),
}));

import { ArenaApiError, type ArenaCatalog } from "../api/arenaApi";
import { serverEvent } from "../api/serverFixtures";
import type { HostDraft } from "./HostPortal";
import { gameTypeFromCatalog, httpPortalSource } from "./portalSource";

const CATALOG: ArenaCatalog = {
  schema_version: "arena_catalog.v1",
  game_types: [
    {
      id: "ranked_quiz", label: "Ranked Quiz", description: "One question per module.",
      default_rules: { game_type: "ranked_quiz", modules: 8, question_seconds: null, ruleset: "standard", speed_bonus: true, difficulty: "mixed", topics: [] },
      settings: {
        modules: { min: 3, max: 20, default: 8 },
        question_seconds: { min: 5, max: 180, default: null, applies_to: ["quiz"] },
        ruleset: { options: ["standard", "time_trial", "survival"], default: "standard" },
        speed_bonus: { default: true },
        difficulty: { options: ["mixed", "easy", "hard"], applied: false },
        topics: { max_items: 8, applied: false },
      },
      available: true,
    },
    {
      id: "draft_memory", label: "Draft Memory", description: "Seat a draft.",
      default_rules: { game_type: "draft_memory", modules: 3, question_seconds: null, ruleset: "standard", speed_bonus: true, difficulty: "mixed", topics: [] },
      settings: {
        modules: { min: 1, max: 9, default: 3 },
        question_seconds: { min: 15, max: 180, default: null, applies_to: ["assembly"] },
        ruleset: { options: ["standard"], default: "standard" },
        speed_bonus: { default: true },
        difficulty: { options: ["mixed"], applied: false },
        topics: { max_items: 8, applied: false },
      },
      available: false, unavailable_reason: "RANKED_CONTENT_UNAVAILABLE",
    },
  ],
  limits: { kinds: ["duel", "match", "tournament"], max_entrants: 16, best_of_options: [1, 3, 5], ready_deadline_seconds: 600, max_draw_replays: 2, invite_ttl_minutes: 1440, max_pending_invites: 32 },
  ranked_engine_enabled: true,
  new_starts_enabled: true,
  server_now: "x",
};

const draft = (over: Partial<HostDraft> = {}): HostDraft => ({
  kind: "tournament", title: "Cup", visibility: "private",
  rules: { game_type: "ranked_quiz", modules: 5, question_seconds: null, ruleset: "standard", speed_bonus: true, difficulty: "mixed", topics: [] },
  best_of: 3, size: 8, invitees: [], readyDeadlineMin: 10, organizerPlays: false, ...over,
});

beforeEach(() => { createArenaEvent.mockReset(); inviteToArenaEvent.mockReset(); });

describe("httpPortalSource", () => {
  it("offers only what the server serves: its types, its bounds, no public, no unapplied content filters", () => {
    const s = httpPortalSource(CATALOG, []);
    expect(s.gameTypes.map((g) => g.id)).toEqual(["ranked_quiz", "draft_memory"]);
    expect(s.gameTypes[1].availability).toBe("later");
    expect(s.gameTypes[0].modulesRange).toEqual([3, 20]);
    expect(s.secondsRange("draft_memory")).toEqual([15, 180]);
    expect(s.sizes.every((n) => n <= 16)).toBe(true);
    expect(s.allowPublic).toBe(false);
    expect(s.contentApplied).toBe(false);
    expect(s.readyDeadlineMinutes).toBe(10);
  });

  it("creates the event on the server, then invites each challenged friend", async () => {
    createArenaEvent.mockResolvedValue(serverEvent({ event_id: "aev_new", title: "Cup", kind: "tournament" }));
    inviteToArenaEvent.mockResolvedValueOnce({ reused: false }).mockRejectedValueOnce(new ArenaApiError("backend", 403, "x", "ARENA_INVITE_NOT_FRIENDS"));
    const friends = [
      { profile_id: "p1", display_name: "One", seed: null, status: "joined" as const, role: "player" as const },
      { profile_id: "p2", display_name: "Two", seed: null, status: "joined" as const, role: "player" as const },
    ];
    const out = await httpPortalSource(CATALOG, friends).create(draft({ invitees: ["p1", "p2"] }), "Cup");
    expect(createArenaEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "tournament", max_entrants: 8, organizer_plays: false, visibility: "private", game_type: "ranked_quiz" }));
    expect(inviteToArenaEvent).toHaveBeenCalledTimes(2);
    expect(out.event_id).toBe("aev_new");
    expect(out.warnings).toEqual(["Two was not invited: You can only invite accepted friends."]);
  });

  it("maps a catalog entry without inventing a different type's name", () => {
    expect(gameTypeFromCatalog(CATALOG.game_types[1]).title).toBe("Draft Memory");
  });
});
