/**
 * JOURNEY-UI2 — THE JOURNEY COMBAT QUESTION: the server's premise, laid out.
 *
 * A Journey Combat child (`ability_damage_under_state`) asks for an ability's
 * damage after the target's armor. Everything the player needs is SERVED:
 *
 *   * the attacker, ability, slot and rank     — `prompt_semantics`
 *   * the state the numbers are read at        — `prompt_semantics.scenario`
 *     (attacker level/items/AD/bonus AD/lethality/armor pen, target
 *     level/items/armor), as structured pairs — never parsed from prose;
 *   * the ability's formula — STATED by the Journey block
 *     (`premise.ability_damage`: flat damage by rank + ratios), or RECALLED:
 *     its numbers withheld, with the child that stated them named;
 *   * a rounding instruction — only when the server sends one.
 *
 * This component performs ZERO Combat arithmetic: it never multiplies a
 * ratio, subtracts armor or rounds a number. The one conversion on screen is
 * presentational — a served ratio coefficient written as a percentage, the
 * way the game writes it. A premise key it does not recognise is still shown
 * (humanised), so nothing the server stated can be dropped.
 *
 * The answer itself goes through the Ranked prose surface (`ProseChallenge`,
 * its own media band off: the Journey board owns the media region), and the
 * reveal is the backend's own text — J2 serves no structured derivation (raw
 * damage → effective armor → mitigation → final); that is a J3 field.
 */
import type { ReactNode } from "react";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import type { JourneyChildContext } from "@/lib/journey/adapter";
import { readScenario } from "@/features/mastery/contracts/promptSemantics";

type Pair = readonly [string, string | number];

const ATTACKER_KEYS = ["attacker_level", "attacker_items", "attack_damage", "bonus_attack_damage",
  "lethality", "armor_penetration_percent"] as const;
const TARGET_KEYS = ["target", "target_level", "target_items", "target_armor"] as const;

const LABEL: Record<string, string> = {
  attacker_level: "Level",
  attacker_items: "Items",
  attack_damage: "AD",
  bonus_attack_damage: "Bonus AD",
  lethality: "Lethality",
  armor_penetration_percent: "Armor pen",
  target_level: "Level",
  target_items: "Items",
  target_armor: "Armor",
};

/**
 * Premise facts the Journey BOARD also shows (the node's levels and items).
 * From `lg` the board sits right above in a height-locked card, so these are
 * not drawn twice there; on a phone — where the page scrolls and the compact
 * board shows less — the premise carries all of them.
 */
const ON_BOARD = new Set(["attacker_level", "attacker_items", "target_level", "target_items"]);

const humanize = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const shown = (key: string, v: string | number) =>
  key === "armor_penetration_percent" ? `${v}%` : (v === "none" ? "None" : String(v));

/** A served ratio coefficient, written as the game writes it (1 → 100%). */
const percent = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;

export interface CombatPremise {
  champion: string;
  ability: string;
  slot: string;
  rank: number | null;
  metric: string;
  pairs: Pair[];
}

/** Read the served Combat premise; null when this is not one. */
export function combatPremiseOf(challenge: MasterySliceChallengeView): CombatPremise | null {
  const p = challenge.promptSemantics as Record<string, unknown> | null | undefined;
  if (!p || p.template !== "ability_damage_under_state") return null;
  const ctx = (p.context ?? {}) as Record<string, unknown>;
  let pairs: Pair[] = [];
  try {
    pairs = [...readScenario(p.scenario)];
  } catch {
    return null;
  }
  return {
    champion: typeof p.champion_display === "string" ? p.champion_display : "",
    ability: typeof p.ability_name === "string" ? p.ability_name : "",
    slot: typeof p.subject_ref === "string" ? p.subject_ref : "",
    rank: typeof ctx.ability_rank === "number" ? ctx.ability_rank : null,
    metric: typeof p.metric === "string" ? p.metric : "",
    pairs,
  };
}

/** The question sentence, from the structured premise (no prose parsed). */
export function combatQuestionSentence(p: CombatPremise): string {
  const target = p.pairs.find(([k]) => k === "target")?.[1];
  const ability = `${p.champion}'s ${p.ability || p.slot}${p.slot ? ` (${p.slot}${p.rank !== null ? `, rank ${p.rank}` : ""})` : ""}`;
  return `How much ${p.metric === "ability_physical_damage_after_armor" ? "physical damage, after armor," : "damage"} does ${ability} deal${target ? ` to ${target}` : ""}?`;
}

/** One served premise fact as a compact chip — label and value, never computed. */
function Fact({ label, value, testId, emphasis = false, onBoard = false }: {
  label: string; value: ReactNode; testId: string; emphasis?: boolean; onBoard?: boolean;
}) {
  return (
    <span data-testid={testId} data-on-board={onBoard ? "true" : undefined}
      className={`${onBoard ? "lg:hidden " : ""}inline-flex items-baseline gap-1 whitespace-nowrap rounded border px-1.5 py-0 text-[10.5px] leading-4 ${
        emphasis ? "border-[#d4b35a]/60 bg-[#d4b35a]/10" : "border-white/10 bg-black/40"}`}>
      <span className="uppercase tracking-[0.1em] text-white/60">{label}</span>
      <span className={`font-black tabular-nums ${emphasis ? "text-[#f3dca0]" : "text-white"}`}>{value}</span>
    </span>
  );
}

export function JourneyCombatPremise({ premise, journey, precisionInstruction = null }: {
  premise: CombatPremise;
  journey: JourneyChildContext | null;
  precisionInstruction?: string | null;
}) {
  const pairs = new Map(premise.pairs.map(([k, v]) => [k, v] as const));
  const target = pairs.get("target");
  const known = new Set<string>([...ATTACKER_KEYS, ...TARGET_KEYS]);
  // A premise key this build does not name is still shown — nothing dropped.
  const others = premise.pairs.filter(([k]) => !known.has(k));
  const formula = journey?.formula && journey.formula.slot === premise.slot ? journey.formula : null;
  const recalled = journey?.recalled.find((w) => w.what === "ability_damage" && w.slot === premise.slot) ?? null;
  return (
    <section data-testid="journey-combat-premise" aria-label="Combat premise"
      className="space-y-[3px] rounded-lg border border-[#d4b35a]/35 bg-[#07111f] px-2.5 py-1.5 text-white">
      <div data-testid="journey-combat-attacker" className="flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#f3dca0]">{premise.champion}</span>
        <Fact testId="journey-combat-ability" label={premise.slot || "Ability"} emphasis
          value={`${premise.ability || premise.slot}${premise.rank !== null ? ` · rank ${premise.rank}` : ""}`} />
        {ATTACKER_KEYS.filter((k) => pairs.has(k)).map((k) => (
          <Fact key={k} testId={`journey-combat-${k}`} label={LABEL[k]} value={shown(k, pairs.get(k)!)}
            onBoard={ON_BOARD.has(k)} />
        ))}
      </div>
      <div data-testid="journey-combat-target" className="flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#cfe6f5]">
          {target !== undefined ? `→ ${target}` : "Target"}
        </span>
        {TARGET_KEYS.filter((k) => k !== "target" && pairs.has(k)).map((k) => (
          <Fact key={k} testId={`journey-combat-${k}`} label={LABEL[k]} value={shown(k, pairs.get(k)!)}
            emphasis={k === "target_armor"} onBoard={ON_BOARD.has(k)} />
        ))}
        {others.map(([k, v]) => <Fact key={k} testId={`journey-combat-${k}`} label={humanize(k)} value={String(v)} />)}
      </div>
      <div data-testid="journey-combat-formula" className="text-[11px] leading-4">
        {formula ? (
          <span data-formula="stated">
            <span className="font-bold text-[#f3dca0]">{formula.abilityName} ({formula.slot})</span>
            {" "}{formula.damageType}:{" "}
            {formula.flatByRank.map((n, i) => (
              <span key={i} data-rank-value={i + 1}
                className={premise.rank === i + 1 ? "font-black text-white underline decoration-[#e8c97a]" : "text-white/65"}>
                {n}{i < formula.flatByRank.length - 1 ? " / " : ""}
              </span>
            ))}
            {formula.ratios.map((r) => (
              <span key={r.stat} className="text-white/90"> + {percent(r.ratio)} {r.label}</span>
            ))}
          </span>
        ) : recalled ? (
          <span data-formula="recalled" className="text-white/80">
            <span className="font-bold text-[#f3dca0]">Formula: recall it</span>
            {" "}— {premise.ability || premise.slot}'s damage numbers were stated in step {recalled.establishedInChild + 1}.
          </span>
        ) : (
          <span data-formula="absent" className="text-white/55">The formula is not part of this question's premise.</span>
        )}
      </div>
      {precisionInstruction && (
        <p data-testid="journey-combat-rounding" className="text-[11px] text-white/70">{precisionInstruction}</p>
      )}
    </section>
  );
}
