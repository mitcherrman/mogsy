// QI1 capture harness: the real panel fed FIXTURE data (the backend golden
// response plus deterministic synthetic rows so a page looks like a page).
// Nothing here reaches Railway or Supabase.
import { createRoot } from "react-dom/client";
import "@/index.css";
import golden from "@/lib/admin/__fixtures__/question-intelligence-v1.json";
import { QuestionIntelligencePanel } from "@/components/admin/users/QuestionIntelligencePanel";
import { parseQuestionIntelligence, type QiQuestion, type QuestionIntelligence } from "@/lib/admin/questionIntelligence/api";
import { defaultQiFilters } from "@/lib/admin/questionIntelligence/view";

const base = parseQuestionIntelligence(golden);

const SYNTHETIC: Array<[string, string, number, number, number, number, number[], number]> = [
  // ref, prompt, served, correct, incorrect, timeout, wrong picks by position, repeats
  ["quiz:item:boots-ms", "Which boots grant the most movement speed?", 412, 301, 88, 23, [0, 51, 30, 7], 3],
  ["mastery:ability:ahri-q-cd", "What is Ahri Q's cooldown at rank 5?", 268, 133, 118, 17, [44, 0, 61, 13], 0],
  ["quiz:champion:hp-l18", "Which champion has the highest base HP at level 18?", 233, 120, 97, 16, [12, 49, 0, 36], 6],
  ["reflex:as:jinx-vayne", "Who attacks faster at level 1?", 219, 171, 40, 8, [40, 0], 1],
  ["quiz:rune:conqueror", "Which keystone stacks adaptive force in combat?", 187, 151, 29, 7, [9, 0, 14, 6], 0],
  ["mastery:item:bork-passive", "Blade of the Ruined King deals bonus damage based on…", 166, 72, 81, 13, [0, 33, 27, 21], 2],
  ["quiz:item:thornmail-gw", "Which item applies Grievous Wounds when you are hit?", 140, 98, 35, 7, [11, 9, 0, 15], 0],
  ["reflex:range:caitlyn-ashe", "Who has the longer attack range?", 131, 70, 52, 9, [0, 52], 4],
  ["quiz:summoner:ignite-gw", "Which summoner spell applies Grievous Wounds?", 118, 101, 12, 5, [5, 0, 4, 3], 0],
];

// DREP1 splits for the synthetic repeats: forced, avoidable, one row past the
// snapshot read cap (shown as "1?"), the rest outside DREP1's scope.
const DREP1: Record<string, NonNullable<QiQuestion["repeats"]["drep1"]>> = {
  "quiz:item:boots-ms": { forced: 2, avoidable: 0, outsideScope: 1, unclassified: 0 },
  "quiz:champion:hp-l18": { forced: 3, avoidable: 2, outsideScope: 1, unclassified: 0 },
  "mastery:item:bork-passive": { forced: 0, avoidable: 1, outsideScope: 0, unclassified: 1 },
};

function synthetic(i: number, row: (typeof SYNTHETIC)[number]): QiQuestion {
  const [ref, prompt, served, correct, incorrect, timeout, wrong, repeats] = row;
  const settled = correct + incorrect + timeout;
  const n = wrong.length;
  const correctAt = wrong.indexOf(0) + 1;
  const ns = ref.split(":")[0];
  return {
    ref, namespace: ns, family: ref.split(":")[1] ?? null, prompt,
    modules: [ns === "reflex" ? "item_cost_duel" : ns === "mastery" ? "mastery_slice" : "quiz"],
    served, answered: correct + incorrect, correct, incorrect, timeout, unsettled: 0,
    players: Math.round(served * 0.8),
    rates: { correct: correct / settled, incorrect: incorrect / settled, timeout: timeout / settled, answered: (correct + incorrect) / served },
    hosts: { daily: Math.round(served * 0.7), ranked: served - Math.round(served * 0.7) - (i % 3), other: i % 3 },
    stageKinds: { standard: Math.round(served * 0.5), time_trial: Math.round(served * 0.12), survival: Math.round(served * 0.08) },
    firstDay: "2026-10-14", lastDay: "2026-10-20",
    repeats: {
      repeatExposures: repeats, repeatPlayers: Math.min(repeats, 2), multiDayPlayers: Math.min(repeats, 2), maxDaysOnePlayer: repeats ? 2 : 1, lookbackDays: 7,
      drep1: DREP1[ref] ?? { forced: 0, avoidable: 0, outsideScope: repeats, unclassified: 0 },
    },
    positions: {
      positionalExposures: served, nonPositionalExposures: 0, undecoded: 0,
      optionCounts: { [String(n)]: served },
      byPosition: wrong.map((w, k) => ({
        position: k + 1, pickedWrong: w,
        shownCorrect: k + 1 === correctAt ? Math.round(served * 0.4) : Math.round((served * 0.6) / (n - 1)),
        pickedCorrect: k + 1 === correctAt ? Math.round(correct * 0.4) : Math.round((correct * 0.6) / (n - 1)),
      })),
      wrongChoices: [],
    },
  };
}

const rows = [...SYNTHETIC.map((r, i) => synthetic(i, r)), ...base.questions];
const data: QuestionIntelligence = {
  ...base,
  totals: {
    ...base.totals,
    served: rows.reduce((s, q) => s + q.served, 0),
    answered: rows.reduce((s, q) => s + q.answered, 0),
    timeout: rows.reduce((s, q) => s + q.timeout, 0),
    questions: rows.length,
    excludedTestMatches: 14,
    repeats: {
      ...base.totals.repeats,
      repeatVsPreviousDays: rows.reduce((s, q) => s + q.repeats.repeatExposures, 0),
      drep1: {
        forced: rows.reduce((s, q) => s + (q.repeats.drep1?.forced ?? 0), 0),
        avoidableProtected: rows.reduce((s, q) => s + (q.repeats.drep1?.avoidable ?? 0), 0) - 1,
        avoidableUnprotected: 1,
        outsideScope: rows.reduce((s, q) => s + (q.repeats.drep1?.outsideScope ?? 0), 0),
        unclassified: rows.reduce((s, q) => s + (q.repeats.drep1?.unclassified ?? 0), 0),
        snapshotsRead: 60, childrenNeeded: 61, readCap: 60,
      },
    },
  },
  questions: rows,
  page: { offset: 0, limit: 50, total: rows.length, nextOffset: null },
};

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6">
    <h1 className="mb-3 text-lg font-semibold">Users · Audience · Question Intelligence</h1>
    <QuestionIntelligencePanel
      load={async () => data}
      initialFilters={{ ...defaultQiFilters(Date.parse("2026-10-20T12:00:00Z")) }}
    />
  </main>,
);
