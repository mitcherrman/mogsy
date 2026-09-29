/**
 * JP4 — THE REASONING CHAIN, drawn (`lib/journey/reasoning.ts` builds it).
 *
 * ONE NODE GRAMMAR. Every node is the same fixed box, whatever its content:
 *
 *   ┌──────────────┐
 *   │ [icon]       │   one League-native icon (ability, champion, stat mnemonic)
 *   │ 70% of 21 =  │   an optional short expression — or a fraction
 *   │      15      │   the value, League-style
 *   │ BONUS AD DMG │   one short label
 *   └──────────────┘
 *
 * so a chain never becomes differently shaped beige boxes. Operators (+ − = →)
 * are drawn large and dark between nodes — the learner reads an equation at a
 * glance. The last node is the answer.
 *
 * The EXACT working (the decimals behind a whole number) is one tap away on
 * the info control, never in the chain itself.
 */
import { ArrowRight, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReasonIcon, ReasonNode, Reasoning } from "@/lib/journey/reasoning";
import { mnemonicForStat } from "@/lib/journey/statIcons";
import { JOURNEY_STAT_META } from "@/lib/journey/stats";
import { AbilityIcon, ChampionIcon, StatMnemonicIcon } from "./JourneyIcons";

const OP_WORDS: Record<string, string> = { "+": "plus", "−": "minus", "=": "equals", "→": "gives" };

function NodeIcon({ icon, small = false }: { icon: ReasonIcon | null; small?: boolean }) {
  const size = small ? "inline" : "node";
  if (!icon) return small ? null : <span aria-hidden className="journey-ico journey-ico--node journey-ico--none" />;
  if (icon.kind === "ability") return <AbilityIcon champion={icon.champion} slot={icon.slot} size={size} />;
  if (icon.kind === "champion") {
    return <ChampionIcon championId={icon.championId} championName={icon.champion} size={size} />;
  }
  const m = mnemonicForStat(icon.stat);
  return m
    ? <StatMnemonicIcon mnemonic={m} size={size} />
    : <span aria-hidden className="journey-ico journey-ico--node journey-ico--none">{JOURNEY_STAT_META[icon.stat].short}</span>;
}

function spokenNode(n: ReasonNode) {
  const expr = n.fraction ? `100 divided by ${n.fraction.bottom}, ` : n.expression ? `${n.expression} ` : "";
  return `${n.label}: ${expr}${n.value}`;
}

export function JourneyReasoningNode({ node, testId }: { node: ReasonNode; testId: string }) {
  return (
    <span className={`journey-node${node.final ? " journey-node--final" : ""}${node.fraction ? " journey-node--formula" : ""}`}
      data-testid={testId} data-node={node.key} role="group" aria-label={spokenNode(node)}>
      <NodeIcon icon={node.icon} />
      <span aria-hidden className="journey-node__expr">
        {node.fraction ? (
          <span className="journey-frac" data-testid={`${testId}-fraction`}>
            <span className="journey-frac__top">{node.fraction.top}</span>
            <span className="journey-frac__bar" />
            <span className="journey-frac__bottom">{node.fraction.bottom}</span>
          </span>
        ) : node.expression}
      </span>
      <span aria-hidden className="journey-node__value" data-testid={`${testId}-value`}>{node.value}</span>
      <span aria-hidden className="journey-node__label">{node.label}</span>
    </span>
  );
}

/**
 * The chain's subject line ("[E] Shadow Slash — Rank 1", and the served formula
 * when the chain follows from one) and its exact-working control. Drawn on the
 * verdict's own line, so the chain keeps the reveal box's height.
 */
export function JourneyReasoningHead({ reasoning, testId }: { reasoning: Reasoning; testId: string }) {
  if (!reasoning.subject && !reasoning.exact) return null;
  return (
    <span className="journey-reasoning__head">
      {reasoning.subject && (
        <span className="journey-reasoning__subject" data-testid={`${testId}-subject`}
          title={reasoning.caption ? `${reasoning.subject.text}: ${reasoning.caption}` : undefined}>
          {reasoning.subject.icon && <NodeIcon icon={reasoning.subject.icon} small />}
          <span className="journey-reasoning__subject-text">{reasoning.subject.text}</span>
          {reasoning.caption && (
            <span className="journey-reasoning__caption" data-testid={`${testId}-formula`}>{reasoning.caption}</span>
          )}
        </span>
      )}
      {reasoning.exact && <ExactWorking lines={reasoning.exact} testId={`${testId}-exact`} />}
    </span>
  );
}

export function JourneyReasoningChain({ reasoning, testId }: { reasoning: Reasoning; testId: string }) {
  return (
    <div data-testid={testId} data-reasoning={reasoning.kind} className="journey-reasoning" role="group"
      aria-label="How the answer follows">
      <ol className="journey-reasoning__chain" data-nodes={reasoning.nodes.length}
        data-density={reasoning.nodes.length > 4 ? "dense" : "regular"}>
        {reasoning.nodes.map((n) => (
          <li key={n.key} className="journey-reasoning__step">
            {n.op && (
              <span className="journey-op" data-op={n.op} data-testid={`${testId}-op-${n.key}`}>
                {n.op === "→"
                  ? <ArrowRight aria-hidden strokeWidth={3.25} />
                  : <span aria-hidden>{n.op}</span>}
                <span className="sr-only">{OP_WORDS[n.op]}</span>
              </span>
            )}
            <JourneyReasoningNode node={n} testId={`${testId}-${n.key}`} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The exact working behind the whole numbers: an info control, a small card. */
function ExactWorking({ lines, testId }: { lines: string[]; testId: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testId} className="journey-exact-btn" aria-label="Exact working">
          <Info aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="journey-exact-btn__text">Exact</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={4} collisionPadding={8} data-testid={`${testId}-pop`}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="journey-know-pop w-auto max-w-[min(18rem,calc(100vw-16px))] p-0">
        <div className="journey-know-pop__title">Exact working</div>
        <ul className="journey-exact__lines">
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
