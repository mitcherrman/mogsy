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
import type {
  ClassifiedSubject,
  CombatCooldownSubject,
  ItemAnalysisSubject,
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

      case "spell":
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
    abilitySlot: subject.ability_slot as string | undefined,
    abilityName: subject.ability_name as string | undefined,
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
  const item = getItemAnalysisSubject(question);
  const explicit = getExplicitScenarioType(question);

  // Tier 1: explicit scenario_type (falls through when the payload is missing)
  if (!shouldHide && explicit) {
    if ((explicit === "combat_calculation" || explicit === "combat_simulation") && combat) {
      return { card: "combat_calculation", key: `combat-${question.id}`, combat };
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
  if (item && !shouldHide) {
    return { card: "item_analysis", key: `item-${question.id}`, item };
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
