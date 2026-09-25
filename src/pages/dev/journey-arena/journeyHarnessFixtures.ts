/**
 * JOURNEY-UI1 — the harness's children: one public Journey state (wire) and
 * one question per child. Prompts are SHORT and refer to the board, because
 * the board carries the premise; options are the JOURNEY1 §7 probe's numbers
 * plus neighbours, and nothing here grades anything.
 */
import {
  ARC_A_ALT_LEVEL_UP, ARC_A_CHILD_0, ARC_A_CHILD_1, ARC_A_CHILD_2, ARC_A_CHILD_3, ARC_A_CHILD_4,
  ARC_C_CHILD_0_WITHHELD, ARC_C_CHILD_2_PREMISE, ARC_F_CHILD_0, ARC_F_CHILD_1_UNLOCK,
} from "@/lib/journey/fixtures";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";

const q = (id: string, prompt: string, labels: string[]): QuestionView => ({
  questionId: id, category: "mastery", prompt,
  options: labels.map((label, index) => ({ id: String(index), index, label })),
});

export interface HarnessStep { wire: Record<string, unknown>; question: QuestionView }
export interface HarnessArc { label: string; steps: HarnessStep[] }

export const JOURNEY_HARNESS_ARCS: Record<"a" | "c" | "f", HarnessArc> = {
  a: {
    label: "A · Jarvan vs Olaf",
    steps: [
      { wire: ARC_A_CHILD_0, question: q("a0", "What is Dragon Strike's cooldown at Jarvan IV's current rank?", ["7 seconds", "8 seconds", "9 seconds", "10 seconds"]) },
      { wire: ARC_A_CHILD_1, question: q("a1", "Whose Q has the longer cooldown right now?", ["Jarvan IV", "Olaf"]) },
      { wire: ARC_A_CHILD_2, question: q("a2", "With his new ability haste, what is Dragon Strike's cooldown now?", ["6.67 seconds", "7.27 seconds", "7.5 seconds", "8 seconds"]) },
      { wire: ARC_A_CHILD_3, question: q("a3", "How much damage does Dragon Strike deal to Olaf?", ["112", "120", "131", "140"]) },
      { wire: ARC_A_CHILD_4, question: q("a4", "How much damage does Dragon Strike deal to Olaf now?", ["96", "104", "112", "120"]) },
      { wire: ARC_A_ALT_LEVEL_UP, question: q("a5", "At level 7 with Serrated Dirk, how much damage does Dragon Strike deal to Olaf?", ["131", "138", "145", "152"]) },
    ],
  },
  c: {
    label: "C · withheld armor",
    steps: [
      { wire: ARC_C_CHILD_0_WITHHELD, question: q("c0", "What is Garen's armor at level 3?", ["38.2", "41.6", "44.195", "47.4"]) },
      { wire: ARC_C_CHILD_2_PREMISE, question: q("c2", "How much damage does Decimate deal to Garen?", ["76", "80", "84", "88"]) },
    ],
  },
  f: {
    label: "F · level 6 unlock",
    steps: [
      { wire: ARC_F_CHILD_0, question: q("f0", "How much damage does Rake deal to Ahri?", ["128", "135", "142", "150"]) },
      { wire: ARC_F_CHILD_1_UNLOCK, question: q("f1", "What is Shadow Assault's cooldown at rank 1?", ["90 seconds", "100 seconds", "110 seconds", "120 seconds"]) },
    ],
  },
};
