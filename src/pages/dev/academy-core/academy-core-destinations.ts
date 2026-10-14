/**
 * Academy Core V1 — the navigation registry for the `/lol/dev/academy-core`
 * preview (alias `/dev/academy-core`).
 *
 * Every route here is a GROUNDED production destination, verified against
 * `src/App.tsx` and the existing Hall (`src/pages/LolHub.tsx`) on the branch
 * base. Nothing is invented: the four rooms are the Hall's four primary
 * destinations, the Daily CTA is the Quiz page's own start-or-resume intent,
 * and Ranked enters the existing Leaguecraft Play record (`/quiz?play=1`),
 * where every auth / account / role / availability gate already lives.
 *
 * The file is data only so the page, the instrument and the tests read one
 * source of truth.
 */
import { BrainCircuit, FileText, Swords, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HUB_GUIDE_MODES, type HubGuideModeId } from "@/components/lol/hub-guide";

/** Instrument focus states. `idle` is the rest state; the rest key the rooms. */
export type CoreFocus = "idle" | HubGuideModeId;

export interface CoreDestination {
  /** Stable id — reuses the Hall's guide ids so copy and analytics line up. */
  id: HubGuideModeId;
  /** Production route. */
  to: string;
  /** Accessible name and visible label. */
  title: string;
  /** Engraved bay number — purely visual. */
  bay: string;
  /**
   * The measurement language of the room, shown on the instrument readout
   * while the bay is focused (one short line, per the brief).
   */
  readout: string;
  /** The one-sentence preview, reused from the Hall's guide copy. */
  preview: string;
  Icon: LucideIcon;
  /**
   * Selector angle, degrees, screen convention (0 = +x, clockwise positive).
   * The four bays sit on an arc on the instrument's right-hand side; the
   * index arm sweeps to this angle when the bay is focused.
   */
  angle: number;
}

export const CORE_DESTINATIONS: readonly CoreDestination[] = [
  {
    id: "leaguecraft",
    to: "/quiz",
    title: "Leaguecraft",
    bay: "01",
    readout: "INQUIRY",
    preview: HUB_GUIDE_MODES.leaguecraft.description,
    Icon: BrainCircuit,
    angle: -51,
  },
  {
    id: "combat-lab",
    to: "/combat-lab",
    title: "Combat Simulation",
    bay: "02",
    readout: "MEASURE",
    preview: HUB_GUIDE_MODES["combat-lab"].description,
    Icon: Swords,
    angle: -17,
  },
  {
    id: "archives",
    to: "/lol/docs",
    title: "Mogzy Archives",
    bay: "03",
    readout: "STRATA",
    preview: HUB_GUIDE_MODES.archives.description,
    Icon: FileText,
    angle: 17,
  },
  {
    id: "pro-play",
    to: "/lol/pro-play",
    title: "Pro Play",
    bay: "04",
    readout: "OBSERVE",
    preview: HUB_GUIDE_MODES["pro-play"].description,
    Icon: Trophy,
    angle: 51,
  },
] as const;

/** The index arm's rest angle: parked between bays, pointing at nothing. */
export const CORE_IDLE_ANGLE = -100;

/** Readout text while nothing is focused. */
export const CORE_IDLE_READOUT = "STANDBY";

export function destinationById(id: CoreFocus): CoreDestination | null {
  if (id === "idle") return null;
  return CORE_DESTINATIONS.find((d) => d.id === id) ?? null;
}

/**
 * Primary CTA — the Daily Challenge. The route and the router state are the
 * Quiz page's existing contract (`navigate("/quiz/daily-challenge", { state:
 * DAILY_START_STATE })`); the page imports DAILY_START_STATE itself so this
 * registry stays free of the Daily module.
 */
export const DAILY_ROUTE = "/quiz/daily-challenge";

/**
 * Secondary CTA — Ranked. `/quiz?play=1` is how the Leaguecraft lobby is asked
 * to open its Play record on mount (see PLAY_RETURN_PARAM in Quiz.tsx); the
 * record then applies every account / role / availability gate itself.
 * `/quiz/ranked` is the live-match host and is deliberately NOT linked.
 */
export const RANKED_ROUTE = "/quiz?play=1";

/** Broadcast gateway and the existing second screen. */
export const PATCH_REPORTS_ROUTE = "/lol/patch-reports";
export const ACADEMY_COMMONS_HREF = "/lol#academy-commons";
export const ACADEMY_HALL_ROUTE = "/lol";

/** DOM id of the visually-hidden description a bay link is described by. */
export function coreBayDescriptionId(id: HubGuideModeId): string {
  return `academy-core-bay-desc-${id}`;
}
