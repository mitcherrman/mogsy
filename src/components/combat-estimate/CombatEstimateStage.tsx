/**
 * CE1 — THE COMBAT ESTIMATE STAGE: the scenario board over the balance beam.
 *
 * The board states the PUBLIC premise — attacker, level, items, the attack
 * damage the formula reads and the penetration the items grant; the ability,
 * its rank and its modelled component; the target, its level, items and
 * armor — exactly the pairs the Journey's Combat premise states, read from the
 * frozen capture. Nothing the reasoning produces (raw damage, effective armor,
 * the multiplier, the answer) is on it.
 *
 * Under the board sits the content-neutral `EstimateBeam`. The stage hands it
 * two slots for its reserved ledger box: a PRELUDE (what exactly is being
 * estimated, and under which assumptions) and, only once a reveal exists, the
 * authority's own working — rendered by the Journey's `JourneyCombatWorking`
 * for an after-armor round (the `combat_working.v1` block, verbatim) and by a
 * matching raw ladder for a before-armor round.
 *
 * This file performs ZERO Combat arithmetic.
 */
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { EstimateBeam, type EstimateBeamProps } from "@/components/interaction-grammar/EstimateBeam";
import { SubjectArt } from "@/components/interaction-grammar/shared";
import { JourneyCombatWorking } from "@/components/journey/JourneyCombatWorking";
import { percent } from "@/components/journey/JourneyCombatQuestion";
import { ratioStatLabel } from "@/lib/journey/statWording";
import type { JourneyWorking, RawDamageWorking } from "@/lib/journey/combatWorking";
import type { CombatEstimateScenario } from "@/lib/combat-estimate/contract";
import { getAbilityIconUrl, getChampionSquareIconUrl, type AbilitySlot } from "@/lib/combat-lab/abilityIcons";
import "./combatEstimate.css";

/** A premise number as the capture states it (≤ 4 places), never re-rounded into a different fact. */
const stat = (n: number) => String(Number(n.toFixed(4)));

function Chip({ label, value, tone = "plain", testId }: { label: string; value: string; tone?: "plain" | "ad" | "armor" | "pen"; testId?: string }) {
  return (
    <span className="ce-chip" data-tone={tone} data-testid={testId}>
      <span className="ce-chip-label">{label}</span>
      <span className="ce-chip-value">{value}</span>
    </span>
  );
}

function Side({ s, role }: { s: CombatEstimateScenario; role: "attacker" | "target" }) {
  const side = role === "attacker" ? s.attacker : s.target;
  const chips = role === "attacker"
    ? [
      <Chip key="ad" label="AD" value={stat(s.attacker.attackDamage)} tone="ad" testId="ce-stat-ad" />,
      <Chip key="bonus" label="Bonus" value={stat(s.attacker.bonusAttackDamage)} tone="ad" testId="ce-stat-bonus-ad" />,
      ...(s.penetration.lethality ? [<Chip key="leth" label="Leth" value={stat(s.penetration.lethality)} tone="pen" testId="ce-stat-lethality" />] : []),
      ...(s.penetration.armorPenPercent ? [<Chip key="penp" label="Pen" value={`${stat(s.penetration.armorPenPercent)}%`} tone="pen" testId="ce-stat-armor-pen-percent" />] : []),
      ...(s.penetration.armorPenFlat ? [<Chip key="penf" label="Flat pen" value={stat(s.penetration.armorPenFlat)} tone="pen" testId="ce-stat-armor-pen-flat" />] : []),
    ]
    : [<Chip key="armor" label="Armor" value={stat(s.target.armor)} tone="armor" testId="ce-stat-armor" />];
  const items = side.items.length ? side.items.map((i) => i.name).join(", ") : "No items";
  return (
    <section className="ce-side" data-role={role} data-testid={`ce-side-${role}`}
      aria-label={`${side.champion}, level ${side.level}, ${role}`}>
      <span className="ce-portrait">
        <SubjectArt media={{ src: getChampionSquareIconUrl(side.champion), alt: "" }} monogram={side.champion} className="h-full w-full" />
      </span>
      <div className="ce-side-text">
        <p className="ce-side-name">
          <b data-testid={`ce-name-${role}`}>{side.champion}</b>
          <span className="ce-level">Lv {side.level}</span>
          <span className="ce-role" data-role={role}>{role === "attacker" ? "Attacker" : "Target"}</span>
        </p>
        <p className="ce-side-chips">{chips}</p>
        <p className="ce-side-items" data-testid={`ce-items-${role}`}>{items}</p>
      </div>
    </section>
  );
}

export function ScenarioBoard({ s }: { s: CombatEstimateScenario }) {
  const icon = getAbilityIconUrl(s.attacker.champion, s.ability.slot as AbilitySlot);
  return (
    <div data-testid="ce-board" className="ce-board" data-metric={s.metric}>
      <Side s={s} role="attacker" />
      <div className="ce-seam" data-testid="ce-seam">
        <span className="ce-ability">
          <SubjectArt media={{ src: icon, alt: "" }} monogram={s.ability.slot} className="h-full w-full" />
          <span aria-hidden className="ce-ability-slot">{s.ability.slot}</span>
        </span>
        <p className="ce-ability-text">
          <b data-testid="ce-ability-name">{s.ability.name}</b>
          <span data-testid="ce-ability-rank">Rank {s.ability.rank}<span className="ce-rank-max">/{s.ability.maxRank}</span></span>
        </p>
        <ArrowRight aria-hidden className="ce-arrow" />
      </div>
      <Side s={s} role="target" />
    </div>
  );
}

/** What the ledger shows before the reveal: the exact question, and its assumptions. */
export function Prelude({ s }: { s: CombatEstimateScenario }) {
  return (
    <div className="ce-prelude" data-testid="ce-prelude">
      <p className="ce-prelude-def">
        <span className="ce-prelude-tag" data-metric={s.metric}>{s.metric === "raw" ? "Before armor" : "After armor"}</span>
        {s.definition}
      </p>
      <p className="ce-prelude-assume">{s.assumptions.map((a) => a.replace(/\.$/, "")).join(" · ")}</p>
    </div>
  );
}

/** The raw-damage ladder, in the Journey working's own idiom (served values only). */
function RawLadder({ w }: { w: RawDamageWorking }) {
  const terms = w.terms.slice(1);
  return (
    <ol data-testid="ce-raw-working" aria-label="Working" className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11.5px] leading-4">
      <li data-step="formula" className="min-w-0 break-words">
        <span className="opacity-80">Formula ({w.ability.slot} rank {w.ability.rank}):</span>{" "}
        <span className="font-semibold tabular-nums">
          {w.formula.flat}{w.formula.ratios.map((r) => ` + ${percent(r.ratio)} ${ratioStatLabel(r.stat, r.label)} (${r.value})`).join("")}
        </span>
      </li>
      <li data-step="terms" className="min-w-0 break-words">
        <span aria-hidden className="opacity-60">→</span> <span className="font-semibold tabular-nums">{[w.formula.flat, ...terms.map((t) => t.value)].join(" + ")}</span>
      </li>
      <li data-step="raw" className="min-w-0 break-words">
        <span aria-hidden className="opacity-60">→</span> <span className="opacity-80">Raw</span> <span className="font-semibold tabular-nums">{w.rawDamage}</span>
      </li>
      <li data-step="answer" className="min-w-0 break-words">
        <span aria-hidden className="opacity-60">→</span> <span className="font-semibold">Answer</span> <span className="font-black tabular-nums">{w.answer}</span>
      </li>
    </ol>
  );
}

/** What the ledger shows at the reveal: the authority's working, then where it came from. */
export function Breakdown({ working, sourceLine, note }: { working: JourneyWorking | null; sourceLine: string; note?: string | null }) {
  return (
    <div className="ce-breakdown" data-testid="ce-breakdown" data-working={working?.contract ?? "none"}>
      {working?.contract === "combat_working.v1" ? <JourneyCombatWorking working={working} />
        : working?.contract === "raw_damage_working.v1" ? <RawLadder w={working} />
        : <p className="ce-breakdown-none">No authority working for this round.</p>}
      <p className="ce-source" data-testid="ce-source">{note ? <>{note} </> : null}{sourceLine}</p>
    </div>
  );
}

export interface CombatEstimateStageProps extends Omit<EstimateBeamProps, "prelude" | "breakdown" | "content"> {
  content: EstimateBeamProps["content"];
  scenario: CombatEstimateScenario;
  /** The authority's working for the revealed round, or null. */
  working: JourneyWorking | null;
  sourceLine: string | null;
  /** The most height the stage may take, from the host that measured its room; the ledger yields first. */
  stageHeight?: number;
}

export function CombatEstimateStage({ scenario, working, sourceLine, stageHeight, maxHeight: _ignored, ...beam }: CombatEstimateStageProps) {
  void _ignored;
  const prelude: ReactNode = <Prelude s={scenario} />;
  const breakdown: ReactNode = beam.reveal
    ? <Breakdown working={working} sourceLine={sourceLine ?? ""} note={beam.reveal.note} /> : null;
  return (
    <div data-testid="ce-stage" className="ce-stage" style={stageHeight !== undefined ? { maxHeight: stageHeight } : undefined}>
      <ScenarioBoard s={scenario} />
      <EstimateBeam {...beam} prelude={prelude} breakdown={breakdown} />
    </div>
  );
}
