/**
 * PM1 — a Practice question's own visual, for the arena stage's media region.
 *
 * The legacy Practice card drew five kinds of question art (a champion icon
 * over its splash, an item, a rune, a summoner spell, or a plain image), each
 * in its own gilded frame. That is real League art the question is ABOUT, and
 * the canonical arena has no source for it (Practice rows carry no scenario
 * source), so it arrives through the arena's `regions.media` seam — the same
 * seam Pro Play uses for its anchor plate.
 *
 * Laid out as a horizontal plate rather than a tall stack: the arena's media
 * region is the one region that yields height on a short screen, so the art
 * scales with the region (`lg:h-full`) and the name sits beside it rather
 * than under it.
 *
 * Question-safe by construction: everything here is pre-answer metadata the
 * question was served with. A file that fails to load is hidden, and the name
 * plate stays, so a missing asset never leaves a broken-image glyph (QMEDIA1).
 */
import { useState } from "react";
import { resolveQuizAssetUrl, type QuizQuestion } from "@/lib/quiz/api";
import { choicesHaveImages } from "@/components/quiz/QuizAnswerOptions";
import { cn } from "@/lib/utils";

export type PracticeVisualKind = "champion" | "item" | "rune" | "summoner" | "image";

export interface PracticeVisual {
  kind: PracticeVisualKind;
  src: string;
  /** Splash art behind a champion icon, when the question carries one. */
  splash: string | null;
  /** The subject's name, when the question names it. */
  name: string | null;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/**
 * The legacy card's visual decision, unchanged: a champion theme wins, then an
 * item, rune or summoner subject, then any other image. Null when the question
 * has no art — or when its CHOICES are the pictures, which the legacy card
 * also suppressed so the answer grid is the only picture on screen.
 */
export function practiceVisual(question: QuizQuestion): PracticeVisual | null {
  const meta = (question.metadata || {}) as Record<string, unknown>;
  const championIcon = resolveQuizAssetUrl(str(meta.champion_icon_path));
  const championSplash = resolveQuizAssetUrl(str(meta.champion_splash_path));
  const assetPath = resolveQuizAssetUrl(str(meta.asset_path));
  const rawImage = question.image_path
    ? resolveQuizAssetUrl(question.image_path) || question.image_path
    : assetPath;
  if (choicesHaveImages(question.choices || []) && !question.image_path) return null;
  const mainVisual = championIcon || rawImage;
  if (!mainVisual) return null;

  const hasChampionTheme = !!(championIcon || championSplash);
  const cat = (question.category || "").toLowerCase();
  if (championIcon) {
    return { kind: "champion", src: mainVisual, splash: championSplash ?? null, name: str(meta.champion_name) ?? null };
  }
  if (!hasChampionTheme && rawImage) {
    const isItem = cat.includes("item") || !!meta.item_id || !!meta.item_name
      || !!meta.component_item_id || !!meta.component_item_name
      || !!meta.parent_item_id || !!meta.parent_item_name;
    if (isItem) {
      return {
        kind: "item",
        src: mainVisual,
        splash: null,
        name: str(meta.item_name) ?? str(meta.parent_item_name) ?? str(meta.component_item_name) ?? null,
      };
    }
    if (cat.includes("rune") || !!meta.rune_id || !!meta.rune_name) {
      return { kind: "rune", src: mainVisual, splash: null, name: str(meta.rune_name) ?? null };
    }
    if (cat.includes("summoner") || cat.includes("spell") || !!meta.summoner_id || !!meta.summoner_name) {
      return { kind: "summoner", src: mainVisual, splash: null, name: str(meta.summoner_name) ?? null };
    }
  }
  return { kind: "image", src: mainVisual, splash: championSplash ?? null, name: null };
}

const KIND_LABEL: Record<PracticeVisualKind, string> = {
  champion: "Champion",
  item: "Item",
  rune: "Rune",
  summoner: "Summoner spell",
  image: "",
};

/** The gilded frame each kind wore on the legacy card, kept per kind. */
const FRAME: Record<Exclude<PracticeVisualKind, "image">, { ring: string; glow: string; round: string }> = {
  champion: {
    ring: "linear-gradient(145deg, #f0d78c 0%, #c9a84c 35%, #7a5e22 65%, #c9a84c 100%)",
    glow: "0 0 0 1px rgba(0,0,0,0.6), 0 0 18px rgba(80,170,220,0.45), 0 0 34px rgba(201,168,76,0.28)",
    round: "rounded-xl",
  },
  item: {
    ring: "linear-gradient(145deg, #d4a857 0%, #8a6a2a 50%, #d4a857 100%)",
    glow: "0 0 16px rgba(212,168,87,0.4), 0 6px 16px rgba(0,0,0,0.55)",
    round: "rounded-md",
  },
  rune: {
    ring: "conic-gradient(from 180deg at 50% 50%, #8b5cf6, #38bdf8, #c084fc, #8b5cf6)",
    glow: "0 0 18px rgba(139,92,246,0.5), 0 0 34px rgba(56,189,248,0.25)",
    round: "rounded-full",
  },
  summoner: {
    ring: "linear-gradient(145deg, #67e8f9 0%, #0ea5e9 50%, #1e3a8a 100%)",
    glow: "0 0 18px rgba(56,189,248,0.5), 0 6px 16px rgba(0,0,0,0.55)",
    round: "rounded-lg",
  },
};

const NAME_TONE: Record<PracticeVisualKind, string> = {
  champion: "text-[#f0d78c]",
  item: "text-[#f0d78c]",
  rune: "text-[#c4b5fd]",
  summoner: "text-[#a5f3fc]",
  image: "text-[#f0d78c]",
};

export function PracticeQuestionMedia({ visual }: { visual: PracticeVisual }) {
  const [failed, setFailed] = useState(false);
  const [splashFailed, setSplashFailed] = useState(false);
  const kindLabel = KIND_LABEL[visual.kind];
  const frame = visual.kind === "image" ? null : FRAME[visual.kind];
  const alt = visual.name || kindLabel || "Question visual";

  return (
    <div
      data-testid="practice-question-media"
      data-visual-kind={visual.kind}
      data-visual-state={failed ? "error" : "ok"}
      className="relative flex h-28 w-full min-w-0 items-center justify-center gap-4 overflow-hidden rounded-lg border
        border-[#c9a84c]/25 bg-[radial-gradient(70%_120%_at_50%_0%,rgba(80,170,220,0.12),transparent_60%),linear-gradient(180deg,rgba(10,22,40,0.92),rgba(5,11,22,0.95))]
        px-4 py-2 sm:h-32 lg:h-full lg:max-h-48 lg:min-h-0"
    >
      {visual.splash && !splashFailed && (
        <>
          <img
            src={visual.splash}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 saturate-[1.15]"
            onError={() => setSplashFailed(true)}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#050a19]/85 via-[#050a19]/45 to-[#050a19]/85" />
        </>
      )}
      {!failed && (
        frame ? (
          <div
            className={cn(
              "relative aspect-square h-full max-h-36 shrink-0 p-[3px] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-500",
              frame.round,
            )}
            style={{ background: frame.ring, boxShadow: frame.glow }}
          >
            <img
              src={visual.src}
              alt={alt}
              loading="lazy"
              draggable={false}
              className={cn("block h-full w-full bg-[#0a0a14] object-cover", frame.round)}
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          <img
            src={visual.src}
            alt={alt}
            loading="lazy"
            draggable={false}
            className="relative block h-full max-h-44 w-auto max-w-full object-contain motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
            onError={() => setFailed(true)}
          />
        )
      )}
      {(visual.name || (failed && kindLabel)) && (
        <div className="relative min-w-0 text-left">
          {kindLabel && (
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">{kindLabel}</p>
          )}
          {visual.name && (
            <p className={cn("ranked-title line-clamp-2 break-words text-lg font-semibold uppercase leading-tight tracking-[0.08em] sm:text-xl", NAME_TONE[visual.kind])}
              style={{ textShadow: "0 1px 0 rgba(0,0,0,0.8), 0 0 12px rgba(201,168,76,0.35)" }}>
              {visual.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
