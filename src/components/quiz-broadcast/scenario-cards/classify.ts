/**
 * Subject classification, spoiler heuristics, and scenario selection.
 *
 * classifySubject / isSpoilerSubject / deriveRevealSubject / inferKindFromQuestion
 * are moved verbatim from BroadcastRenderer — their contracts are load-bearing
 * (reveal timeline, spoiler gating) and must not drift.
 *
 * selectScenario is the ScenarioCard framework entry: it decides which card
 * variant renders, in priority order:
 *   1. metadata.presentation.scenario_type (explicit, optional)
 *   2. metadata.assets.subject.type (e.g. "combat_cooldown")
 *   3. legacy classifySubject fallback (champion / collectible / placeholder)
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { resolveEnvironmentSceneArt } from "@/lib/question-surface/environmentScenes";
import { getQuestionMediaEntities } from "./questionMediaEntities";
import type {
  ClassifiedSubject,
  CombatCooldownSubject,
  EnvironmentScene,
  EnvironmentSubject,
  ItemAnalysisSubject,
  MatchupSubject,
  SummonerSpellSubject,
  ScenarioSelection,
  SubjectKind,
} from "./types";

export function normalizeLabel(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function questionChoices(question: QuizQuestion): string[] {
  return (question.choices ?? []).map((c) =>
    typeof c === "string" ? c : typeof c === "object" && c && "label" in c ? String((c as { label: unknown }).label) : "",
  );
}

function questionText(question: QuizQuestion): string {
  return String(question.question_text ?? question.question_key ?? "").toLowerCase();
}

export function classifySubject(question: QuizQuestion): ClassifiedSubject {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;

  //
  // NEW KOS PATH
  //
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as Record<string, unknown> | undefined;

  if (subject) {
    switch (subject.type) {
      case "champion":
        return {
          kind: "champion",
          label: (subject.name as string | undefined) ?? (subject.id as string | undefined),
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "item":
        return {
          kind: "item",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "rune":
        return {
          kind: "rune",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      // "summoner_spell" is the canonical type emitted by the backend's
      // quiz/asset_metadata.summoner_spell_subject_assets(). It renders through
      // the same collectible treatment as an ability, so it joins this case
      // rather than forking a second convention on the backend.
      case "spell":
      case "summoner_spell":
      case "ability":
        return {
          kind: "spell",
          label: (subject.name as string | undefined) ?? (subject.slot as string | undefined),
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "objective":
        return {
          kind: "objective",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      // MAA1 Phase 4. Same shape as "objective" and deliberately so: the
      // backend emits identity (id, name, icon) and no numbers, and this
      // renders through the same CollectibleCard treatment. There is no
      // minion-specific card, because "one framed portrait plus a label" is
      // already the right card for it.
      case "minion":
        return {
          kind: "minion",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      // MAA1 Phase 5. Read here, and not only by the environment reader
      // below, because this is the function `isSpoilerSubject` is handed: a
      // row whose answer IS a structure ("which turret type has the least
      // health?") can only be caught by comparing the subject's LABEL against
      // the choices, and an unclassified subject has no label to compare. The
      // backend already refuses those four rows a subject, so this is the
      // second lock on the same door rather than the first.
      // JPM1 — a jungle companion. Classified for the same reason as
      // "structure": the spoiler check compares the LABEL against the choices.
      case "jungle_pet":
        return {
          kind: "jungle_pet",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };

      case "structure":
        return {
          kind: "structure",
          label: subject.name as string | undefined,
          iconUrl: resolveQuizAssetUrl(subject.icon as string | undefined),
        };
    }
  }

  //
  // ---------- Legacy fallback ----------
  //

  const champion =
    typeof meta.champion === "string"
      ? meta.champion
      : typeof meta.champion_name === "string"
        ? meta.champion_name
        : undefined;

  const itemIcon =
    (typeof meta.item_icon === "string" && meta.item_icon) ||
    (typeof meta.image_path === "string" && question.category?.toLowerCase().includes("item")
      ? meta.image_path
      : undefined);

  const runeIcon = typeof meta.rune_icon === "string" ? meta.rune_icon : undefined;

  const spellIcon =
    (typeof meta.spell_icon === "string" && meta.spell_icon) ||
    (typeof meta.summoner_icon === "string" ? meta.summoner_icon : undefined) ||
    (typeof meta.ability_icon === "string" ? meta.ability_icon : undefined);

  const objective = typeof meta.objective_image === "string" ? meta.objective_image : undefined;

  const category = String(question.category ?? "").toLowerCase();
  const text = questionText(question);
  const isChampionQuestion = category.includes("champion") || /\bchampion\b/.test(text);

  if (champion && isChampionQuestion) return { kind: "champion", label: champion };

  if (itemIcon && !isChampionQuestion)
    return {
      kind: "item",
      label: (meta.item_name as string | undefined) || "Item",
      iconUrl: resolveQuizAssetUrl(itemIcon as string),
    };

  if (runeIcon)
    return {
      kind: "rune",
      label: (meta.rune_name as string | undefined) || "Rune",
      iconUrl: resolveQuizAssetUrl(runeIcon),
    };

  if (spellIcon)
    return {
      kind: "spell",
      label: (meta.spell_name as string | undefined) || (meta.ability_name as string | undefined) || "Ability",
      iconUrl: resolveQuizAssetUrl(spellIcon),
    };

  if (objective)
    return {
      kind: "objective",
      label: (meta.objective_name as string | undefined) || "Objective",
      iconUrl: resolveQuizAssetUrl(objective),
    };

  if (champion)
    return {
      kind: "champion",
      label: champion,
    };

  if (question.image_path) {
    return {
      kind: isChampionQuestion ? "champion" : "item",
      iconUrl: resolveQuizAssetUrl(question.image_path),
    };
  }

  return { kind: "none" };
}

export function inferKindFromQuestion(question: QuizQuestion): SubjectKind {
  const t = questionText(question);
  const cat = String(question.category ?? "").toLowerCase();
  if (/\bchampion\b/.test(t) || cat.includes("champion")) return "champion";
  if (/\bitem\b/.test(t) || cat.includes("item")) return "item";
  if (/\brune\b/.test(t) || cat.includes("rune")) return "rune";
  if (/\b(ability|spell|passive|ultimate|summoner)\b/.test(t) || cat.includes("spell") || cat.includes("ability"))
    return "spell";
  if (/\bobjective\b/.test(t) || cat.includes("objective")) return "objective";
  return "none";
}

export function isSpoilerSubject(
  question: QuizQuestion,
  subject: { kind: SubjectKind; label?: string },
  correctAnswer: string | null,
): boolean {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;

  // KOS v1 presentation contract.
  // If metadata.presentation exists, it is the source of truth.
  const presentation = meta.presentation as Record<string, unknown> | undefined;
  if (presentation && typeof presentation === "object") {
    if (typeof presentation.spoiler === "boolean") {
      return presentation.spoiler;
    }

    if (presentation.timing === "reveal" || presentation.role === "answer") {
      return true;
    }

    if (
      presentation.timing === "question" ||
      presentation.role === "context" ||
      presentation.role === "clue" ||
      presentation.role === "decorative"
    ) {
      return false;
    }
  }

  // Legacy explicit overrides.
  if (meta.spoiler === true || meta.subject_is_answer === true) return true;
  if (meta.spoiler === false || meta.subject_is_context === true) return false;

  const text = questionText(question);

  // Context cues — subject describes the question, not the answer.
  const statCue =
    /\b(cost|price|gold|stat|range|cooldown|mana|health|hp|ad|ap|armor|mr|magic resist|attack speed|move(?:ment)? speed|damage|recipe|builds? from|builds? into)\b/.test(
      text,
    );
  if (statCue) return false;

  // Identification: "identify this ability / name this spell" → icon is the clue.
  if (subject.kind === "spell" && /\b(identify|name|guess)\b[^.?!]*\b(ability|spell|passive|ultimate)\b/.test(text)) {
    return false;
  }

  const choices = questionChoices(question).map(normalizeLabel).filter(Boolean);
  const subjectLc = normalizeLabel(subject.label);
  const answerLc = normalizeLabel(correctAnswer);

  // Direct: subject label equals an answer choice or the correct answer.
  if (subject.label && subject.kind !== "none") {
    if (answerLc && subjectLc === answerLc) return true;
    if (subjectLc && choices.includes(subjectLc)) return true;
  }

  // Cross-kind: "which champion has this ability?" → ability icon spoils champion answer.
  if (subject.kind === "spell" && /\b(which|what)\s+champion\b[^.?!]*\b(ability|spell|passive|ultimate)\b/.test(text)) {
    return true;
  }
  if (/\bhas this (ability|spell|passive|ultimate|rune|item)\b/.test(text)) {
    return true;
  }

  // Identification intent matching subject noun.
  const idIntent = /\b(which|what|name the|identify|guess)\b/.test(text);
  if (idIntent) {
    if (subject.kind === "champion" && /\bchampion\b/.test(text)) return true;
    if (subject.kind === "item" && /\bitem\b/.test(text)) return true;
    if (subject.kind === "rune" && /\brune\b/.test(text)) return true;
    if (subject.kind === "objective" && /\bobjective\b/.test(text)) return true;
  }

  return false;
}

export function deriveRevealSubject(
  question: QuizQuestion,
  base: ClassifiedSubject,
  correctAnswer: string | null,
): ClassifiedSubject {
  if (!correctAnswer) return base;

  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const presentation = meta.presentation as Record<string, unknown> | undefined;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as Record<string, unknown> | undefined;

  const looksChamp =
    inferKindFromQuestion(question) === "champion" ||
    /\bchampion\b/.test(questionText(question)) ||
    String(question.category ?? "")
      .toLowerCase()
      .includes("champion");

  // KOS answer-reveal champion questions should reveal the answer name explicitly.
  if (
    looksChamp &&
    (presentation?.role === "answer" || presentation?.timing === "reveal" || base.kind === "champion")
  ) {
    return {
      kind: "champion",
      label: (subject?.name as string | undefined) ?? (meta.champion_name as string | undefined) ?? correctAnswer,
      iconUrl: subject?.icon ? resolveQuizAssetUrl(subject.icon as string) : base.iconUrl,
    };
  }

  // If we have nothing to show but the question looks like a champion-id and the answer is a champion name,
  // upgrade to a champion subject so the splash appears on reveal.
  if (base.kind === "none" && looksChamp) {
    return { kind: "champion", label: correctAnswer };
  }

  return base;
}

export function getCombatCooldownSubject(question: QuizQuestion): CombatCooldownSubject | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as
    | Record<string, unknown>
    | undefined;
  if (!subject || subject.type !== "combat_cooldown") return null;
  const champion = subject.champion as string | undefined;
  if (!champion) return null;

  const rawItems = Array.isArray(subject.item_icons) ? subject.item_icons : [];
  return {
    champion,
    // Absent whenever the backend withheld the slot — an ability-identity
    // question, where the slot IS the answer. The card then labels the ability
    // without a slot badge; nothing here may guess one back.
    abilitySlot: subject.ability_slot as string | undefined,
    abilityName: subject.ability_name as string | undefined,
    badge: typeof subject.badge === "string" && subject.badge ? subject.badge : undefined,
    level: (subject.level as number | undefined) ?? (meta.level as number | undefined),
    abilityRank: (subject.ability_rank as number | undefined) ?? (meta.ability_rank as number | undefined),
    championIcon: resolveQuizAssetUrl(subject.champion_icon as string | undefined),
    championSplash: resolveQuizAssetUrl(subject.champion_splash as string | undefined),
    abilityIcon: resolveQuizAssetUrl(subject.ability_icon as string | undefined),
    itemIcons: rawItems.map((it) => {
      const item = it as Record<string, unknown>;
      return {
        name: String(item.name ?? ""),
        icon: resolveQuizAssetUrl(item.icon as string | undefined),
        effect: typeof item.effect === "string" ? item.effect : undefined,
      };
    }),
    totalAbilityHaste:
      typeof meta.total_ability_haste === "number" ? meta.total_ability_haste : undefined,
    // Additive: null for every payload frozen before RA3-MEDIA-P4, so the
    // fields above stay the sole input for legacy questions.
    entities: getQuestionMediaEntities(question),
  };
}

/**
 * Parse a MATCHUP subject, or null.
 *
 * Same shape of rule as `getCombatCooldownSubject`: the card is chosen by the
 * subject TYPE the backend/adapter declares, never by prompt text or category.
 * Both champion names are required — a matchup with one side is not a matchup,
 * and drawing it as one would misstate the premise.
 */
export function getMatchupSubject(question: QuizQuestion): MatchupSubject | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as
    | Record<string, unknown>
    | undefined;
  if (!subject || subject.type !== "matchup") return null;
  const championA = subject.champion_a as string | undefined;
  const championB = subject.champion_b as string | undefined;
  if (!championA || !championB) return null;
  return {
    championA,
    championB,
    championASplash: resolveQuizAssetUrl(subject.champion_a_splash as string | undefined),
    championBSplash: resolveQuizAssetUrl(subject.champion_b_splash as string | undefined),
    abilitySlot: subject.ability_slot as string | undefined,
    abilityName: subject.ability_name as string | undefined,
    abilityNameA: subject.ability_name_a as string | undefined,
    abilityNameB: subject.ability_name_b as string | undefined,
    abilityIcon: resolveQuizAssetUrl(subject.ability_icon as string | undefined),
    metricLabel: typeof subject.metric_label === "string" ? subject.metric_label : undefined,
    level: subject.level as number | undefined,
    abilityRank: subject.ability_rank as number | undefined,
    badge: typeof subject.badge === "string" && subject.badge ? subject.badge : undefined,
  };
}

/**
 * Parse a summoner-spell subject, or null.
 *
 * TWO BACKEND TYPES, ONE CARD
 * `summoner_spell_haste` is the SSM slice's payload (spell + haste sources +
 * the stated total). `summoner_spell_subject` is an ordinary `quiz.v1`
 * summoner-spell question — today `summoner_spell_cooldown` — where the spell
 * is the whole premise and there is nothing further to state.
 *
 * They are read by ONE reader rather than two because they are one question
 * shape: "this round is about this spell". A second reader would be a second
 * place to keep the disclosure rule, and the rule is identical in both — the
 * measured value is the answer and never appears.
 *
 * Deliberately NOT matched by prefix or by "starts with summoner_spell": an
 * explicit set means a future backend type cannot acquire this card by being
 * named plausibly.
 *
 * The spell is required. A card built from haste sources alone would state a
 * premise the question does not have, and a card with no spell states nothing.
 * The backend already fails closed the same way (4 of the 9 certified spells
 * have no canonical `summoner_spells` row), so this guard is belt-and-braces.
 */
const SUMMONER_SPELL_SUBJECT_TYPES = new Set([
  "summoner_spell_haste",
  "summoner_spell_subject",
]);

export function getSummonerSpellSubject(
  question: QuizQuestion,
): SummonerSpellSubject | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as
    | Record<string, unknown>
    | undefined;
  if (!subject || typeof subject.type !== "string") return null;
  if (!SUMMONER_SPELL_SUBJECT_TYPES.has(subject.type)) return null;
  const spell = subject.spell as string | undefined;
  if (!spell) return null;
  const rawSources = Array.isArray(subject.sources) ? subject.sources : [];
  return {
    spell,
    spellIcon: resolveQuizAssetUrl(subject.spell_icon as string | undefined),
    sources: rawSources.flatMap((entry) => {
      const s = entry as Record<string, unknown>;
      const kind = s.kind === "rune" || s.kind === "item" ? s.kind : null;
      if (!kind || typeof s.name !== "string") return [];
      return [{
        name: s.name,
        icon: resolveQuizAssetUrl(s.icon as string | undefined),
        kind,
      }];
    }),
    totalHaste: typeof subject.total_haste === "number" ? subject.total_haste : undefined,
    badge: typeof subject.badge === "string" && subject.badge ? subject.badge : undefined,
  };
}

/**
 * Parse an ENVIRONMENT subject, or null.
 *
 * WHY THIS READER EXISTS
 * `classifySubject` already resolves these rows — it returns `kind: "minion"`
 * or `kind: "objective"` with the portrait the backend sent. What it could not
 * do is get them a CARD: both fell through to `collectible`, which draws one
 * small framed tile and nothing else. That is a complete card for "which rune
 * is this?" and it is the same empty-box problem RIV2 fixed for the item and
 * the summoner-spell pass fixed for the spell — a 128x128 portrait alone in a
 * ~700x310 panel.
 *
 * So this is a SELECTION reader, not a new classification. It reads the same
 * `assets.subject` the classifier reads and narrows it to the environment
 * types, so the selector can hand those rows the shared subject-media
 * composition instead.
 *
 * THE ICON IS REQUIRED, deliberately. The whole composition — the focal
 * subject, the oversized echo, the medallion the echo is lit against — is
 * driven by the subject's own art. With no portrait there is no picture to
 * build and the honest answer is the compact band, which is exactly where a
 * media-free environment row already goes today. A card assembled around a "?"
 * tile would be the giant empty rectangle wearing a gold frame.
 *
 * Matched by an EXPLICIT type set for the same reason the summoner-spell
 * reader uses one: a future backend type must not acquire this card by being
 * named plausibly.
 */
/**
 * MAA1 Phase 5 added `structure`. It is admitted by ADDING one member to this
 * set and nothing else: the payload already carries identity and a canonical
 * art path in the same three fields `minion` and `objective` use, so the card
 * it selects, the composition that card calls, and the asset resolution are
 * all unchanged. That is the whole point of a generic reader — the frontend
 * learns that structures are depictable, not what a turret looks like.
 */
/**
 * JPM1 added `jungle_pet` the same way: the backend resolves a jungle companion
 * and its form from `quiz.jungle_pet_assets` and emits id/name/icon (+ form).
 * This repo learns that companions are depictable, never which one is which.
 */
const ENVIRONMENT_SUBJECT_TYPES = new Set(["minion", "objective", "structure", "jungle_pet"]);

export function getEnvironmentSubject(question: QuizQuestion): EnvironmentSubject | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as
    | Record<string, unknown>
    | undefined;
  if (!subject || typeof subject.type !== "string") return null;
  if (!ENVIRONMENT_SUBJECT_TYPES.has(subject.type)) return null;

  const name = subject.name as string | undefined;
  const icon = resolveQuizAssetUrl(subject.icon as string | undefined);
  if (!name || !icon) return null;

  // The declared type IS the family: the set above is the allow-list, so the
  // value reaching `kind` can only be one of its members. Deliberately not a
  // per-entity branch — "turret" / "inhibitor" / "nexus" never appear in this
  // repo, because the backend owns entity identity and the art path it maps
  // to, and the card needs only the family to write one caption line.
  return {
    id: typeof subject.id === "string" ? subject.id : undefined,
    name,
    icon,
    kind: subject.type as EnvironmentSubject["kind"],
    ...(subject.form === "base" || subject.form === "evolved" ? { form: subject.form } : {}),
  };
}

/**
 * ENVVIS1 Batch 1 — parse an environment SCENE, or null.
 *
 * A separate reader from `getEnvironmentSubject` because it reads a separate
 * CHANNEL. The backend emits `assets.scene` for a row that has no safe entity
 * subject, and it never emits both: `PublicPresentation` refuses a subject and
 * a scene at once, so these two readers cannot both fire on one payload.
 *
 * WHY THE SPLIT IS WORTH A SECOND READER
 * `assets.subject` asserts "this round is ABOUT this thing"; `assets.scene`
 * asserts only "this round happens HERE". Folding a scene into the subject
 * reader would merge those two claims at exactly the point the contract exists
 * to keep them apart — and a client that knows only about subjects is meant to
 * see a scene row as it saw it before this batch, a row with no premise media.
 * That is what makes the new channel additive to every existing reader instead
 * of a change in what `subject` means.
 *
 * THE ART IS REQUIRED, the mirror of the subject reader requiring an icon: a
 * scene card IS its backdrop. With no art there is no picture to build and the
 * honest answer is the compact band, which is exactly where a scene-less
 * environment row already goes today. So an id this repo has no art for
 * resolves to null rather than to an empty gold frame — which is also what
 * keeps a backend scene vocabulary that runs ahead of the art from shipping
 * blank cards.
 */
export function getEnvironmentScene(question: QuizQuestion): EnvironmentScene | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const scene = (meta.assets as Record<string, unknown> | undefined)?.scene as
    | Record<string, unknown>
    | undefined;
  if (!scene || scene.type !== "scene") return null;

  const id = typeof scene.id === "string" ? scene.id : "";
  const name = typeof scene.name === "string" ? scene.name : "";
  // The caption is the one optional field: it is a second label line, so a
  // payload without one is a slightly plainer card rather than no card.
  const caption = typeof scene.caption === "string" ? scene.caption : "";
  if (!id || !name) return null;

  const art = resolveEnvironmentSceneArt(id);
  if (!art) return null;

  return {
    id,
    name,
    caption,
    art: art.background,
    // Whole-layer, like every other media channel here: a foreground that did
    // not resolve is simply absent and the card draws its background alone,
    // rather than a medallion around a broken image.
    ...(art.foreground
      ? { foreground: art.foreground, foregroundAlt: art.foregroundAlt || name }
      : {}),
  };
}

export function getItemAnalysisSubject(question: QuizQuestion): ItemAnalysisSubject | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const subject = (meta.assets as Record<string, unknown> | undefined)?.subject as
    | Record<string, unknown>
    | undefined;
  if (!subject || subject.type !== "item") return null;
  const name = (subject.name as string | undefined) ?? (meta.item_name as string | undefined);
  if (!name) return null;

  const statValue =
    typeof meta.formatted_value === "string" && typeof meta.stat_label === "string"
      ? { value: meta.formatted_value, label: meta.stat_label }
      : undefined;

  // Verified icon paths shipped by the generator/backfill as
  // known_component_icons: [{name, item_id, icon}]. Merged into the name
  // list; components without an icon fall back to a monogram tile.
  const iconByName = new Map<string, string>();
  if (Array.isArray(meta.known_component_icons)) {
    for (const entry of meta.known_component_icons) {
      const e = entry as Record<string, unknown>;
      if (typeof e.name === "string" && typeof e.icon === "string" && e.icon) {
        iconByName.set(e.name, e.icon);
      }
    }
  }
  const knownComponents = Array.isArray(meta.known_components)
    ? meta.known_components
        .filter((c): c is string => typeof c === "string")
        .map((name) => ({
          name,
          icon: resolveQuizAssetUrl(iconByName.get(name)),
        }))
    : [];

  // The missing component is the correct answer. Parsed here but the card
  // must only render it when the reveal is active. Prefer the verified
  // missing_component_icon (node asset_path — ids are DD map-variant ids, so
  // a constructed {id}.png path is only a legacy fallback; card hides 404s).
  const missingComponent =
    typeof meta.missing_component_item_name === "string"
      ? {
          name: meta.missing_component_item_name,
          icon:
            typeof meta.missing_component_icon === "string" && meta.missing_component_icon
              ? resolveQuizAssetUrl(meta.missing_component_icon)
              : typeof meta.missing_component_item_id === "number"
                ? resolveQuizAssetUrl(`assets/items/${meta.missing_component_item_id}.png`)
                : null,
        }
      : undefined;

  return {
    name,
    icon: resolveQuizAssetUrl((subject.icon as string | undefined) ?? (meta.asset_path as string | undefined)),
    cost: typeof meta.cost === "number" ? meta.cost : undefined,
    statCodes: Array.isArray(meta.stats) ? meta.stats.filter((s): s is string => typeof s === "string") : [],
    statValue,
    buildsInto: typeof meta.parent_item_name === "string" ? meta.parent_item_name : undefined,
    knownComponents,
    missingComponent,
  };
}

/** Explicit scenario type from metadata.presentation.scenario_type, if any. */
function getExplicitScenarioType(question: QuizQuestion): string | null {
  const meta = (question.metadata ?? {}) as Record<string, unknown>;
  const presentation = meta.presentation as Record<string, unknown> | undefined;
  const raw = presentation?.scenario_type;
  return typeof raw === "string" && raw ? raw.toLowerCase() : null;
}

/**
 * Decide which scenario card to render. Reproduces the pre-framework
 * SubjectPanel behavior exactly (same order, same AnimatePresence keys),
 * with an optional explicit scenario_type tier on top.
 */
export function selectScenario(
  question: QuizQuestion,
  revealActive: boolean,
  correctAnswer: string | null,
): ScenarioSelection {
  const base = classifySubject(question);
  const spoiler = isSpoilerSubject(question, base, correctAnswer);
  const subject = revealActive ? deriveRevealSubject(question, base, correctAnswer) : base;
  const shouldHide = spoiler && !revealActive;

  const combat = getCombatCooldownSubject(question);
  const matchup = getMatchupSubject(question);
  const spell = getSummonerSpellSubject(question);
  const item = getItemAnalysisSubject(question);
  const environment = getEnvironmentSubject(question);
  const environmentScene = getEnvironmentScene(question);
  const explicit = getExplicitScenarioType(question);

  // Tier 1: explicit scenario_type (falls through when the payload is missing)
  if (!shouldHide && explicit) {
    if ((explicit === "combat_calculation" || explicit === "combat_simulation") && combat) {
      return { card: "combat_calculation", key: `combat-${question.id}`, combat };
    }
    if (explicit === "matchup" && matchup) {
      return { card: "matchup", key: `matchup-${question.id}`, matchup };
    }
    if (explicit === "item" && item) {
      return { card: "item_analysis", key: `item-${question.id}`, item };
    }
    if ((explicit === "champion_profile" || explicit === "champion") && subject.label) {
      return { card: "champion_profile", key: `champ-${subject.label}`, champion: subject.label };
    }
  }

  // Tier 2: assets.subject.type
  if (combat && !shouldHide) {
    return { card: "combat_calculation", key: `combat-${question.id}`, combat };
  }
  if (matchup && !shouldHide) {
    return { card: "matchup", key: `matchup-${question.id}`, matchup };
  }
  if (spell && !shouldHide) {
    return { card: "summoner_spell", key: `spell-${question.id}`, spell };
  }
  if (item && !shouldHide) {
    return { card: "item_analysis", key: `item-${question.id}`, item };
  }
  // Environment sits at the END of tier 2, after every reader that owns a
  // richer premise. It can only be reached by a payload none of them claimed,
  // so adding it cannot divert an item, a spell or a combat row.
  if (environment && !shouldHide) {
    return { card: "environment", key: `env-${question.id}`, environment };
  }
  // ENVVIS1 Batch 1 — the scene sits immediately AFTER the environment
  // subject, and last in tier 2. That ordering is the frontend restatement of
  // the backend's: a row with a depictable subject keeps it, because a
  // portrait of the thing the prompt names is a stronger card than the place
  // it stands in. In practice the two can never both be present (the contract
  // refuses a subject and a scene at once), so this is belt and braces rather
  // than a live tiebreak — but the belt is worth having, because it means a
  // future contract relaxation degrades to "subject wins" instead of to
  // whichever branch happens to be written first.
  //
  // Like the environment subject above it, this can only be reached by a
  // payload no richer reader claimed, so adding it cannot divert an item, a
  // spell, a matchup or a combat row.
  if (environmentScene && !shouldHide) {
    return { card: "environment_scene", key: `envscene-${question.id}`, scene: environmentScene };
  }

  // Tier 3: legacy SubjectPanel order, unchanged
  if (shouldHide) {
    return {
      card: "placeholder",
      key: "placeholder",
      kind: base.kind === "none" ? inferKindFromQuestion(question) : base.kind,
      category: String(question.category ?? ""),
    };
  }
  if (subject.kind === "champion" && subject.label) {
    return { card: "champion_profile", key: `champ-${subject.label}`, champion: subject.label };
  }
  if (subject.kind === "champion" && subject.iconUrl) {
    return {
      card: "collectible",
      key: `champion-icon-${subject.iconUrl}`,
      iconUrl: subject.iconUrl,
      label: subject.label || "Champion",
      kind: "champion",
    };
  }
  if (subject.iconUrl) {
    return {
      card: "collectible",
      key: `icon-${subject.iconUrl}`,
      iconUrl: subject.iconUrl,
      label: subject.label,
      kind: subject.kind,
    };
  }
  return { card: "empty", key: "empty" };
}
