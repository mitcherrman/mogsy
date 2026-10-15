/**
 * CEG1 — grade an owner playtest log offline, after the fact.
 *
 *   npx tsx scripts/combat-estimate/grading/grade_playtest.ts <log.csv>
 *
 * The CE1 lab shows no pass mark (by design), so the owner records each locked
 * estimate and a gut call BEFORE seeing any verdict; this prints what each
 * candidate policy would have said and how often it agrees with the gut call.
 * No server, no database, no production code path. See
 * `playtest-log.template.csv` for the columns.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { absolutePolicy, isCorrect, relativeExactPolicy, type BinaryPolicy, type Truth } from "./policies";
import { FALLBACK, loadCapture, RECOMMENDED } from "./audit";

export interface PlaytestRow { round: string; device: string; estimate: number; seconds: number | null; gut: "fair-correct" | "fair-incorrect" | "unsure"; note: string }

export const PLAYTEST_POLICIES: BinaryPolicy[] = [RECOMMENDED, FALLBACK, absolutePolicy(10), relativeExactPolicy(0.1)];

/** Minimal CSV: comma-separated, no quoted commas (the note column is last and may contain commas). */
export function parsePlaytestCsv(text: string): PlaytestRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  const [head, ...rows] = lines;
  if (head?.split(",").slice(0, 5).join(",") !== "round,device,estimate,seconds,gut") throw new Error("playtest log: header must start round,device,estimate,seconds,gut");
  return rows.map((line, i) => {
    const [round, device, estimate, seconds, gut, ...note] = line.split(",").map((c) => c.trim());
    const e = Number(estimate);
    if (!round || !Number.isInteger(e) || e < 0) throw new Error(`playtest log: row ${i + 2} needs a round id and a whole-number estimate`);
    if (gut !== "fair-correct" && gut !== "fair-incorrect" && gut !== "unsure") throw new Error(`playtest log: row ${i + 2} gut must be fair-correct | fair-incorrect | unsure`);
    return { round, device: device || "?", estimate: e, seconds: seconds ? Number(seconds) : null, gut, note: note.join(",") };
  });
}

export function gradePlaytest(rows: PlaytestRow[], truths: Map<string, Truth>): string {
  const out: string[] = [];
  const agree = new Map(PLAYTEST_POLICIES.map((p) => [p.id, { agree: 0, n: 0 }]));
  out.push(["round", "device", "estimate", "whole", "Δ", "gut", ...PLAYTEST_POLICIES.map((p) => p.label)].join(" | "));
  for (const r of rows) {
    const t = truths.get(r.round);
    if (!t) { out.push(`${r.round} | (not a certified round — skipped)`); continue; }
    const cells = PLAYTEST_POLICIES.map((p) => {
      const ok = isCorrect(p, t, r.estimate);
      if (r.gut !== "unsure") { const a = agree.get(p.id)!; a.n += 1; if (ok === (r.gut === "fair-correct")) a.agree += 1; }
      return ok ? "correct" : "incorrect";
    });
    out.push([r.round, r.device, r.estimate, t.whole, r.estimate - t.whole, r.gut, ...cells].join(" | "));
  }
  out.push("");
  for (const p of PLAYTEST_POLICIES) { const a = agree.get(p.id)!; out.push(`${p.label}: agrees with the gut call on ${a.agree}/${a.n}`); }
  return out.join("\n") + "\n";
}

const invokedDirectly = (() => {
  try { return path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")); } catch { return false; }
})();

if (invokedDirectly) {
  const file = process.argv[2];
  if (!file) { console.error("usage: grade_playtest.ts <log.csv>"); process.exit(2); }
  const truths = new Map(loadCapture().scenarios.map((s) => [s.id, { exact: s.answer.exact, whole: s.answer.whole }]));
  process.stdout.write(gradePlaytest(parsePlaytestCsv(readFileSync(path.resolve(file), "utf8")), truths));
}
