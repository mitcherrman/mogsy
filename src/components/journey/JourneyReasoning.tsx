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
 *
 * JP5 — ONE CHAIN, THREE MOMENTS (`phase`). The same list of the same nodes:
 *
 *   live        the prerequisites and the asked `?`, under the question;
 *   expanded    the reveal's whole derivation, ALL AT ONCE — every node is in
 *               the DOM from the first frame and enters together (one
 *               animation, no per-node delay);
 *   compressed  the `detail` nodes folded away; the `transform` node is a
 *               button that reopens them (and closes them again).
 *
 * A chain with no `detail` has no phases and is drawn exactly as JP4 drew it.
 * The MAGNITUDE BAR under an expanded chain is sized by a served coefficient
 * (`--jm-ratio`); nothing here computes one.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, FoldHorizontal, Info, UnfoldHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  unfoldCompressAtMs, type ReasonIcon, type ReasonMagnitude, type ReasonNode, type Reasoning,
} from "@/lib/journey/reasoning";
import { mnemonicForStat } from "@/lib/journey/statIcons";
import { JOURNEY_STAT_META } from "@/lib/journey/stats";
import { AbilityIcon, ChampionIcon, StatMnemonicIcon } from "./JourneyIcons";

const OP_WORDS: Record<string, string> = { "+": "plus", "−": "minus", "=": "equals", "→": "gives" };

/** Which moment of the chain is drawn; null = a chain that does not fold. */
export type ChainPhase = "live" | "expanded" | "compressed";

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
  if (n.asked) return `${n.label}: the value this step asks for`;
  const expr = n.fraction ? `100 divided by ${n.fraction.bottom}` : n.expression ? `${n.expression}` : "";
  return `${n.label}: ${[expr, n.value].filter(Boolean).join(n.fraction ? ", " : " ")}`;
}

export function JourneyReasoningNode({ node, testId, open, onToggle }: {
  node: ReasonNode;
  testId: string;
  /** JP5 — the `transform` node only: are the folded steps showing? */
  open?: boolean;
  /** JP5 — the `transform` node only: fold / reopen the derivation. */
  onToggle?: () => void;
}) {
  const className = ["journey-node", node.final && "journey-node--final", node.fraction && "journey-node--formula",
    node.fraction && !node.value && "journey-node--fraction", node.asked && "journey-node--asked",
    onToggle && "journey-node--transform"].filter(Boolean).join(" ");
  const body = (
    <>
      {onToggle
        ? (
          <span aria-hidden className="journey-ico journey-ico--node journey-ico--none journey-node__fold">
            {open ? <FoldHorizontal strokeWidth={2.5} /> : <UnfoldHorizontal strokeWidth={2.5} />}
          </span>
        )
        : <NodeIcon icon={node.icon} />}
      <span aria-hidden className="journey-node__expr">
        {node.fraction ? (
          <span className="journey-frac" data-testid={`${testId}-fraction`}>
            <span className="journey-frac__top">{node.fraction.top}</span>
            <span className="journey-frac__bar" />
            <span className="journey-frac__bottom">{node.fraction.bottom}</span>
          </span>
        ) : node.expression}
      </span>
      {node.value !== "" && (
        <span aria-hidden className="journey-node__value" data-testid={`${testId}-value`}>{node.value}</span>
      )}
      <span aria-hidden className="journey-node__label">{node.label}</span>
    </>
  );
  if (onToggle) {
    return (
      <button type="button" className={className} data-testid={testId} data-node={node.key}
        aria-expanded={open} onClick={onToggle}
        aria-label={`${spokenNode(node)}. ${open ? "Hide" : "Show"} the full equation`}>
        {body}
      </button>
    );
  }
  return (
    <span className={className} data-testid={testId} data-node={node.key} role="group" aria-label={spokenNode(node)}>
      {body}
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

export function JourneyReasoningChain({ reasoning, testId, phase = null, onToggle }: {
  reasoning: Reasoning;
  testId: string;
  phase?: ChainPhase | null;
  /** JP5 — fold / reopen; passed only for a chain that folds. */
  onToggle?: () => void;
}) {
  const nodes = reasoning.nodes;
  const folded = phase === "compressed";
  // A long derivation takes two rows where one cannot hold it (a phone): the
  // break sits at its middle, and only the stylesheet decides whether it breaks.
  const breakBefore = phase === "expanded" && nodes.length > 4 ? Math.ceil(nodes.length / 2) : -1;
  const magnitude = phase === "expanded" || phase === "compressed" ? reasoning.magnitude ?? null : null;
  return (
    <div data-testid={testId} data-reasoning={reasoning.kind} className="journey-reasoning" role="group"
      aria-label={phase === "live" ? "What this step builds on" : "How the answer follows"}>
      <ol className="journey-reasoning__chain" data-nodes={nodes.length}
        data-density={nodes.length > 4 ? "dense" : "regular"}
        {...(phase ? { "data-phase": phase } : {})}>
        {nodes.flatMap((n, i) => {
          const hidden = folded && n.detail === true;
          return [
            i === breakBefore && <li key="row-break" aria-hidden className="journey-reasoning__break" />,
            <li key={n.key} className="journey-reasoning__step"
              {...(n.detail ? { "data-detail": "true" } : {})}
              {...(n.given ? { "data-given": "true" } : {})}
              // A folded step is out of the reading and tab order, not just out of sight.
              {...(hidden ? { "aria-hidden": true, inert: "" } : {})}>
              {n.op && (
                <span className="journey-op" data-op={n.op} data-testid={`${testId}-op-${n.key}`}>
                  {n.op === "→"
                    ? <ArrowRight aria-hidden strokeWidth={3.25} />
                    : <span aria-hidden>{n.op}</span>}
                  <span className="sr-only">{OP_WORDS[n.op]}</span>
                </span>
              )}
              <JourneyReasoningNode node={n} testId={`${testId}-${n.key}`}
                {...(n.transform && onToggle ? { open: !folded, onToggle } : {})} />
            </li>,
          ];
        })}
      </ol>
      {magnitude && <JourneyMagnitude magnitude={magnitude} testId={`${testId}-magnitude`} folded={folded} />}
    </div>
  );
}

/**
 * JP5 — THE MAGNITUDE BAR: the whole (raw damage) contracting to the share
 * that remains. Its ratio is the SERVED coefficient, handed to the stylesheet
 * as `--jm-ratio`; with motion it starts full and contracts, without it the
 * bar is simply drawn at that ratio.
 */
export function JourneyMagnitude({ magnitude, testId, folded = false }: {
  magnitude: ReasonMagnitude;
  testId: string;
  folded?: boolean;
}) {
  return (
    <div className="journey-magnitude" data-testid={testId} data-ratio={magnitude.ratio}
      role="img" {...(folded ? { "aria-hidden": true } : {})}
      aria-label={`${magnitude.from} ${magnitude.fromLabel}, ${magnitude.percent} taken: ${magnitude.to} ${magnitude.toLabel}`}
      style={{ "--jm-ratio": String(magnitude.ratio) } as CSSProperties}>
      <span aria-hidden className="journey-magnitude__end">
        <b>{magnitude.from}</b> {magnitude.fromLabel}
      </span>
      <span aria-hidden className="journey-magnitude__track">
        <span className="journey-magnitude__fill" />
      </span>
      <span aria-hidden className="journey-magnitude__end journey-magnitude__end--to">
        <b>{magnitude.to}</b> {magnitude.toLabel}
      </span>
    </div>
  );
}

/**
 * JP5 — the unfold's phase, inside the server's reveal window.
 *
 * `windowMs` is the server's frozen reveal window and `endsAt` the client-clock
 * instant its reveal ends (null when the server names none). The chain opens
 * EXPANDED and, when the window is long enough to be divided
 * (`unfoldCompressAtMs`), compresses once at that point of the SERVER's window
 * — so a reload mid-reveal lands where the reveal actually is. No timer here
 * holds a reveal open: when the child leaves, this unmounts with it.
 *
 * A tap takes over: from then on the chain is only what the learner set it to
 * (reopened stays open, closed stays closed) until the child leaves.
 */
export function useEquationUnfold(enabled: boolean, windowMs: number | null, endsAt: number | null) {
  const compressAt = enabled ? unfoldCompressAtMs(windowMs) : null;
  const elapsed = useRef<number | null>(null);
  if (elapsed.current === null) {
    const total = typeof windowMs === "number" && windowMs > 0 ? windowMs : 0;
    elapsed.current = endsAt === null ? 0 : Math.min(Math.max(total - (endsAt - Date.now()), 0), total);
  }
  const [phase, setPhase] = useState<"expanded" | "compressed">(
    () => (compressAt !== null && elapsed.current! >= compressAt ? "compressed" : "expanded"));
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (compressAt === null || manual) return;
    const delay = compressAt - elapsed.current!;
    if (delay <= 0) return;
    const id = window.setTimeout(() => setPhase("compressed"), delay);
    return () => window.clearTimeout(id);
  }, [compressAt, manual]);
  const toggle = () => {
    setManual(true);
    setPhase((p) => (p === "compressed" ? "expanded" : "compressed"));
  };
  return { phase, manual, toggle };
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
