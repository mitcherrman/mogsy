/**
 * JX2 — a basic four-function calculator so a player needs no external one.
 * No game-state auto-fill, no history: digits, + − × ÷, ( ), ⌫, C, =.
 */
import { useState } from "react";
import { Delete } from "lucide-react";
import { evaluate, formatResult, press, type CalcKey } from "@/lib/journey/calculator";

const ROWS: (CalcKey | "C" | "⌫" | "=")[][] = [
  ["C", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "⌫", "="],
];

const LABELS: Record<string, string> = {
  C: "Clear", "⌫": "Backspace", "=": "Equals", "÷": "Divide", "×": "Multiply",
  "−": "Subtract", "+": "Add", ".": "Decimal point", "(": "Open parenthesis", ")": "Close parenthesis",
};

export function BasicCalculator() {
  const [expr, setExpr] = useState("");
  const [error, setError] = useState(false);

  const onKey = (key: (typeof ROWS)[number][number]) => {
    setError(false);
    if (key === "C") return setExpr("");
    if (key === "⌫") return setExpr((e) => e.slice(0, -1));
    if (key === "=") {
      const v = evaluate(expr);
      if (v === null) return setError(expr !== "");
      return setExpr(formatResult(v).replace("-", "−"));
    }
    setExpr((e) => press(e, key));
  };

  return (
    <section data-testid="journey-calculator" aria-label="Calculator" className="space-y-2">
      <output data-testid="journey-calculator-display" aria-live="polite"
        className={`block min-h-[2.75rem] break-all rounded-md border bg-black/50 px-3 py-2 text-right font-mono text-xl tabular-nums ${error ? "border-red-400/70 text-red-200" : "border-[#d4b35a]/30 text-white"}`}>
        {expr || "0"}
      </output>
      <div className="grid grid-cols-4 gap-1.5">
        {ROWS.flat().map((key) => (
          <button key={key} type="button" onClick={() => onKey(key)}
            aria-label={LABELS[key] ?? key} data-key={key}
            className={`h-11 rounded-md border text-lg font-semibold transition-colors ${
              key === "=" ? "border-[#d4b35a]/60 bg-[#d4b35a]/25 text-[#f3dca0] hover:bg-[#d4b35a]/35"
                : /[0-9.]/.test(key) ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                  : "border-white/10 bg-black/40 text-[#e8c97a] hover:bg-white/10"}`}>
            {key === "⌫" ? <Delete aria-hidden className="mx-auto h-5 w-5" /> : key}
          </button>
        ))}
      </div>
    </section>
  );
}
