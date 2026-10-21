/**
 * UX-6 — pure read helpers for the E3A management block (no React). They only
 * select and label what the server served: every value is passed through
 * verbatim, linked to the server's own `management.combat_inputs` explanation.
 */
import type { E1Component, E1Contest, E1Role, E1StageTally, ManagementView } from "@/lib/dynasty/e1/contracts";
import { champTitle, isManagementComponent, parseManagementSource, playerRow, sourceTitle, type E3aCombatInputs, type E3aCombatPlayer, type E3aManagement } from "@/lib/dynasty/e1/e3acontracts";

const short = (n: string) => n.replace(/^SYN\s+/, "");

export interface InfluenceRow { key: string; side: "you" | "opponent"; role: E1Role | null; title: string; value: number; fact: string }

function factFor(ci: E3aCombatInputs | null, m: E3aManagement, side: "you" | "opponent", c: E1Component, contest: E1Contest): string {
  const team = ci?.[side];
  if (c.source === "team:cohesion") {
    const co = team?.cohesion;
    return co ? `cohesion ${co.base.toFixed(2)}${co.substitutes ? ` − ${co.substitute_cost.toFixed(2)} (${co.substitutes} reserve)` : ""} = ${co.effective.toFixed(2)}` : c.label;
  }
  const p: E3aCombatPlayer | undefined = team?.players.find((x) => x.role === contest.role);
  if (c.source === "proficiency") {
    const practiced = side === "you" && p ? playerRow(m, p.player_id)?.proficiency?.find((x) => x.champion === p.champion)?.practiced_by : null;
    return p ? `${short(p.name)} on ${short(champTitle(p.champion))}: proficiency ${p.proficiency.toFixed(2)}${practiced ? `, practiced (${practiced})` : ""}` : c.label;
  }
  const info = parseManagementSource(c.source);
  if (info.kind === "vod_review" || info.kind === "quick_review") {
    const mod = team?.team_modifiers.find((x) => `modifier:${x.source}` === c.source);
    return mod?.origin ? `from ${mod.origin}` : c.label;
  }
  const who = info.player_id ? (team?.players.find((x) => x.player_id === info.player_id) ?? p) : p;
  if (info.kind === "fatigue") return who ? `${short(who.name)} at fatigue ${who.fatigue}` : c.label;
  if (info.kind.startsWith("trait.")) {
    const tr = who?.traits.find((x) => `trait.${x.trait}` === info.kind);
    return who ? `${short(who.name)}${tr ? `, ${tr.games_remaining} game(s) left` : ""}` : c.label;
  }
  return who ? short(who.name) : c.label;
}

/** Every management-driven contest component of a published stage, verbatim, linked to the server's explanation. */
export function influenceRows(tally: E1StageTally, mv: ManagementView): InfluenceRow[] {
  const m = mv.block, ci = m.combat_inputs;
  const out: InfluenceRow[] = [];
  for (const contest of tally.contests) {
    for (const side of ["you", "opponent"] as const) {
      const comps = (side === "you" ? contest.you_components : contest.opponent_components) ?? [];
      for (const c of comps) {
        const mgmt = isManagementComponent(c);
        const linked = mgmt || ((c.source === "team:cohesion" || c.source === "proficiency") && c.value !== 0);
        if (!linked) continue;
        const title = mgmt ? sourceTitle(c.source) : c.source === "team:cohesion" ? "Cohesion" : "Champion proficiency";
        out.push({ key: `${tally.stage}|${contest.kind}|${contest.role}|${side}|${c.source}`, side, role: contest.role, title, value: c.value, fact: factFor(ci, m, side, c, contest) });
      }
    }
  }
  return out;
}

/** Explain-sheet split: the management components of one contest side (and the rest). */
export function splitComponents(components: E1Component[]): { management: E1Component[]; rest: E1Component[] } {
  return { management: components.filter(isManagementComponent), rest: components.filter((c) => !isManagementComponent(c)) };
}
export const componentTitle = (c: E1Component): string => (isManagementComponent(c) ? sourceTitle(c.source) : c.label);

/** Player names for a game's lineup strip / lock-in (from the server's combat inputs). */
export function starterNames(mv: ManagementView | null | undefined): Partial<Record<E1Role, string>> {
  const ps = mv?.block.combat_inputs?.you.players ?? [];
  return Object.fromEntries(ps.map((p) => [p.role, short(p.name)]));
}

