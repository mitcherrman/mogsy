/**
 * ATL-P1-C — Lens resolution against DEMO fixtures.
 *
 * This is the prototype's stand-in for the fail-closed adapters P1-D will
 * design. It is synchronous because the fixtures are in memory, but every view
 * still carries the four separate axes the contract asks for: capability
 * (can this source answer this subject at all), fetch status, coverage (what
 * came back) and the visual state that lives elsewhere.
 */
import { contextKey, contextLabel, contextValidFor, resolveEffectiveContext } from "./context";
import {
  CHAMPIONS,
  CURRENT_PATCH,
  DEMO_DATA_LABEL,
  EXACT_MATCHUP_ROUTE,
  PLAYERS,
  abilityRecord,
  archiveLinesSince,
  patchEntry,
  playerChampionRecord,
  proChampionRecord,
} from "./fixtures";
import type { Facet, GlobalContext, Lens, LensView, Notice, TemporalContext } from "./types";

const DEMO_NOTICE: Notice = { tone: "demo", text: `${DEMO_DATA_LABEL} — memory-only fixture values, not sourced numbers.` };

export function subjectTitle(lens: Lens): string {
  const s = lens.subject;
  switch (s.kind) {
    case "ability":
      return `${CHAMPIONS[s.champion].name} ${s.slot}`;
    case "champion":
      return CHAMPIONS[s.champion].name;
    case "player-champion":
      return `${PLAYERS[s.player].name} on ${CHAMPIONS[s.champion].name}`;
    case "exact-matchup":
      return `${PLAYERS[s.a.player].name} ${CHAMPIONS[s.a.champion].name} vs ${PLAYERS[s.b.player].name} ${CHAMPIONS[s.b.champion].name}`;
  }
}

export function subjectSubtitle(lens: Lens): string {
  const s = lens.subject;
  switch (s.kind) {
    case "ability": {
      const rec = abilityRecord(s.champion, s.slot);
      return rec ? `${rec.name} · Leaguecraft ability` : "Leaguecraft ability";
    }
    case "champion":
      return "Pro Play champion · champion level";
    case "player-champion":
      return `${PLAYERS[s.player].team} · player-on-champion record`;
    case "exact-matchup":
      return "Exact same-game head-to-head";
  }
}

function pct(n: number): number {
  return Math.round(n * 1000) / 10;
}

export function resolveLens(lens: Lens, global: GlobalContext): LensView {
  const effective = resolveEffectiveContext(lens, global);
  const base = {
    lens,
    title: subjectTitle(lens),
    subtitle: subjectSubtitle(lens),
    universe: lens.subject.universe,
    effective,
    fetch: "ready" as const,
    evidence: [] as LensView["evidence"],
    gate: null,
  };
  const ctx = effective.context;

  if (!contextValidFor(lens.subject.universe, ctx)) {
    return {
      ...base,
      source: sourceFor(lens),
      capability: "unsupported",
      coverage: "not_applicable",
      facets: [],
      notices: [
        { tone: "blocked", text: `${contextLabel(ctx)} is a ${universeOf(ctx)} selector; a ${lens.subject.universe === "leaguecraft" ? "Leaguecraft" : "Pro Play"} Lens cannot read under it. No crosswalk is defined in V0.` },
      ],
    };
  }

  switch (lens.subject.kind) {
    case "ability":
      return resolveAbility(lens, base, ctx);
    case "champion":
      return resolveProChampion(lens, base, ctx);
    case "player-champion":
      return resolvePlayerChampion(lens, base, ctx);
    case "exact-matchup":
      return {
        ...base,
        source: "pro.matchup.exact",
        capability: "gated",
        fetch: "idle",
        coverage: "denied",
        facets: [],
        notices: [
          { tone: "blocked", text: "Exact head-to-head is owner-only. The prototype never calls the route; this Lens stays sealed until a real owner session grants it." },
          { tone: "info", text: "This is the only true head-to-head source. Matrix cells are independently sourced records, never head-to-head." },
        ],
        gate: { route: EXACT_MATCHUP_ROUTE, requires: "owner", granted: false, reason: "Mock gate: no owner session in this prototype." },
      };
  }
}

type Base = Omit<LensView, "source" | "capability" | "coverage" | "facets" | "notices">;

function universeOf(ctx: TemporalContext): string {
  return ctx.kind === "lc-patch" || ctx.kind === "lc-patch-range" ? "Leaguecraft" : "Pro Play";
}

function sourceFor(lens: Lens): LensView["source"] {
  switch (lens.subject.kind) {
    case "ability":
      return "lc.ability_catalog";
    case "champion":
      return "pro.champion_records";
    case "player-champion":
      return "pro.player_champion_records";
    case "exact-matchup":
      return "pro.matchup.exact";
  }
}

function resolveAbility(lens: Lens, base: Base, ctx: TemporalContext): LensView {
  if (lens.subject.kind !== "ability") throw new Error("unreachable");
  const { champion, slot } = lens.subject;
  const rec = abilityRecord(champion, slot);
  if (!rec) {
    return { ...base, source: "lc.ability_catalog", capability: "supported", coverage: "empty", facets: [], notices: [{ tone: "warn", text: "No fixture for this ability." }] };
  }

  const isCurrent = ctx.kind === "current" || (ctx.kind === "lc-patch" && ctx.patch === CURRENT_PATCH);
  if (isCurrent) {
    const facets: Facet[] = [
      { key: "baseDamage", label: "Base damage", value: rec.baseDamage, unit: "per rank", population: "lc:current" },
      { key: "apRatio", label: "AP ratio", value: pct(rec.apRatio), unit: "% AP", population: "lc:current" },
      { key: "cooldown", label: "Cooldown", value: rec.cooldown, unit: "s per rank", population: "lc:current" },
      { key: "cost", label: "Cost", value: rec.cost, unit: `${rec.costType} per rank`, population: "lc:current" },
      { key: "range", label: "Range", value: rec.range, unit: "units", population: "lc:current" },
    ];
    return {
      ...base,
      source: "lc.ability_catalog",
      capability: "supported",
      coverage: "full",
      facets,
      notices: [DEMO_NOTICE, { tone: "info", text: `Current values as of patch ${CURRENT_PATCH}.` }],
    };
  }

  if (ctx.kind === "lc-patch") {
    const entry = patchEntry(ctx.patch);
    const lines = archiveLinesSince(champion, slot, ctx.patch);
    const notices: Notice[] = [
      { tone: "blocked", text: `Absolute values at patch ${ctx.patch} are not recorded. The archive stores change lines, not past game state, so this Lens shows no historical damage or cooldown.` },
      { tone: "info", text: lines.length ? `${lines.length} recorded change line${lines.length === 1 ? " touches" : "s touch"} ${CHAMPIONS[champion].name} ${slot} between ${ctx.patch} and ${CURRENT_PATCH}.` : `No recorded change lines touch ${CHAMPIONS[champion].name} ${slot} between ${ctx.patch} and ${CURRENT_PATCH}.` },
    ];
    if (entry && !entry.orderingCertified) {
      notices.push({ tone: "warn", text: `Version ordering after 26.16 is incomplete in the archive; ${ctx.patch} is placed provisionally.` });
    }
    notices.push(DEMO_NOTICE);
    return {
      ...base,
      source: "lc.patch_archive",
      capability: "supported",
      coverage: "unavailable",
      facets: [
        { key: "baseDamage", label: "Base damage", value: null, note: "not recorded at this patch" },
        { key: "cooldown", label: "Cooldown", value: null, note: "not recorded at this patch" },
      ],
      evidence: lines,
      notices,
    };
  }

  // Patch range: same honesty, scoped to the range.
  if (ctx.kind === "lc-patch-range") {
    const lines = archiveLinesSince(champion, slot, ctx.from).filter((l) => l.patch <= ctx.to || l.patch === ctx.to);
    return {
      ...base,
      source: "lc.patch_archive",
      capability: "supported",
      coverage: "unavailable",
      facets: [],
      evidence: lines,
      notices: [
        { tone: "blocked", text: `A patch range answers "what changed", never "what the value was". Showing recorded change lines for ${ctx.from}–${ctx.to}.` },
        DEMO_NOTICE,
      ],
    };
  }

  return { ...base, source: "lc.ability_catalog", capability: "unsupported", coverage: "not_applicable", facets: [], notices: [DEMO_NOTICE] };
}

function resolveProChampion(lens: Lens, base: Base, ctx: TemporalContext): LensView {
  if (lens.subject.kind !== "champion") throw new Error("unreachable");
  const { champion } = lens.subject;
  const key = ctx.kind === "current" ? "pro-season:2026" : contextKey(ctx);
  const rec = proChampionRecord(champion, key);
  const notices: Notice[] = [DEMO_NOTICE];
  if (ctx.kind === "current") {
    notices.push({ tone: "info", text: "\"Current\" for Pro Play resolves to the latest product season scope (2026 Season). It is not a calendar year." });
  }
  if (ctx.kind === "calendar-year") {
    notices.push({ tone: "warn", text: `Calendar ${ctx.year} is a date window over all competitions in coverage. It is a different population from the ${ctx.year} Season scope and is never silently equated with it.` });
  }
  if (ctx.kind === "date-window") {
    return { ...base, source: "pro.champion_records", capability: "unsupported", coverage: "not_applicable", facets: [], notices: [...notices, { tone: "blocked", text: "Arbitrary date windows are not an audited Pro Play scope in V0." }] };
  }
  if (!rec) {
    return {
      ...base,
      source: "pro.champion_records",
      capability: "supported",
      coverage: "unavailable",
      facets: [],
      notices: [...notices, { tone: "blocked", text: `No ${CHAMPIONS[champion].name} record is covered under ${contextLabel(ctx)}. Not covered is not the same as 0 games.` }],
    };
  }
  const facets: Facet[] = [
    { key: "games", label: "Games", value: rec.games, population: rec.population },
    { key: "winRate", label: "Win rate", value: pct(rec.wins / Math.max(rec.games, 1)), unit: "%", denominator: { label: "games", n: rec.games }, population: rec.population },
    { key: "presence", label: "Presence", value: pct(rec.presence), unit: "% pick + ban", population: rec.population },
    { key: "goldDiff15", label: "Gold diff @15", value: rec.goldDiff15, unit: "gold", population: rec.population, note: rec.goldDiff15 === null ? "metric not covered for this population" : undefined },
  ];
  notices.push({ tone: "info", text: `Population: ${rec.population}.` });
  return {
    ...base,
    source: "pro.champion_records",
    capability: "supported",
    coverage: rec.goldDiff15 === null ? "partial" : "full",
    facets,
    notices,
  };
}

function resolvePlayerChampion(lens: Lens, base: Base, ctx: TemporalContext): LensView {
  if (lens.subject.kind !== "player-champion") throw new Error("unreachable");
  const { player, champion } = lens.subject;
  const key = ctx.kind === "current" ? "pro-season:2026" : contextKey(ctx);
  const rec = playerChampionRecord(player, champion, key);
  const notices: Notice[] = [DEMO_NOTICE, { tone: "info", text: "Independently sourced player-on-champion record. Not head-to-head." }];
  if (ctx.kind === "date-window") {
    return { ...base, source: "pro.player_champion_records", capability: "unsupported", coverage: "not_applicable", facets: [], notices: [...notices, { tone: "blocked", text: "Arbitrary date windows are not an audited Pro Play scope in V0." }] };
  }
  if (!rec) {
    return {
      ...base,
      source: "pro.player_champion_records",
      capability: "supported",
      coverage: "unavailable",
      facets: [],
      notices: [...notices, { tone: "blocked", text: `${PLAYERS[player].name} on ${CHAMPIONS[champion].name} is not covered under ${contextLabel(ctx)}.` }],
    };
  }
  if (rec.games === 0) {
    return {
      ...base,
      source: "pro.player_champion_records",
      capability: "supported",
      coverage: "empty",
      facets: [{ key: "games", label: "Games", value: 0, population: rec.population }],
      notices: [...notices, { tone: "warn", text: `0 recorded games: covered, and empty. This is a real zero, not missing coverage.` }],
    };
  }
  return {
    ...base,
    source: "pro.player_champion_records",
    capability: "supported",
    coverage: "full",
    facets: [
      { key: "games", label: "Games", value: rec.games, population: rec.population },
      { key: "winRate", label: "Win rate", value: pct(rec.wins / rec.games), unit: "%", denominator: { label: "games", n: rec.games }, population: rec.population },
      { key: "kda", label: "KDA", value: rec.kda, population: rec.population },
    ],
    notices: [...notices, { tone: "info", text: `Population: ${rec.population}.` }],
  };
}
