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
    label: "Ability",
    title: "Your starter ability: Fortify",
    body:
      "Tanks start with Fortify: answer correctly with it armed and you gain five extra seconds on the next question. Arming an ability commits a charge — it's spent when the round resolves, hit or miss. You can also lock in with no ability at all.",
    announcement: "Your starter ability, Fortify. Arming an ability commits its charge.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: true,
  },
  ability_resolution: {
    id: "ability_resolution",
    label: "Resolve",
    title: "Abilities resolve at reveal",
    body:
      "Armed abilities take effect when the round resolves, alongside the answers. Charges are limited per match, so spend them where they matter.",
    announcement: "Ability resolution. Armed abilities apply at the reveal.",
    timerMode: "simulated",
    permittedEvents: NAV,
    allowBack: false,
  },
  level_two_choice: {
    id: "level_two_choice",
    label: "Level 2",
    title: "Level 2: choose your path",
    body:
      "At Level 2 you choose ONE of two abilities: Brace (reduce incoming damage on a bad round) or Barrier (a one-time shield). The choice is permanent for the match — pick freely.",
    announcement: "Level two. Choose one of two abilities. The choice is permanent.",
    timerMode: "paused",
    permittedEvents: ["CHOOSE_LEVEL_TWO", "CONFIRM_LEVEL_TWO", "RESTART"],
    allowBack: false,
  },
  level_three_unlock: {
    id: "level_three_unlock",
    label: "Level 3",
    title: "Level 3: the set completes",
    body:
      "Level 3 automatically unlocks the ability you didn't pick at Level 2. No choice this time — your kit simply completes.",
    announcement: "Level three. The remaining ability unlocks automatically.",
    timerMode: "paused",
    permittedEvents: NAV,
    allowBack: false,
  },
  victory_round: {
    id: "victory_round",
    label: "Victory",
    title: "Finish the match",
    body:
      "One last round: land your answer and bring the Golem to zero HP to win the training match.",
    announcement: "Final round. Reduce the Golem to zero HP to win.",
    timerMode: "running",
    permittedEvents: ["SELECT_ANSWER", "SELECT_ABILITY", "LOCK_SUBMISSION", "RESTART"],
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
