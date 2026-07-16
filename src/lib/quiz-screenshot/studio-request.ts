/**
 * Content Studio job-request validation. Pure module: the local studio server
 * feeds it untrusted JSON bodies; everything is checked against allowlists
 * before any generation code runs. No shell strings are ever built from this
 * input — the validated request is passed to the in-process generation
 * service as structured data.
 */
import { FORMAT_KEYS } from "./formats";
import { parseStates } from "./states";
import { isPostType } from "./content-posts";
import { isDifficultyTier, type DifficultyTier } from "./difficulty";
import {
  CHALLENGE_MAX_QUESTIONS,
  CHALLENGE_MIN_QUESTIONS,
  DAILY_PREFIX_MAX,
  isMidCtaVariantId,
  isRepeatVariantId,
  type MidCtaVariantId,
  type RepeatVariantId,
} from "./challenge";
import { MAX_BATCH_LIMIT } from "./cli";

export const STUDIO_MODES = [
  "classic",
  "single-question",
  "answer-reveal",
  "multi-question",
  "daily-package",
] as const;
export type StudioModeKey = (typeof STUDIO_MODES)[number];

export const STUDIO_PLATFORMS = [
  "generic",
  "tiktok",
  "instagram",
  "youtube",
  "twitch",
  "x",
  "facebook",
  "reddit",
] as const;
export type StudioPlatform = (typeof STUDIO_PLATFORMS)[number];

export const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/;
export const QUESTION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export type StudioJobRequest = {
  mode: StudioModeKey;
  /** Ordered question ids. For daily-package: the challenge list (the
   *  featured question is carried separately). */
  questionIds: string[];
  runId?: string;
  overwrite: boolean;
  formats: string[];
  /** classic mode only. */
  states?: string[];
  difficulty: DifficultyTier | null;
  difficultyOverrides: Record<string, DifficultyTier>;
  platform: StudioPlatform;
  challenge: {
    repeatVariant: RepeatVariantId | null;
    midCtaVariant: MidCtaVariantId | null;
  };
  daily?: {
    featuredQuestionId: string;
    reuseFeaturedAsOpener: boolean;
  };
};

export type StudioJobValidation =
  | { ok: true; request: StudioJobRequest }
  | { ok: false; errors: string[] };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Validate an untrusted job body into a structured request or errors. */
export function validateStudioJob(body: unknown): StudioJobValidation {
  const errors: string[] = [];
  const b = asRecord(body);
  if (!b) return { ok: false, errors: ["Request body must be a JSON object"] };

  // Mode
  const mode = b.mode;
  if (typeof mode !== "string" || !(STUDIO_MODES as readonly string[]).includes(mode)) {
    return { ok: false, errors: [`Unknown mode "${String(mode)}" (valid: ${STUDIO_MODES.join(", ")})`] };
  }
  const m = mode as StudioModeKey;

  // Question ids: ordered, validated, deduped.
  const rawIds = Array.isArray(b.questionIds) ? b.questionIds : null;
  const questionIds: string[] = [];
  if (!rawIds) {
    errors.push("questionIds must be an array of question ids");
  } else {
    for (const id of rawIds) {
      const s = typeof id === "number" ? String(id) : id;
      if (typeof s !== "string" || !QUESTION_ID_RE.test(s)) {
        errors.push(`Invalid question id "${String(id)}"`);
      } else {
        questionIds.push(s);
      }
    }
    if (new Set(questionIds).size !== questionIds.length) {
      errors.push("questionIds contains duplicates");
    }
  }

  // Per-mode count rules.
  if (m === "multi-question") {
    if (questionIds.length < CHALLENGE_MIN_QUESTIONS || questionIds.length > CHALLENGE_MAX_QUESTIONS) {
      errors.push(
        `multi-question needs ${CHALLENGE_MIN_QUESTIONS}-${CHALLENGE_MAX_QUESTIONS} questions (got ${questionIds.length})`,
      );
    }
  } else if (m !== "daily-package" && questionIds.length === 0) {
    errors.push("Select at least one question");
  }
  if (questionIds.length > MAX_BATCH_LIMIT) {
    errors.push(`Too many questions (max ${MAX_BATCH_LIMIT})`);
  }

  // Run id.
  let runId: string | undefined;
  if (b.runId !== undefined && b.runId !== null && b.runId !== "") {
    if (typeof b.runId !== "string" || !RUN_ID_RE.test(b.runId)) {
      errors.push(
        "Invalid run id — 1-64 letters, digits, hyphens, or underscores (no paths)",
      );
    } else {
      runId = b.runId;
      if (m === "daily-package" && runId.length > DAILY_PREFIX_MAX) {
        errors.push(`Daily-package run prefix too long (max ${DAILY_PREFIX_MAX} chars)`);
      }
    }
  }

  // Formats (social + audit keys from the registry only).
  let formats: string[] = ["mobile-social"];
  if (b.formats !== undefined) {
    if (!Array.isArray(b.formats) || !b.formats.length) {
      errors.push("formats must be a non-empty array");
    } else {
      const bad = b.formats.filter((f) => typeof f !== "string" || !FORMAT_KEYS.includes(f));
      if (bad.length) errors.push(`Unknown format(s): ${bad.join(", ")}`);
      else if (new Set(b.formats).size !== b.formats.length) errors.push("formats contains duplicates");
      else formats = b.formats as string[];
    }
  }

  // States — classic mode only.
  let states: string[] | undefined;
  if (b.states !== undefined) {
    if (m !== "classic") {
      errors.push(`states only applies to classic mode (mode is ${m})`);
    } else if (!Array.isArray(b.states) || b.states.some((s) => typeof s !== "string")) {
      errors.push("states must be an array of state names");
    } else {
      try {
        states = parseStates((b.states as string[]).join(","));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Difficulty default + per-question overrides.
  let difficulty: DifficultyTier | null = null;
  if (b.difficulty !== undefined && b.difficulty !== null && b.difficulty !== "") {
    if (!isDifficultyTier(b.difficulty)) errors.push(`Unknown difficulty "${String(b.difficulty)}"`);
    else difficulty = b.difficulty;
  }
  const difficultyOverrides: Record<string, DifficultyTier> = {};
  const rawOverrides = asRecord(b.difficultyOverrides);
  if (b.difficultyOverrides !== undefined && !rawOverrides) {
    errors.push("difficultyOverrides must be an object of questionId → tier");
  } else if (rawOverrides) {
    for (const [qid, tier] of Object.entries(rawOverrides)) {
      if (!QUESTION_ID_RE.test(qid)) errors.push(`difficultyOverrides has invalid question id "${qid}"`);
      else if (!isDifficultyTier(tier)) errors.push(`difficultyOverrides["${qid}"] has unknown tier "${String(tier)}"`);
      else difficultyOverrides[qid] = tier;
    }
  }

  // Platform (CTA wording context; generic default, no handles anywhere).
  let platform: StudioPlatform = "generic";
  if (b.platform !== undefined) {
    if (
      typeof b.platform !== "string" ||
      !(STUDIO_PLATFORMS as readonly string[]).includes(b.platform)
    ) {
      errors.push(`Unknown platform "${String(b.platform)}"`);
    } else {
      platform = b.platform as StudioPlatform;
    }
  }

  // Challenge options.
  const challenge: StudioJobRequest["challenge"] = { repeatVariant: null, midCtaVariant: null };
  const rawChallenge = asRecord(b.challenge);
  if (b.challenge !== undefined && !rawChallenge) {
    errors.push("challenge must be an object");
  } else if (rawChallenge) {
    if (rawChallenge.repeatVariant != null) {
      if (!isRepeatVariantId(rawChallenge.repeatVariant)) errors.push("Unknown challenge.repeatVariant");
      else challenge.repeatVariant = rawChallenge.repeatVariant;
    }
    if (rawChallenge.midCtaVariant != null) {
      if (!isMidCtaVariantId(rawChallenge.midCtaVariant)) errors.push("Unknown challenge.midCtaVariant");
      else challenge.midCtaVariant = rawChallenge.midCtaVariant;
    }
  }

  // Daily-package options.
  let daily: StudioJobRequest["daily"];
  if (m === "daily-package") {
    const rawDaily = asRecord(b.daily);
    if (!rawDaily) {
      errors.push("daily-package requires a daily options object");
    } else {
      const featured =
        typeof rawDaily.featuredQuestionId === "number"
          ? String(rawDaily.featuredQuestionId)
          : rawDaily.featuredQuestionId;
      if (typeof featured !== "string" || !QUESTION_ID_RE.test(featured)) {
        errors.push("daily.featuredQuestionId is required and must be a valid question id");
      } else {
        const reuse = rawDaily.reuseFeaturedAsOpener === true;
        const challengeCount = questionIds.length + (reuse ? 1 : 0);
        if (reuse && questionIds.includes(featured)) {
          errors.push("Featured question must not also appear in the challenge list when reused as opener");
        }
        if (
          challengeCount < CHALLENGE_MIN_QUESTIONS ||
          challengeCount > CHALLENGE_MAX_QUESTIONS
        ) {
          errors.push(
            `Daily challenge needs ${CHALLENGE_MIN_QUESTIONS}-${CHALLENGE_MAX_QUESTIONS} questions including the opener (got ${challengeCount})`,
          );
        }
        daily = { featuredQuestionId: featured, reuseFeaturedAsOpener: reuse };
      }
    }
  } else if (b.daily !== undefined) {
    errors.push("daily options only apply to daily-package mode");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    request: {
      mode: m,
      questionIds,
      runId,
      overwrite: b.overwrite === true,
      formats,
      states,
      difficulty,
      difficultyOverrides,
      platform,
      challenge,
      daily,
    },
  };
}
