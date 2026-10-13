// ---------------------------------------------------------------------------
// UX3A — document metadata for the Worlds experience's screens.
//
// ONE CANONICAL PER SCREEN, NEVER PER SELECTION. The bare Worlds URL keeps its
// identity (same title, description and canonical as the published page), and
// each functional screen canonicalises to its own clean path:
//   Overview   <base>
//   Stages     <base>/stages/<stage>   (a bare /stages, or an unknown stage,
//                                       names the stage it actually shows)
//   Teams      <base>/teams
//   Schedule   <base>/schedule
// Query selections (`?team=`, `?match=`, `?day=`, `?round=`…) never reach the
// canonical, so a shared or crawled selection folds into its screen instead of
// becoming a page of its own. The title does follow a selection (a tab or a
// shared link reads "Karmine Corp — Worlds 2026 Teams"); the canonical does not.
// A path the experience has no screen for (Discover, a typo) is the Overview,
// as the experience itself corrects it.
//
// Pure: the page passes the served body and the location.
// ---------------------------------------------------------------------------

import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import { stageOf, stageShortName } from "@/lib/pro-play/tournamentV2View";

import { defaultStageKey } from "./experienceView";
import { buildHref, parseLocation, stageKeyFromSlug, stageLabel } from "./navigation";

export interface ExperienceSeo {
  title: string;
  description: string;
  /** Canonical / og:url path: a screen path, never a query. */
  path: string;
}

/** The published page's own title and description, kept for the Overview. */
export function tournamentV2Seo(data: TournamentResponseV2) {
  const ctx = data.context;
  return {
    title: `${ctx.short_name} — ${ctx.name} | Mogzy`,
    description: `${ctx.name}: the ${ctx.participants.length}-team field, the ${ctx.stages
      .map((s) => stageShortName(s))
      .join(", ")} stages, the full schedule and results.`,
  };
}

export function experienceSeo(data: TournamentResponseV2, base: string, pathname: string, search: string): ExperienceSeo {
  const { context: ctx, state } = data;
  const loc = parseLocation(base, pathname, search);
  const event = `${ctx.short_name} ${ctx.starts.slice(0, 4)}`;
  const stageKeys = ctx.stages.map((s) => s.key);
  const matchTitle = (id: string | null) => {
    const m = id ? state.matches.find((x) => x.match_id === id) : null;
    const [a, b] = m ? m.teams : [];
    return a?.code && b?.code ? `${a.code} vs ${b.code}` : null;
  };

  switch (loc.screen) {
    case "stages": {
      const key = stageKeyFromSlug(loc.stageSlug ?? undefined, stageKeys) ?? defaultStageKey(state, ctx);
      const stage = stageOf(ctx, key);
      const name = stage ? stageLabel(stage) : "Stages";
      const match = matchTitle(loc.matchId);
      return {
        title: `${match ? `${match} — ${event} ${name}` : `${name} — ${event}`} | Mogzy`,
        description: stage
          ? `The ${stage.name} of the ${ctx.name}: its format, matches and results from the official schedule.`
          : `The stages of the ${ctx.name}: formats, matches and results from the official schedule.`,
        path: buildHref(base, { screen: "stages", stageKey: stage?.key ?? null }),
      };
    }
    case "teams": {
      const team = loc.team ? ctx.participants.find((p) => p.code === loc.team) : null;
      const label = team ? team.name || team.code : null;
      return {
        title: `${label ? `${label} — ${event} Teams` : `Teams — ${event}`} | Mogzy`,
        description: `The ${ctx.participants.length}-team field of the ${ctx.name} by region: how each team entered, where it stands and its matches.`,
        path: buildHref(base, { screen: "teams" }),
      };
    }
    case "schedule": {
      const match = matchTitle(loc.matchId);
      const count = state.matches.length;
      return {
        title: `${match ? `${match} — ${event} Schedule` : `Schedule — ${event}`} | Mogzy`,
        description: `The ${ctx.name} schedule by day${count ? `: ${count} matches` : ""} across the ${ctx.stages
          .map((s) => stageShortName(s))
          .join(", ")} stages, in your timezone, with results.`,
        path: buildHref(base, { screen: "schedule" }),
      };
    }
    default:
      return { ...tournamentV2Seo(data), path: base };
  }
}
