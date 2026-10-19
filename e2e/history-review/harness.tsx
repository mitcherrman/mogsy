/**
 * Match History V2 (Track D) — geometry harness for the REAL question inspector.
 *
 * Renders `QuestionInspector` (the real trigger, the real Radix Popover on a fine
 * pointer, the real `QuestionReviewSheet` on a coarse one, the real
 * `QuestionReviewCard`) around fixtures from `fixtures.ts`. Nothing is mocked or
 * re-laid-out. No auth, no backend.
 *
 * Query:  state=<fixture id>   pos=top|middle|bottom|right-bottom (trigger placement)
 */
import { createRoot } from "react-dom/client";
import "@/index.css";
import QuestionInspector from "@/components/quiz/workspace/QuestionInspector";
import { readCombatWorking } from "@/lib/journey/combatWorking";
import { PANTHEON_E_WORKING_RECALLED } from "@/lib/journey/__fixtures__/j5/finalWindow";
import { FIXTURES } from "./fixtures";

const q = new URLSearchParams(location.search);
const fx = FIXTURES[q.get("state") ?? "quiz-correct"];
const pos = q.get("pos") ?? "middle";

const round = structuredClone(fx.round);
if (fx.combat && round.masteryChallenges) {
  round.masteryChallenges[0].combatWorking = readCombatWorking(structuredClone(PANTHEON_E_WORKING_RECALLED));
}

const PLACE: Record<string, string> = {
  top: "items-start justify-start",
  middle: "items-center justify-center",
  bottom: "items-end justify-center",
  "right-bottom": "items-end justify-end",
};

createRoot(document.getElementById("root")!).render(
  <div className={`flex min-h-dvh w-full p-3 ${PLACE[pos] ?? PLACE.middle}`} style={{ background: "#14110d" }}>
    <QuestionInspector
      round={round}
      position={round.roundNumber}
      total={fx.total}
      testId="history-trigger"
      className="flex h-11 w-11 items-center justify-center rounded border border-amber-700/60 bg-amber-900/30 text-xs text-amber-100"
    >
      Q{round.roundNumber}
    </QuestionInspector>
  </div>,
);
