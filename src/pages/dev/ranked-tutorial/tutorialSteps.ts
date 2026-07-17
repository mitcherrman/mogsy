// ---------------------------------------------------------------------------
// Ranked TUTORIAL — authored step table.
//
// One entry per tutorial step, in teaching order. The reducer consults this
// table for permitted events and transitions; the page reads copy, timer
// mode, and announcements from it. All copy is tutorial-authored.
// ---------------------------------------------------------------------------

import { TutorialStepDefinition, TutorialStepId } from "./types";

export const STEP_ORDER: readonly TutorialStepId[] = [
  "welcome",
  "timer_intro",
  "answer_selection",
  "answer_locked",
  "simultaneous_reveal",
  "damage_intro",
  "both_correct_demo",
  "failure_demo",
  "xp_intro",
  "starter_ability_intro",
  "ability_resolution",
  "level_two_choice",
  "level_three_unlock",
  "victory_round",
  "match_over",
  "queue_explanation",
  "reconnect_explanation",
  "ads_pro_explanation",
  "complete",
];

const NAV = ["CONTINUE", "RESTART"] as const;

/**
 * Full authored table. E2.2 renders welcome/timer_intro interactively; the
 * later steps' copy and permitted events are defined now so the machine and
 * progress indicator are complete, and their interactive UIs land in E2.3.
 */
export const STEPS: Record<TutorialStepId, TutorialStepDefinition> = {
  welcome: {
    id: "welcome",
    label: "Welcome",
    title: "Welcome to Ranked training",
    body:
      "This is a scripted Training Match against the Training Golem — nothing here counts toward real Ranked. You'll learn the shared timer, answering, damage, XP, and your Tank abilities one step at a time. The timer stays paused while you read.",
    announcement:
      "Welcome to Ranked training. A scripted practice match. Press Begin Training to start.",
    timerMode: "paused",
    permittedEvents: ["BEGIN_TRAINING", "RESTART"],
    allowBack: false,
  },
  timer_intro: {
    id: "timer_intro",
    label: "Timer",
    title: "One shared timer",
    body:
      "Each round, you and your opponent share a single 30-second timer. The moment either player answers, the timer drops by 5 seconds — answering first puts real pressure on your opponent. In training the timer is paused while we explain.",
    announcement:
      "The shared timer. Thirty seconds per round; the first answer cuts it by five.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: true,
  },
  answer_selection: {
    id: "answer_selection",
    label: "Answer",
    title: "Pick your answer",
    body:
      "Choose an answer. No ability is selected — that lesson comes later. When you're ready, Lock it in and confirm. Until you confirm, you can change your mind. Take your time: training never fails you for reading.",
    announcement:
      "Answer selection. Choose an answer, lock it in, then confirm.",
    timerMode: "running",
    permittedEvents: [
      "SELECT_ANSWER",
      "SELECT_ABILITY",
      "LOCK_SUBMISSION",
      "EDIT_SUBMISSION",
      "CONFIRM_LOCK",
      "TICK",
      "RESTART",
    ],
    allowBack: true,
  },
  answer_locked: {
    id: "answer_locked",
    label: "Locked",
    title: "Locked in",
    body:
      "Your submission is final for the round: the answer can't change and can't be sent twice. Your answer is hidden until reveal — the Golem only sees that you've locked, never what you picked. It has now locked its own answer too.",
    announcement: "Submission locked. Choices stay hidden until the reveal.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: false,
  },
  simultaneous_reveal: {
    id: "simultaneous_reveal",
    label: "Reveal",
    title: "Both answers reveal together",
    body:
      "When the round ends, both players' answers and abilities reveal at the same moment. No one gains an edge from seeing the other's choice early.",
    announcement: "Simultaneous reveal. Both choices are shown together.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: false,
  },
  damage_intro: {
    id: "damage_intro",
    label: "Damage",
    title: "Correct answers deal damage",
    body:
      "You answered correctly and the Golem missed, so your hit lands. HP is the score — reduce your opponent to zero to win. (Training numbers are illustrative, not Ranked balance.)",
    announcement: "Damage. Correct answers reduce the opponent's HP.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: false,
  },
  both_correct_demo: {
    id: "both_correct_demo",
    label: "Both hit",
    title: "Both correct — both deal damage",
    body:
      "This round the Golem answers first: watch the shared timer drop by 5 seconds the moment it locks in. Answer correctly and confirm — when both players are correct, both deal damage.",
    announcement:
      "Round two. The Golem will answer first and cut the shared timer by five seconds. Answer correctly and lock in.",
    timerMode: "running",
    permittedEvents: [
      "SELECT_ANSWER",
      "SELECT_ABILITY",
      "LOCK_SUBMISSION",
      "EDIT_SUBMISSION",
      "CONFIRM_LOCK",
      "CONTINUE",
      "TICK",
      "RESTART",
    ],
    allowBack: false,
  },
  failure_demo: {
    id: "failure_demo",
    label: "Timeout",
    title: "Misses and timeouts",
    body:
      "If time runs out — or both players miss — the round is a wash: no damage either way, and both still earn XP. Use the button below to fast-forward the timer; you never have to sit through a real 30 seconds in training.",
    announcement:
      "Timeouts. Press Demonstrate timeout to fast-forward the timer and see a no-damage round.",
    timerMode: "simulated",
    permittedEvents: ["SIMULATE_TIMEOUT", "CONTINUE", "RESTART"],
    allowBack: false,
  },
  xp_intro: {
    id: "xp_intro",
    label: "XP",
    title: "XP builds every round — you just hit Level 2",
    body:
      "Every round earns XP: 12 for a correct answer, 9 for a wrong one, 8 even on a timeout. XP fills the quiet bar under your HP and unlocks abilities — it does NOT decide who's winning; HP does. Your 32 XP just crossed the 30 threshold: Level 2 reached.",
    announcement:
      "XP explained. You crossed thirty XP and reached Level two.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: true,
  },
  starter_ability_intro: {
    id: "starter_ability_intro",
    label: "Fortify",
    title: "Fortify is your starter ability",
    body:
      "You begin with Fortify (3 charges): answer correctly with it armed and your NEXT question gains five seconds. Arm it before locking your answer — selecting it costs nothing yet; the charge is committed only when the round resolves. Your ability stays hidden until reveal.",
    announcement:
      "Fortify, your starter ability. Arm it, answer correctly, and your next question gains five seconds.",
    timerMode: "running",
    permittedEvents: [
      "SELECT_ANSWER",
      "SELECT_ABILITY",
      "LOCK_SUBMISSION",
      "EDIT_SUBMISSION",
      "CONFIRM_LOCK",
      "CONTINUE",
      "TICK",
      "RESTART",
    ],
    allowBack: false,
  },
  ability_resolution: {
    id: "ability_resolution",
    label: "Commit",
    title: "Armed means committed",
    body:
      "This question starts at 35 seconds — Fortify added five. Now a controlled demonstration: arm Fortify again and lock in the guided WRONG answer on purpose. You'll see the charge is consumed at resolution even though the effect never triggers. (The Golem answers instantly, so watch its first answer cut the shared timer by 5.)",
    announcement:
      "Commitment demonstration. This question starts at thirty-five seconds thanks to Fortify. Arm Fortify and lock the guided wrong answer on purpose.",
    timerMode: "running",
    permittedEvents: [
      "SELECT_ANSWER",
      "SELECT_ABILITY",
      "LOCK_SUBMISSION",
      "EDIT_SUBMISSION",
      "CONFIRM_LOCK",
      "CONTINUE",
      "TICK",
      "RESTART",
    ],
    allowBack: false,
  },
  level_two_choice: {
    id: "level_two_choice",
    label: "Level 2",
    title: "Level 2: choose your path",
    body:
      "You reached Level 2. Choose one ability for the rest of this match: Brace or Barrier. Your choice is permanent — the one you skip stays locked until Level 3 unlocks it automatically. Pick freely; both are good.",
    announcement:
      "Level two. Choose one ability for the rest of this match. Your choice is permanent.",
    timerMode: "paused",
    permittedEvents: ["CHOOSE_LEVEL_TWO", "CONFIRM_LEVEL_TWO", "CONTINUE", "RESTART"],
    allowBack: false,
  },
  level_three_unlock: {
    id: "level_three_unlock",
    label: "Level 3",
    title: "Push to Level 3",
    body:
      "Level 3 needs 66 XP. Two quick drill questions — no ability needed, save your charges. When you cross the threshold, the ability you didn't pick unlocks automatically.",
    announcement:
      "Drive to Level three. Sixty-six XP unlocks your final ability automatically.",
    timerMode: "running",
    permittedEvents: [
      "SELECT_ANSWER",
      "SELECT_ABILITY",
      "LOCK_SUBMISSION",
      "EDIT_SUBMISSION",
      "CONFIRM_LOCK",
      "CONTINUE",
      "TICK",
      "RESTART",
    ],
    allowBack: false,
  },
  victory_round: {
    id: "victory_round",
    label: "Victory",
    title: "Finish the match",
    body:
      "Reduce your opponent to 0 HP to win. One last question — arm any available ability or none, lock in, and land the final hit.",
    announcement: "Final round. Reduce the Golem to zero HP to win.",
    timerMode: "running",
    permittedEvents: [
      "SELECT_ANSWER",
      "SELECT_ABILITY",
      "LOCK_SUBMISSION",
      "EDIT_SUBMISSION",
      "CONFIRM_LOCK",
      "CONTINUE",
      "TICK",
      "RESTART",
    ],
    allowBack: false,
  },
  match_over: {
    id: "match_over",
    label: "Match over",
    title: "Victory!",
    body:
      "The Training Golem is at 0 HP. Correct answers deal damage; both players can deal damage in the same round; XP unlocks abilities; charges are limited; zero HP ends the match. This training match did not affect your rating, history, or permanent progression.",
    announcement:
      "Victory. The Training Golem is at zero HP. This training match did not affect your rating, history, or permanent progression.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: false,
  },
  queue_explanation: {
    id: "queue_explanation",
    label: "Queue",
    title: "How real matches start",
    body:
      "In real Ranked you'll enter a queue and get matched with another player. This screen is a simulation — no queue is running right now.",
    announcement: "The queue. Real Ranked matches you against another player.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: true,
  },
  reconnect_explanation: {
    id: "reconnect_explanation",
    label: "Reconnect",
    title: "If you disconnect",
    body:
      "Drop mid-match and you can rejoin — the match state lives on the server, so you resume where things stand. This is a simulation; nothing is connected.",
    announcement: "Reconnecting. Real matches can be resumed after a disconnect.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: true,
  },
  ads_pro_explanation: {
    id: "ads_pro_explanation",
    label: "Pro",
    title: "Ads and Pro",
    body:
      "Free players may see ads between matches; Pro removes them and adds perks. This is purely informational — nothing here shows ads or changes your account.",
    announcement: "Ads and Pro. Informational only; nothing changes on your account.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: true,
  },
  complete: {
    id: "complete",
    label: "Done",
    title: "Training complete",
    body:
      "You've finished Ranked training. Nothing was saved and nothing counted — replay any time, or head back to the Quiz hub when you're ready for the real thing.",
    announcement: "Training complete. You can replay the tutorial any time.",
    timerMode: "paused",
    permittedEvents: ["RESTART"],
    allowBack: false,
  },
};

export const stepIndex = (id: TutorialStepId): number => STEP_ORDER.indexOf(id);
export const nextStepId = (id: TutorialStepId): TutorialStepId | null =>
  STEP_ORDER[stepIndex(id) + 1] ?? null;
