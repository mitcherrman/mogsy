/**
 * NUM-REC2 — the owner's playtest log, kept in memory for the session and
 * downloaded as CSV.
 *
 * Combat Estimate rows use CEG1's exact log format
 * (`scripts/combat-estimate/grading/playtest-log.template.csv`), so the owner
 * grades them OFFLINE with CEG1's own script:
 *
 *   npx tsx scripts/combat-estimate/grading/grade_playtest.ts <log>.csv
 *
 * The lab itself shows no pass mark and evaluates no candidate policy: that is
 * what keeps the gut call blind (CEG1 §10), and it is why no tolerance is
 * adopted here. Stat Drop has no grading research yet, so its log only records
 * the estimate, the gut call and the note for the owner's product decision.
 */

export type GutCall = "fair-correct" | "fair-incorrect" | "unsure";
export type Device = "desktop" | "phone";

export interface PlaytestEntry {
  mode: "combat-estimate" | "stat-drop";
  round: string;
  device: Device;
  /** The locked value, exactly as sent. */
  value: number;
  /** First touch to Lock, whole seconds; null when unknown. */
  seconds: number | null;
  gut: GutCall | null;
  note: string;
}

/** CSV-safe: the CEG1 parser splits on commas and newlines, so neither may appear inside a cell. */
const cell = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/,/g, ";").trim();

const CEG1_HEADER = [
  "# CEG1 owner playtest log, exported by the owner numeric lab (NUM-REC2). Grade offline:",
  "#   npx tsx scripts/combat-estimate/grading/grade_playtest.ts <this file>.csv",
  "round,device,estimate,seconds,gut,note",
];

/** Combat Estimate rows in CEG1's format. Rows without a gut call are exported as `unsure`. */
export function combatEstimateCsv(entries: readonly PlaytestEntry[]): string {
  const rows = entries.filter((e) => e.mode === "combat-estimate").map((e) =>
    [e.round, e.device, String(e.value), e.seconds === null ? "" : String(e.seconds), e.gut ?? "unsure", cell(e.note)].join(","));
  return [...CEG1_HEADER, ...rows].join("\n") + "\n";
}

export function statDropCsv(entries: readonly PlaytestEntry[]): string {
  const rows = entries.filter((e) => e.mode === "stat-drop").map((e) =>
    [e.round, e.device, String(e.value), e.seconds === null ? "" : String(e.seconds), e.gut ?? "unsure", cell(e.note)].join(","));
  return [
    "# Stat Drop owner playtest log (NUM-REC2). No grading policy exists for Stat Drop; this records feedback only.",
    "round,device,value,seconds,gut,note",
    ...rows,
  ].join("\n") + "\n";
}

/** A coarse pointer is a phone for the log's purposes; the owner can correct it. */
export function detectDevice(): Device {
  try {
    return window.matchMedia?.("(pointer: coarse)").matches ? "phone" : "desktop";
  } catch {
    return "desktop";
  }
}
