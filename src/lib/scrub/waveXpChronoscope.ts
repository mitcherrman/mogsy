/**
 * SCRUB — the Wave / XP content family for the Chronoscope.
 *
 * Maps the Ranked `scrub.v1` wire (SCRUB-S2) onto the content-neutral
 * primitive:
 *
 *   * `toChronoscopePublic` — the PRE-REVEAL content: the server's public
 *     block (`ScrubBlockView`), i.e. the lane's public state at every wave
 *     (composition, cannon, the engine's level after the wave, the cumulative
 *     XP and the thresholds bracketing it). The block has no field that could
 *     hold the canonical checkpoint, a breakpoint note or the proof — the
 *     reader refuses those keys outright.
 *   * `toChronoscopeReveal` — the POST-LOCK reveal: the server's
 *     `ScrubChallengeReveal` (the checkpoint it recorded, its verdict, the
 *     canonical checkpoint, the traverse path and the authority's before/after
 *     readings) plus one host-worded teaching line.
 *
 * NO WAVE OR XP MATH AND NO GRADING. Every figure on screen is an authority
 * string and the verdict is the server's `is_correct`. The one arithmetic in
 * this file is the level gauge's fill, a RATIO of three authority figures
 * (cumulative − floor) / (ceiling − floor), which draws how full the vessel
 * is and decides nothing (pinned by a source test).
 *
 * Ported from SCRUB-S1 (`e489da4b`), where the same mapping read the
 * prototype capture; the scene, the wording and the gauge are unchanged.
 */
import type {
  ChronoscopeCheckpoint, ChronoscopeProofReading, ChronoscopePublic, ChronoscopeReveal,
} from "@/lib/interaction-grammar/types";
import type {
  ScrubBlockView, ScrubChallengeReveal, ScrubCheckpointView, ScrubProofReadingView, ScrubProofView,
} from "@/lib/ranked-public/contracts";

export type WaveXpLane = "solo" | "duo";

/** What the lens draws at one checkpoint. Public lane state only. */
export interface WaveXpScene {
  lane: WaveXpLane;
  melee: number;
  caster: number;
  cannon: number;
  cannonWave: boolean;
  level: number;
  /** 0..1, how far the lane's cumulative XP is into its current level. */
  levelFill: number;
  /** The authority's cumulative XP string ("774.15"). */
  xpDisplay: string;
  /** The authority's wave XP string ("+181.35"). */
  waveXpDisplay: string;
  /** The cumulative XP the NEXT level needs, or null at the cap. */
  nextLevelXpDisplay: string | null;
}

export const waveLabel = (wave: number) => `Wave ${wave}`;

/**
 * The gauge's fill: how far the cumulative XP is between the level's floor
 * and ceiling. A ratio for drawing; the LEVEL is the authority's.
 */
export function levelFill(cumulative: string, floor: string | null, ceiling: string | null): number {
  if (floor === null || ceiling === null) return 1;
  const span = Number(ceiling) - Number(floor);
  if (!(span > 0)) return 1;
  const into = Number(cumulative) - Number(floor);
  return Math.min(1, Math.max(0, into / span));
}

export function toWaveXpScene(cp: ScrubCheckpointView, lane: WaveXpLane): WaveXpScene {
  return {
    lane,
    melee: cp.meleeCount,
    caster: cp.casterCount,
    cannon: cp.cannonCount,
    cannonWave: cp.isCannonWave,
    level: cp.level,
    levelFill: levelFill(cp.cumulativeXp, cp.levelFloorXp, cp.levelCeilingXp),
    xpDisplay: cp.cumulativeXp,
    waveXpDisplay: `+${cp.waveXp}`,
    nextLevelXpDisplay: cp.levelCeilingXp,
  };
}

const LANE_WORD: Record<WaveXpLane, string> = { solo: "Solo lane", duo: "Duo lane" };

/** The pre-reveal content for one segment: public lane state at every wave. */
export function toChronoscopePublic(block: ScrubBlockView): ChronoscopePublic<WaveXpScene> {
  const lane = block.objective.lane;
  const cps = block.checkpoints;
  const checkpoints: ChronoscopeCheckpoint<WaveXpScene>[] = cps.map((cp) => {
    const scene = toWaveXpScene(cp, lane);
    return {
      token: cp.token,
      label: waveLabel(cp.waveNumber),
      clock: cp.spawnTimeDisplay,
      emphasised: cp.isCannonWave,
      reading: [
        { label: "Level", value: String(scene.level) },
        { label: "XP", value: scene.xpDisplay },
      ],
      scene,
    };
  });
  const last = cps[cps.length - 1].waveNumber;
  const marks = [1, 5, 10, 15].filter((w) => w <= last);
  const patch = block.source.patch ? ` · Patch ${block.source.patch}` : "";
  return {
    eyebrow: `Chronoscope · ${LANE_WORD[lane]}${patch}`,
    prompt: block.prompt,
    unitLabel: block.unitLabel,
    checkpoints,
    railMarks: marks.map((w) => ({
      index: cps.findIndex((c) => c.waveNumber === w),
      text: cps.find((c) => c.waveNumber === w)?.spawnTimeDisplay ?? "",
    })).filter((m) => m.index >= 0),
    footnote: block.footnote,
  };
}

function proofReading(
  reading: ScrubProofReadingView, proof: ScrubProofView, role: "before" | "after",
): ChronoscopeProofReading {
  const caption = reading.satisfied
    ? (reading.breakpointNote ?? `Level ${proof.targetLevel} reached`)
    : proof.cannonOnly && !reading.isCannonWave ? "not a cannon wave"
      : proof.thresholdXp ? `still below ${proof.thresholdXp} XP` : `still below Level ${proof.targetLevel}`;
  return {
    token: reading.token,
    title: `${waveLabel(reading.waveNumber)} · ${reading.spawnTimeDisplay}`,
    lines: [
      { label: "Level", value: reading.level === null ? "—" : String(reading.level) },
      { label: "XP", value: reading.cumulativeXp },
    ],
    satisfied: role === "after" ? true : reading.satisfied,
    caption,
  };
}

/**
 * The locked checkpoint, as the SERVER recorded it: the head of its traverse
 * path (identical to `checkpoint` on every reveal the server emits).
 */
export function lockedTokenOf(reveal: ScrubChallengeReveal): string | null {
  return reveal.traversePath[0] ?? reveal.checkpoint;
}

/** The post-lock reveal. Every figure and the verdict are the server's. */
export function toChronoscopeReveal(block: ScrubBlockView, reveal: ScrubChallengeReveal): ChronoscopeReveal {
  const proof = reveal.proof;
  const canonical = reveal.canonicalCheckpoint;
  const lockedToken = lockedTokenOf(reveal) ?? canonical;
  const locked = block.checkpoints.find((c) => c.token === lockedToken) ?? null;
  const canonicalCp = block.checkpoints.find((c) => c.token === canonical) ?? null;
  const canonicalWord = canonicalCp ? waveLabel(canonicalCp.waveNumber).toLowerCase() : canonical;
  let note: string | null = null;
  if (reveal.isCorrect === false && locked) {
    const lockedWord = waveLabel(locked.waveNumber);
    if (reveal.satisfiedCheckpoints.includes(locked.token)) {
      note = `${lockedWord} reaches it too — ${canonicalWord} was first.`;
    } else if (proof.cannonOnly && !locked.isCannonWave) {
      note = `${lockedWord} is not a cannon wave.`;
    } else {
      note = `At ${lockedWord.toLowerCase()} the lane was still Level ${locked.level}.`;
    }
  }
  const threshold = proof.thresholdXp;
  const thresholdLine = threshold === null ? null : proof.cannonOnly
    ? `Level ${proof.targetLevel} needs ${threshold} XP · cannon waves every third wave`
    : `Level ${proof.targetLevel} needs ${threshold} cumulative XP`;
  return {
    lockedToken,
    canonicalToken: canonical,
    isCorrect: reveal.isCorrect,
    proof: {
      before: proof.before ? proofReading(proof.before, proof, "before") : null,
      after: proofReading(proof.after, proof, "after"),
      thresholdLine,
    },
    note,
  };
}
