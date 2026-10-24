/**
 * Academy Pulse — creator challenges ("play what the creator played").
 *
 * A creator challenge is honest only when two things are true:
 *
 *   REPRODUCIBLE  a viewer who opens it gets exactly the content the creator
 *                 got (same questions, same order, same rules);
 *   AUTHORITATIVE the creator's score is a server-recorded attempt on that
 *                 exact challenge, looked up by id, never typed in.
 *
 * The registry below records, per Mogzy challenge source, what is verified in
 * the code today. As of PULSE-2C (2026-10-24) NO source is both, so every
 * creator challenge is omitted and the creator is shown without one. A source
 * becomes usable by changing its entry here, with the evidence, in review.
 */
import type { ChallengeSourceId, CreatorChallengeRecord } from "./partner-contract";
import { TEXT_LIMITS, cleanText, parseInstant } from "./partner-validate";

export interface ChallengeSource {
  reproducible: boolean;
  /** A public read exists that returns one attempt's score by id. */
  scoreAuthority: boolean;
  /** Why, in one line, for the handoff and the omission detail. */
  evidence: string;
  /** The public route that opens a challenge by key. */
  href?: (key: string) => string;
  /** The shape a key must have. */
  key?: RegExp;
}

export const CHALLENGE_SOURCES: Readonly<Record<ChallengeSourceId, ChallengeSource>> = {
  "daily-challenge": {
    reproducible: false,
    scoreAuthority: false,
    evidence: "Only the Daily's shape/Journey is shared per day; per the DREP1 backend audit each child match draws its questions with its own random order seed (and DREP1's per-player avoidance, merged on the backend, varies them further), so two players are not guaranteed an identical Daily. Per-user Daily run history is an owner-only backend route.",
  },
  "more-challenges": {
    reproducible: false,
    scoreAuthority: false,
    evidence: "Bonus sessions (/quiz/more-challenges/:mode) are drawn per session; there is no seed or set id in the route.",
  },
  "tournament-arena": {
    reproducible: false,
    scoreAuthority: false,
    evidence: "Arena rooms (/quiz/arena/join/:code) are an admin beta, not deployed; rooms are short-lived and their scores are not publicly readable.",
  },
  "card-duel-room": {
    reproducible: false,
    scoreAuthority: false,
    evidence: "Champion Card Duel rooms (/quiz/stat-check/room/:inviteCode) are live head-to-head rooms, not a replayable fixed set.",
  },
};

export type ChallengeDecision =
  | { ok: true; challenge: { title: string; detail: string; href: string } }
  | { ok: false; reason: "challenge-not-reproducible" | "challenge-score-unverified" | "invalid-text"; detail: string };

/** Keep a creator challenge only when its source is verified and its score is an attempt on that source. */
export function validateCreatorChallenge(
  rec: CreatorChallengeRecord,
  sources: Readonly<Record<string, ChallengeSource>> = CHALLENGE_SOURCES,
): ChallengeDecision {
  const title = cleanText(rec.title, TEXT_LIMITS.cta);
  const detail = cleanText(rec.detail, TEXT_LIMITS.detail);
  if (!title || !detail) return { ok: false, reason: "invalid-text", detail: "Challenge title or detail is empty or too long." };

  const source = sources[rec.ref?.source];
  if (!source || !source.reproducible || !source.href || !source.key) {
    return { ok: false, reason: "challenge-not-reproducible", detail: source?.evidence ?? `Unknown challenge source "${rec.ref?.source}".` };
  }
  if (typeof rec.ref.key !== "string" || !source.key.test(rec.ref.key)) {
    return { ok: false, reason: "challenge-not-reproducible", detail: "Challenge key does not match its source's format." };
  }
  const s = rec.score;
  if (
    !source.scoreAuthority
    || !s
    || s.source !== rec.ref.source
    || typeof s.attemptId !== "string"
    || s.attemptId.trim() === ""
    || !Number.isFinite(s.value)
    || parseInstant(s.verifiedAt) === null
  ) {
    return { ok: false, reason: "challenge-score-unverified", detail: "The creator's score is not a verified attempt on this exact challenge." };
  }
  return { ok: true, challenge: { title, detail, href: source.href(rec.ref.key) } };
}
