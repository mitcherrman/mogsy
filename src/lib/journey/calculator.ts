/**
 * JX2 — a four-function calculator's arithmetic. A convenience pad, not a
 * mechanics engine: it knows digits, `.`, + − × ÷ and parentheses, nothing
 * about League. No `eval`: a small recursive-descent parser.
 */

export type CalcKey =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "." | "+" | "−" | "×" | "÷" | "(" | ")";

const OPS = new Set(["+", "−", "×", "÷"]);

/** Evaluate an expression built from calculator keys. Null when incomplete,
 *  malformed, or not finite (e.g. ÷ 0). */
export function evaluate(expr: string): number | null {
  let i = 0;
  const peek = () => expr[i];

  function number(): number | null {
    const start = i;
    while (i < expr.length && /[0-9.]/.test(expr[i])) i++;
    const text = expr.slice(start, i);
    if (!text || !/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
    return Number(text);
  }
  function factor(): number | null {
    if (peek() === "−") { i++; const v = factor(); return v === null ? null : -v; }
    if (peek() === "(") {
      i++;
      const v = sum();
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    return number();
  }
  function product(): number | null {
    let v = factor();
    while (v !== null && (peek() === "×" || peek() === "÷")) {
      const op = expr[i++];
      const r = factor();
      if (r === null) return null;
      v = op === "×" ? v * r : v / r;
    }
    return v;
  }
  function sum(): number | null {
    let v = product();
    while (v !== null && (peek() === "+" || peek() === "−")) {
      const op = expr[i++];
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  if (!expr) return null;
  const v = sum();
  if (v === null || i !== expr.length || !Number.isFinite(v)) return null;
  return v;
}

/** Display a result without float noise (0.1 + 0.2 → 0.3). */
export function formatResult(v: number): string {
  return String(Number(v.toPrecision(12)));
}

/** Append a key, refusing inputs that could never become valid. */
export function press(expr: string, key: CalcKey): string {
  const last = expr[expr.length - 1];
  if (key === ".") {
    const tail = expr.split(/[+−×÷()]/).pop() ?? "";
    if (tail.includes(".")) return expr;
    return last === ")" ? expr : expr + (tail === "" ? "0." : ".");
  }
  if (OPS.has(key)) {
    if (expr === "" || last === "(") return key === "−" ? expr + key : expr;
    if (OPS.has(last)) return expr.slice(0, -1) + key;
    return expr + key;
  }
  return expr + key;
}
