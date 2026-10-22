/**
 * Where the Match Host Portal's choices come from and where Launch goes.
 *
 * `fixturePortalSource` is the DEV harness: the fixture catalog, invented
 * friends, an in-tab event. `httpPortalSource` is the Admin portal: the
 * server's own catalog (`GET /api/arena/catalog`, so the portal offers only
 * what the server will validate), the owner's accepted friends, and a real
 * `POST /api/arena/events` followed by one invitation per challenged friend.
 */
import { MODE_ACCENT } from "@/lib/public-modes/gallery";

import {
  arenaErrorCopy, createArenaEvent, inviteToArenaEvent,
  type ArenaCatalog, type ArenaCatalogGameType,
} from "../api/arenaApi";
import type { ArenaEntrant } from "../contracts";
import { GAME_TYPES, gameTypeById, type ArenaGameType } from "../fixtures/catalog";
import type { ArenaGateway } from "../gateway/types";
import type { HostDraft } from "./HostPortal";

export interface PortalLaunch {
  event_id: string;
  title: string;
  /** Things that did not go through (e.g. one invitation), as copy. */
  warnings?: string[];
}

export interface PortalSource {
  source: "fixture" | "http";
  gameTypes: readonly ArenaGameType[];
  friends: readonly ArenaEntrant[];
  /** Tournament field sizes on offer. */
  sizes: readonly number[];
  allowPublic: boolean;
  /** Whether the server applies topic / difficulty filters. */
  contentApplied: boolean;
  /** Inclusive seconds-per-question bounds for a game type. */
  secondsRange: (gameTypeId: string) => [number, number];
  /** A fixed server deadline (minutes), or null when the portal sets it. */
  readyDeadlineMinutes: number | null;
  /** Ask whether the organizer takes a seat. */
  organizerSeatChoice: boolean;
  inviteTtlLabel: string;
  create: (draft: HostDraft, title: string) => Promise<PortalLaunch>;
  errorCopy: (e: unknown) => string;
}

export function fixturePortalSource(gateway: ArenaGateway): PortalSource {
  return {
    source: "fixture",
    gameTypes: GAME_TYPES,
    friends: gateway.friends(),
    sizes: [4, 6, 8, 12, 16, 24, 32],
    allowPublic: true,
    contentApplied: true,
    secondsRange: () => [5, 90],
    readyDeadlineMinutes: null,
    organizerSeatChoice: false,
    inviteTtlLabel: "15-minute",
    create: async (draft, title) => {
      const ev = gateway.createEvent({
        event_id: `aev_host_${Date.now().toString(36)}`,
        title,
        kind: draft.kind,
        entrants: draft.size,
        best_of: draft.best_of,
        rules: draft.rules,
        visibility: draft.visibility,
        invitees: draft.invitees,
      });
      return { event_id: ev.event_id, title: ev.title };
    },
    errorCopy: () => "The fixture could not create that event.",
  };
}

const ACCENTS: Record<string, string> = {
  ranked_quiz: "#e3c66f",
  ranked_mix: "#d9b45a",
  match_grid: MODE_ACCENT.match_grid,
  reconstruct: MODE_ACCENT.reconstruct,
  order_forge: MODE_ACCENT.order_forge,
  chronoscope: MODE_ACCENT.chronoscope,
  roster_lock: MODE_ACCENT.roster_lock,
  draft_memory: MODE_ACCENT.roster_lock,
};

/** A server catalog entry in the portal's card shape; visuals from the
 *  fixture list where it knows the type, the server's words always. */
export function gameTypeFromCatalog(g: ArenaCatalogGameType): ArenaGameType {
  const known = GAME_TYPES.find((x) => x.id === g.id) ?? gameTypeById(g.id);
  const sec = g.settings?.question_seconds;
  return {
    id: g.id,
    title: g.label,
    blurb: g.description,
    accent: ACCENTS[g.id] ?? known.accent,
    unit: known.id === g.id ? known.unit : "modules",
    defaultModules: g.default_rules?.modules ?? g.settings.modules.default,
    modulesRange: [g.settings.modules.min, g.settings.modules.max],
    defaultSeconds: known.id === g.id ? Math.min(sec?.max ?? 180, Math.max(sec?.min ?? 5, known.defaultSeconds)) : (sec?.min ?? 20),
    rulesets: g.settings.ruleset.options,
    availability: g.available === false ? "later" : "eligible",
    note: g.available === false ? "Not servable on this database right now" : undefined,
  };
}

const SIZES = [2, 4, 6, 8, 12, 16, 24, 32];

export function httpPortalSource(catalog: ArenaCatalog, friends: readonly ArenaEntrant[]): PortalSource {
  const byId = new Map(catalog.game_types.map((g) => [g.id, g]));
  const ttl = catalog.limits.invite_ttl_minutes;
  return {
    source: "http",
    gameTypes: catalog.game_types.map(gameTypeFromCatalog),
    friends,
    sizes: SIZES.filter((n) => n <= catalog.limits.max_entrants),
    allowPublic: false,
    contentApplied: false,
    secondsRange: (id) => {
      const s = byId.get(id)?.settings.question_seconds;
      return [s?.min ?? 5, s?.max ?? 180];
    },
    readyDeadlineMinutes: Math.round(catalog.limits.ready_deadline_seconds / 60),
    organizerSeatChoice: true,
    inviteTtlLabel: ttl % 60 === 0 ? `${ttl / 60}-hour` : `${ttl}-minute`,
    create: async (draft, title) => {
      const ev = await createArenaEvent({
        kind: draft.kind,
        title,
        game_type: draft.rules.game_type,
        rules: {
          modules: draft.rules.modules,
          question_seconds: draft.rules.question_seconds,
          ruleset: draft.rules.ruleset,
          speed_bonus: draft.rules.speed_bonus,
        },
        best_of: draft.best_of,
        max_entrants: draft.kind === "tournament" ? draft.size : undefined,
        visibility: draft.visibility === "public" ? "link" : draft.visibility,
        organizer_plays: draft.organizerPlays,
      });
      const warnings: string[] = [];
      for (const pid of draft.invitees) {
        try {
          await inviteToArenaEvent(ev.event_id, pid);
        } catch (e) {
          const who = friends.find((f) => f.profile_id === pid)?.display_name ?? "A friend";
          warnings.push(`${who} was not invited: ${arenaErrorCopy(e)}`);
        }
      }
      return { event_id: ev.event_id, title: ev.title, warnings };
    },
    errorCopy: arenaErrorCopy,
  };
}
