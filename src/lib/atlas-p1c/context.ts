/**
 * ATL-P1-C — temporal context helpers: keys, labels, validity per universe,
 * and the inheritance resolution a Lens uses to settle its effective context.
 */
import {
  LEAGUECRAFT_TEMPORAL_KINDS,
  PRO_PLAY_TEMPORAL_KINDS,
  slotForUniverse,
  type EffectiveContext,
  type GlobalContext,
  type Lens,
  type TemporalContext,
  type Universe,
} from "./types";
import { CURRENT_PATCH, PRO_SEASONS } from "./fixtures";

export function contextKey(ctx: TemporalContext): string {
  switch (ctx.kind) {
    case "current":
      return "current";
    case "lc-patch":
      return `lc-patch:${ctx.patch}`;
    case "lc-patch-range":
      return `lc-patch-range:${ctx.from}..${ctx.to}`;
    case "pro-season":
      return `pro-season:${ctx.season}`;
    case "calendar-year":
      return `calendar-year:${ctx.year}`;
    case "date-window":
      return `date-window:${ctx.from}..${ctx.to}`;
  }
}

export function contextLabel(ctx: TemporalContext): string {
  switch (ctx.kind) {
    case "current":
      return "Current";
    case "lc-patch":
      return `Patch ${ctx.patch}`;
    case "lc-patch-range":
      return `Patches ${ctx.from}–${ctx.to}`;
    case "pro-season":
      return PRO_SEASONS.find((s) => s.season === ctx.season)?.label ?? `${ctx.season} Season`;
    case "calendar-year":
      return `Calendar ${ctx.year}`;
    case "date-window":
      return `${ctx.from} → ${ctx.to}`;
  }
}

/** Short chip text, e.g. "26.16", "2026 S", "CY 2026". */
export function contextChip(ctx: TemporalContext): string {
  switch (ctx.kind) {
    case "current":
      return "Current";
    case "lc-patch":
      return ctx.patch;
    case "lc-patch-range":
      return `${ctx.from}–${ctx.to}`;
    case "pro-season":
      return `${ctx.season} S`;
    case "calendar-year":
      return `CY ${ctx.year}`;
    case "date-window":
      return "Window";
  }
}

export function contextKindLabel(ctx: TemporalContext): string {
  switch (ctx.kind) {
    case "current":
      return "current values";
    case "lc-patch":
      return "Leaguecraft patch";
    case "lc-patch-range":
      return "Leaguecraft patch range";
    case "pro-season":
      return "Pro season scope";
    case "calendar-year":
      return "calendar year";
    case "date-window":
      return "date window";
  }
}

export function sameContext(a: TemporalContext, b: TemporalContext): boolean {
  return contextKey(a) === contextKey(b);
}

export function contextValidFor(universe: Universe, ctx: TemporalContext): boolean {
  const allowed = universe === "leaguecraft" ? LEAGUECRAFT_TEMPORAL_KINDS : PRO_PLAY_TEMPORAL_KINDS;
  return allowed.includes(ctx.kind);
}

/** "Current" for Leaguecraft means the current patch; the label says which. */
export function leaguecraftCurrentLabel(): string {
  return `Current (${CURRENT_PATCH})`;
}

/**
 * Settle a Lens's effective context: held beats override beats global. The
 * explanation is the sentence the Lens prints under its context chip.
 */
export function resolveEffectiveContext(lens: Lens, global: GlobalContext): EffectiveContext {
  const slot = slotForUniverse(lens.subject.universe);
  const inherited = global[slot];
  const slotName = slot === "leaguecraft" ? "Leaguecraft" : "Pro Play";

  if (lens.held) {
    const diverges = !sameContext(lens.held, inherited);
    return {
      context: lens.held,
      origin: "held",
      slot,
      diverges,
      explanation: diverges
        ? `Held at ${contextLabel(lens.held)}. The global ${slotName} context is ${contextLabel(inherited)}; this Lens ignores it until released.`
        : `Held at ${contextLabel(lens.held)}, which still matches the global ${slotName} context. Release to follow future global changes.`,
    };
  }
  if (lens.override) {
    const diverges = !sameContext(lens.override, inherited);
    return {
      context: lens.override,
      origin: "override",
      slot,
      diverges,
      explanation: diverges
        ? `Override: ${contextLabel(lens.override)} instead of the global ${slotName} context (${contextLabel(inherited)}).`
        : `Override set to ${contextLabel(lens.override)}, which currently equals the global ${slotName} context. Clear it to inherit again.`,
    };
  }
  return {
    context: inherited,
    origin: "global",
    slot,
    diverges: false,
    explanation: `Inherits the global ${slotName} context: ${contextLabel(inherited)}.`,
  };
}
