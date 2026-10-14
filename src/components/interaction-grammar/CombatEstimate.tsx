/**
 * NUM-LAB — COMBAT ESTIMATE. PROTOTYPE ONLY (admin/dev lab; no server
 * authority yet).
 *
 * A fixed premise — attacker, target, one action — and a typed number. The
 * player estimates the result, locks it, and the caller's authority answers
 * with the true value and the band it graded against.
 *
 *   OPEN → type → LOCK (button or Enter) → (suspense, caller-owned) → REVEAL
 *
 * The premise is DATA the caller supplies; this component computes nothing
 * from it. It validates the player's text against `content.scale` (range and
 * precision) and refuses to lock an invalid entry rather than rewriting it.
 * The button stays enabled for any non-empty text: a disabled default button
 * would also swallow Enter, and the player would never learn why.
 * `inputMode="decimal"` raises the numeric keypad on phones.
 */
import { useId, useState, type FormEvent, type Ref } from "react";
import { Lock, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";
import {
  formatPlayerValue, parseEstimate, verdictSentence,
  type CombatEstimatePublic, type CombatSide, type NumericResponse, type NumericReveal, type ParsedEstimate,
} from "@/lib/interaction-grammar/numericModes";
import { MetricChip, SubjectArt, SuspenseDots } from "./shared";
import { NumericRevealPanel } from "./NumericRevealPanel";

export interface CombatEstimateProps {
  content: CombatEstimatePublic;
  phase: InteractionPhase;
  /** The raw text in the box, owned by the caller. */
  text: string;
  onTextChange: (text: string) => void;
  onLock: (response: NumericResponse) => void;
  reveal?: NumericReveal | null;
  promptRef?: Ref<HTMLHeadingElement>;
}

const REASON: Record<Exclude<ParsedEstimate, { ok: true }>["reason"], string> = {
  "empty": "",
  "not-a-number": "Enter a number.",
  "below-range": "Too low for this question's range.",
  "above-range": "Too high for this question's range.",
  "too-precise": "Too many decimal places.",
};

function SideCard({ side, role }: { side: CombatSide; role: "Attacker" | "Target" }) {
  return (
    <div data-testid={`ce-${role.toLowerCase()}`}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-[#7a6236]/45 bg-[#2c2417]/[0.05] p-2 text-center sm:p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ranked-ink-muted,#5a4a2e)]">{role}</p>
      <SubjectArt media={side.media} monogram={side.monogram ?? side.label}
        className="h-12 w-12 rounded-md border border-[#7a6236]/50 sm:h-14 sm:w-14" />
      <p className="max-w-full truncate font-serif text-sm font-bold text-[var(--ranked-ink,#2c2417)] sm:text-base">{side.label}</p>
      <ul className="flex flex-col gap-0.5 text-[12px] leading-tight text-[var(--ranked-ink-muted,#5a4a2e)]">
        {side.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

export function CombatEstimate({ content, phase, text, onTextChange, onLock, reveal = null, promptRef }: CombatEstimateProps) {
  const reduce = useReducedMotionPreference();
  const animate = !reduce;
  const promptId = useId();
  const errorId = useId();
  const [touched, setTouched] = useState(false);
  const open = phase === "open";
  const parsed = parseEstimate(text, content.scale);
  const error = touched && "reason" in parsed ? REASON[parsed.reason] : "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (open && parsed.ok) onLock({ selected: parsed.value });
  };

  const announcement = phase === "revealed" && reveal ? `Revealed. ${verdictSentence(reveal)}`
    : phase === "locked" && parsed.ok ? `Locked in ${formatPlayerValue(parsed.value, content.scale)}. Revealing.` : "";

  return (
    <div data-testid="mig-combat-estimate" data-mig-primitive="combat-estimate" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <MetricChip>{content.metricLabel}</MetricChip>
          {content.context && <MetricChip>{content.context}</MetricChip>}
        </div>
        <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="ce-prompt"
          className="max-w-[40rem] font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] outline-none sm:text-xl">
          {content.prompt}
        </h2>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-4">
        <SideCard side={content.attacker} role="Attacker" />
        <span aria-hidden className="flex flex-col items-center justify-center gap-1 text-[var(--ranked-ink-muted,#5a4a2e)]">
          <Swords className="size-5" />
        </span>
        <SideCard side={content.target} role="Target" />
      </div>
      <p data-testid="ce-action" className="text-center text-[13px] font-semibold text-[var(--ranked-ink,#2c2417)]">
        {content.action}
      </p>

      <form onSubmit={submit} className="flex flex-col items-center gap-2" noValidate>
        <label htmlFor={`${promptId}-input`} className="sr-only">{content.metricLabel}</label>
        <div className="flex items-stretch gap-2">
          <input id={`${promptId}-input`} data-testid="ce-input" type="text" inputMode="decimal" autoComplete="off"
            enterKeyHint="done" spellCheck={false}
            value={reveal ? reveal.submittedDisplay : text}
            readOnly={!open} aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}
            onChange={(e) => onTextChange(e.target.value)} onBlur={() => text && setTouched(true)}
            placeholder={`${formatPlayerValue(content.scale.min, content.scale)} – ${formatPlayerValue(content.scale.max, content.scale)}`}
            className="h-11 w-44 rounded-md border border-[#7a6236]/60 bg-white/80 px-3 text-center font-serif text-lg font-bold tabular-nums text-[#2c2417] outline-none focus-visible:ring-2 focus-visible:ring-[#d5b66f] read-only:bg-transparent sm:w-52" />
          {open && (
            <Button type="submit" data-testid="ce-lock" disabled={!text.trim()}
              className="min-h-[44px] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14]">
              <Lock aria-hidden /> Lock in
            </Button>
          )}
        </div>
        <p id={errorId} data-testid="ce-error" className="min-h-[1rem] text-[12px] text-red-700">{error}</p>
      </form>

      <footer className="flex min-h-[2.75rem] flex-col items-center gap-2.5">
        {phase === "locked" && (
          <p data-testid="ce-suspense"
            className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            Locked · Revealing <SuspenseDots animate={animate} />
          </p>
        )}
        {phase === "revealed" && reveal && <NumericRevealPanel reveal={reveal} animate={animate} />}
      </footer>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
