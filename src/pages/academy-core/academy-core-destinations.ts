/**
 * Academy Core V3 — the navigation registry for the production `/lol` home.
 *
 * Every route here is a GROUNDED production destination, verified against
 * `src/App.tsx` and the existing Hall (`src/pages/LolHub.tsx`, now served at
 * `/lol/hall`). Nothing is invented: the four rooms are the Hall's four primary
 * destinations with the Hall's own cover champions, cover titles and splash
 * crops (HUB_DESTINATIONS in LolHub.tsx / HUB_BOOK_COVER_CHAMPION in
 * academy-hub-warm.ts); the Daily CTA is the Quiz page's own start-or-resume
 * intent; Ranked enters the existing Leaguecraft Play record (`/quiz?play=1`),
 * where every auth / account / role / availability gate already lives.
 *
 * V3 VISUAL PLACEMENT is deliberately different from the Hall's list order:
 * Leaguecraft and Pro Play are the prominent upper pair, Combat Simulation
 * and Mogzy Archives the supporting lower pair. Routes and guide ids are
 * unchanged.
 */
import { BrainCircuit, FileText, Swords, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HUB_GUIDE_MODES, type HubGuideModeId } from "@/components/lol/hub-guide";
import { HUB_BOOK_COVER_CHAMPION } from "@/lib/hub/academy-hub-warm";

/** Instrument focus states. `idle` is the rest state; the rest key the rooms. */
export type CoreFocus = "idle" | HubGuideModeId;

export type CoreTier = "upper" | "lower";

export interface CoreDestination {
  /** Stable id — reuses the Hall's guide ids so copy and analytics line up. */
  id: HubGuideModeId;
  /** Production route. */
  to: string;
  /** Accessible name and visible label (the book's aria-label). */
  title: string;
  /** Lines set on the book's leather panel, split on "\n" (the Hall's own setting). */
  coverTitle: string;
  /** The Hall's cover champion for this room (manifest splash). */
  championName: string;
  /** The Hall's `object-position` crop for that splash in the portrait art window. */
  splashPosition: string;
  /** Engraved bay number — purely visual. */
  bay: string;
  /** The room's measurement word on the instrument readout. */
  readout: string;
  /** The one-sentence preview, reused from the Hall's guide copy. */
  preview: string;
  Icon: LucideIcon;
  /** Upper pair = the focal, larger books; lower pair = supporting. */
  tier: CoreTier;
  /** Left or right of the Core's central axis. */
  side: "left" | "right";
}

export const CORE_DESTINATIONS: readonly CoreDestination[] = [
  {
    id: "leaguecraft",
    to: "/quiz",
    title: "Leaguecraft",
    coverTitle: "Leaguecraft\nStudies",
    championName: HUB_BOOK_COVER_CHAMPION["/quiz"],
    splashPosition: "78% center",
    bay: "01",
    readout: "INQUIRY",
    preview: HUB_GUIDE_MODES.leaguecraft.description,
    Icon: BrainCircuit,
    tier: "upper",
    side: "left",
  },
  {
    id: "pro-play",
    to: "/lol/pro-play",
    title: "Pro Play",
    coverTitle: "Pro Play",
    championName: HUB_BOOK_COVER_CHAMPION["/lol/pro-play"],
    splashPosition: "56% center",
    bay: "02",
    readout: "OBSERVE",
    preview: HUB_GUIDE_MODES["pro-play"].description,
    Icon: Trophy,
    tier: "upper",
    side: "right",
  },
  {
    id: "combat-lab",
    to: "/combat-lab",
    title: "Combat Simulation",
    coverTitle: "Combat\nSimulation",
    championName: HUB_BOOK_COVER_CHAMPION["/combat-lab"],
    splashPosition: "36% center",
    bay: "03",
    readout: "MEASURE",
    preview: HUB_GUIDE_MODES["combat-lab"].description,
    Icon: Swords,
    tier: "lower",
    side: "left",
  },
  {
    id: "archives",
    to: "/lol/docs",
    title: "Mogzy Archives",
    coverTitle: "Mogzy\nArchives",
    championName: HUB_BOOK_COVER_CHAMPION["/lol/docs"],
    splashPosition: "34% center",
    bay: "04",
    readout: "STRATA",
    preview: HUB_GUIDE_MODES.archives.description,
    Icon: FileText,
    tier: "lower",
    side: "right",
  },
] as const;

/** Crystal-button cycle order: the upper pair first, then the lower pair. */
export const CORE_CYCLE_ORDER: readonly HubGuideModeId[] = ["leaguecraft", "pro-play", "combat-lab", "archives"];

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
 * The Home Hub (the retired `/lol` page, kept whole). Academy Commons is the
 * Hall's second screen; the Hall honours the `#academy-commons` fragment on
 * mount. The Core itself forwards a legacy `/lol#academy-commons` link here
 * (see AcademyCorePage), so old deep links keep landing on the Commons.
 */
export const ACADEMY_HALL_ROUTE = "/lol/hall";
export const ACADEMY_COMMONS_FRAGMENT = "#academy-commons";
export const ACADEMY_COMMONS_HREF = `${ACADEMY_HALL_ROUTE}${ACADEMY_COMMONS_FRAGMENT}`;

/** DOM id of the visually-hidden description a book link is described by. */
export function coreBayDescriptionId(id: HubGuideModeId): string {
  return `academy-core-bay-desc-${id}`;
}

/**
 * The intentional activation before a book navigates. Short but legible;
 * the brief's ceiling is 350 ms and reduced motion skips it entirely.
 */
export const BOOK_ACTIVATION_MS = 240;
