/**
 * Educational — "the riddle".
 *
 * A miniature practice question. Answering it reveals the right option with a
 * light sweep (a wrong pick shakes) and unfolds the explanation. It is a
 * taster only: no answer is submitted, graded by the server, or counted
 * toward XP, streaks or the Daily Challenge.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import type { QuestionItem } from "../model/pulse-types";
import { ChampionArt, EASE_OUT, Kicker, pop, rise, sceneRoot, usePulseArt, type SceneProps } from "./scene-kit";

export default function QuestionScene({ item, onInteract }: SceneProps<QuestionItem>) {
  const art = usePulseArt();
  const [picked, setPicked] = useState<string | null>(null);
  const answered = picked !== null;
  const correct = picked === item.correctId;

  return (
    <motion.div className="apulse-scene apulse-question" data-answered={answered ? (correct ? "right" : "wrong") : undefined} variants={sceneRoot(0.1, 0.06)}>
      <Kicker>Quick study · {item.subject}</Kicker>
      <motion.p variants={rise} className="apulse-prompt" id={`${item.id}-prompt`}>{item.prompt}</motion.p>

      <div className="apulse-options" role="group" aria-labelledby={`${item.id}-prompt`}>
        {item.options.map((o) => {
          const state = !answered ? "open" : o.id === item.correctId ? "right" : o.id === picked ? "wrong" : "dim";
          return (
            <motion.button
              key={o.id}
              type="button"
              variants={pop}
              className="apulse-option"
              data-state={state}
              disabled={answered}
              aria-pressed={o.id === picked}
              onClick={() => { setPicked(o.id); onInteract(); }}
              data-testid={`pulse-question-option-${o.id}`}
            >
              {o.champion && <ChampionArt src={art.championIcon(o.champion)} className="apulse-option-icon" />}
              <span>{o.label}</span>
              {state === "right" && <span className="apulse-option-mark" aria-hidden>✓</span>}
            </motion.button>
          );
        })}
      </div>

      <div className="apulse-question-foot" aria-live="polite">
        <AnimatePresence>
          {answered && (
            <motion.div
              className="apulse-explain"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } }}
              exit={{ opacity: 0 }}
            >
              <p>
                <b className={correct ? "apulse-good" : "apulse-bad"}>{correct ? "Right!" : "Not quite."}</b>{" "}
                <span className="apulse-explain-text">{item.explanation}</span>
              </p>
              <Link to={item.practiceHref} className="apulse-link" onClick={onInteract}>Practice more</Link>
            </motion.div>
          )}
        </AnimatePresence>
        {!answered && <motion.p variants={rise} className="apulse-note">Practice only: nothing is scored.</motion.p>}
      </div>
    </motion.div>
  );
}
