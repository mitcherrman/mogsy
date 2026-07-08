/**
 * CalculationBreakdown — generic "analyst calculator" display for derived
 * questions. Takes labeled inputs, a chain of computation steps, and a
 * promoted final result; knows nothing about cooldowns specifically, so any
 * future deterministic calculation (attack speed, damage, gold) can reuse it.
 * Rendered inside the reveal explanation card (emerald palette).
 */

export type CalcInput = { label: string; value: string };
export type CalcStep = { expression: string; result: string };
export type CalcResult = { label: string; value: string };

export function CalculationBreakdown({
  inputs,
  steps,
  result,
}: {
  inputs: CalcInput[];
  steps: CalcStep[];
  result: CalcResult;
}) {
  return (
    <div className="space-y-[0.55em] leading-snug">
      <div className="text-[0.62em] font-bold uppercase tracking-[0.3em] text-emerald-200/80">The math</div>

      {/* Inputs */}
      <div className="flex flex-wrap gap-x-[1.8em] gap-y-[0.35em]">
        {inputs.map((input) => (
          <div key={input.label}>
            <div className="text-[0.6em] font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
              {input.label}
            </div>
            <div className="text-[1.05em] font-bold text-white">{input.value}</div>
          </div>
        ))}
      </div>

      {/* Computation chain */}
      <div className="space-y-[0.15em] font-mono text-[0.92em] font-bold tracking-tight text-emerald-100">
        {steps.map((step) => (
          <div key={step.expression}>
            {step.expression} = <span className="text-white">{step.result}</span>
          </div>
        ))}
      </div>

      {/* Promoted result */}
      <div className="flex items-baseline gap-[0.7em]">
        <span className="text-[0.62em] font-semibold uppercase tracking-[0.22em] text-emerald-100/70">
          {result.label}
        </span>
        <span className="text-[1.3em] font-black tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          {result.value}
        </span>
      </div>
    </div>
  );
}
