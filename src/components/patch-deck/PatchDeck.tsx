import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { indexManifestFolders, resolveDeckArt, type DeckArt as Art } from "@/lib/patch-deck/art";
import { bucketOf, chapterOf, clampIndex, isEntityCard, type DeckCard, type DeckModel } from "@/lib/patch-deck/deck";
import type { DeckFace } from "@/lib/patch-deck/route";
import { CoverCard } from "./CoverCard";
import { DeckRail } from "./DeckRail";
import { EntityCard } from "./EntityCard";
import { ItemCard } from "./ItemCard";
import { SystemCard } from "./SystemCard";
import { preloadArt, useDeckMotion } from "./use-deck-motion";

/** Matches the stylesheet's desktop breakpoint. */
const WIDE_QUERY = "(min-width: 1024px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY).matches : true));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return wide;
}

const cardName = (card: DeckCard, model: DeckModel): string =>
  isEntityCard(card) ? card.entity.card.entity_name : `Patch ${model.patchVersion}`;

/** Keys typed into a field or a tablist belong to it, not to the deck. */
function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("input, select, textarea, [contenteditable=''], [contenteditable='true'], [role='tablist'], [role='slider']")) return true;
  return false;
}

const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 420;

export type PatchDeckProps = {
  model: DeckModel;
  detail: PatchReportDetail;
  manifest: ChampionManifest | null | undefined;
  /** Every version the Patch Hub lists (for the history face). */
  versions: readonly string[];
  index: number;
  face: DeckFace;
  onIndex: (index: number) => void;
  onFace: (face: DeckFace) => void;
};

/**
 * The stage: one card in the light, its neighbours as slivers at the edges, a
 * chapter rail underneath. Owns navigation between cards (buttons, slivers,
 * rail, keyboard, swipe) and hands the current face down to the card.
 */
export const PatchDeck = ({ model, detail, manifest, versions, index, face, onIndex, onFace }: PatchDeckProps) => {
  const wide = useWide();
  const { card: cardDuration, ease, reduced } = useDeckMotion();
  const folders = useMemo(() => indexManifestFolders(manifest), [manifest]);
  const artById = useMemo(() => {
    const map = new Map<string, Art>();
    for (const card of model.cards) if (isEntityCard(card)) map.set(card.id, resolveDeckArt(card.entity.card, manifest, folders));
    return map;
  }, [model, manifest, folders]);
  const artFor = useCallback((id: string) => artById.get(id) ?? null, [artById]);

  const safeIndex = clampIndex(model, index);
  const current = model.cards[safeIndex];
  const prev = safeIndex > 0 ? model.cards[safeIndex - 1] : null;
  const next = safeIndex < model.cards.length - 1 ? model.cards[safeIndex + 1] : null;

  // Direction of travel for the card transition; remembered across renders.
  const lastIndex = useRef(safeIndex);
  const direction = safeIndex >= lastIndex.current ? 1 : -1;
  useEffect(() => {
    lastIndex.current = safeIndex;
  }, [safeIndex]);

  const go = useCallback(
    (delta: number) => {
      const target = clampIndex(model, safeIndex + delta);
      if (target !== safeIndex) onIndex(target);
    },
    [model, safeIndex, onIndex],
  );
  const jump = useCallback((target: number) => onIndex(clampIndex(model, target)), [model, onIndex]);
  const jumpTo = useCallback(
    (id: string) => {
      const target = model.indexById.get(id);
      if (target !== undefined) onIndex(target);
    },
    [model, onIndex],
  );

  // Warm the neighbours' art so the next card arrives painted.
  useEffect(() => {
    const urls: Array<string | null | undefined> = [];
    for (const neighbour of [prev, next]) {
      if (!neighbour || !isEntityCard(neighbour)) continue;
      const art = artFor(neighbour.id);
      urls.push(wide ? art?.splash ?? art?.loading : art?.loading ?? art?.splash);
    }
    preloadArt(urls);
  }, [prev, next, artFor, wide]);

  // Keyboard: ← → cards, Home/End first/last, [ ] faces. Keys owned by a
  // field, a slider or the face tablist are left alone.
  useEffect(() => {
    const faces: DeckFace[] = ["overview", "changes", "impact", "history", "explore"];
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (ownsKeys(event.target)) return;
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          go(-1);
          break;
        case "Home":
          event.preventDefault();
          jump(0);
          break;
        case "End":
          event.preventDefault();
          jump(model.cards.length - 1);
          break;
        case "]": {
          event.preventDefault();
          const i = faces.indexOf(face);
          onFace(faces[(i + 1) % faces.length]);
          break;
        }
        case "[": {
          event.preventDefault();
          const i = faces.indexOf(face);
          onFace(faces[(i - 1 + faces.length) % faces.length]);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, jump, model.cards.length, face, onFace]);

  // Swipe on the art only (a phone). The content below scrolls vertically and
  // never changes cards; the face tabs scroll horizontally and never do either.
  const onSwipeEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (Math.abs(offset.x) < Math.abs(offset.y)) return;
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) go(1);
    else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) go(-1);
  };

  const chapter = chapterOf(model, safeIndex);
  const bucket = bucketOf(model, safeIndex);
  const position = `${safeIndex === 0 ? "Cover" : `Card ${safeIndex} of ${model.cards.length - 1}`}`;

  const overlay = (
    <>
      {!wide && (
        <motion.div
          className="dk-swipe"
          style={{ touchAction: "pan-y" }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.08}
          dragSnapToOrigin
          onDragEnd={onSwipeEnd}
          data-testid="deck-swipe"
          aria-hidden
        />
      )}
      <button type="button" className="dk-arrow" data-side="prev" onClick={() => go(-1)} disabled={!prev} aria-label={prev ? `Previous card: ${cardName(prev, model)}` : "No previous card"}>
        <ChevronLeft aria-hidden className="h-5 w-5" />
      </button>
      <button type="button" className="dk-arrow" data-side="next" onClick={() => go(1)} disabled={!next} aria-label={next ? `Next card: ${cardName(next, model)}` : "No next card"}>
        <ChevronRight aria-hidden className="h-5 w-5" />
      </button>
    </>
  );

  const renderCard = (card: DeckCard) => {
    if (!isEntityCard(card)) return <CoverCard model={model} detail={detail} artFor={artFor} onJump={jump}>{overlay}</CoverCard>;
    const art = artFor(card.id) ?? { splash: null, loading: null, icon: null, champion: null };
    if (card.kind === "item") return <ItemCard card={card} art={art} model={model} detail={detail}>{overlay}</ItemCard>;
    // A champion, a rune, or a mode entity whose art is a champion's: the cinematic composition.
    if (card.kind === "champion" || card.kind === "rune" || art.champion) {
      return (
        <EntityCard card={card} art={art} model={model} detail={detail} versions={versions} face={face} onFace={onFace} onJump={jumpTo} wide={wide}>
          {overlay}
        </EntityCard>
      );
    }
    return <SystemCard card={card} art={art} model={model} detail={detail}>{overlay}</SystemCard>;
  };

  const sliver = (card: DeckCard | null, side: "prev" | "next") => {
    if (!card) return <div className="dk-sliver dk-sliver--empty" aria-hidden />;
    const art = isEntityCard(card) ? artFor(card.id) : null;
    const name = cardName(card, model);
    return (
      <button type="button" className="dk-sliver" data-side={side} onClick={() => go(side === "next" ? 1 : -1)} aria-label={`${side === "next" ? "Next" : "Previous"} card: ${name}`} data-testid={`deck-sliver-${side}`}>
        {art?.loading ? <img src={art.loading} alt="" loading="lazy" decoding="async" /> : null}
        <span className="dk-sliver__label" aria-hidden>
          {name}
        </span>
      </button>
    );
  };

  const variants = {
    enter: (dir: number) => ({ x: reduced ? 0 : dir * 48, opacity: 0, scale: reduced ? 1 : 0.985 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({ x: reduced ? 0 : dir * -48, opacity: 0, scale: reduced ? 1 : 0.985 }),
  };

  return (
    <section aria-label={`Patch ${model.patchVersion} deck`} data-testid="patch-deck" data-index={safeIndex} data-face={face}>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="deck-live">
        {position}: {cardName(current, model)}. {chapter.title}
        {bucket ? `, ${bucket.label}` : ""}.
      </p>

      <div className="dk-stage">
        {sliver(prev, "prev")}
        <div className="dk-card-slot">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={current.id}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: cardDuration, ease }}
              style={wide ? { position: "absolute", inset: 0 } : undefined}
            >
              {renderCard(current)}
            </motion.div>
          </AnimatePresence>
        </div>
        {sliver(next, "next")}
      </div>

      <div className="dk-rail">
        <DeckRail model={model} index={safeIndex} onJump={jump} />
        <div className="dk-rail__status">
          <p data-testid="deck-position">
            <span className="dk-mono" style={{ color: "var(--dk-ink-2)" }}>
              {position}
            </span>
            <span> · {chapter.title}</span>
            {bucket && bucket.direction !== "ungrouped" && <span> · {bucket.label}</span>}
          </p>
          <p className="hidden items-center gap-1.5 lg:flex" aria-hidden>
            <span className="dk-kbd">←</span>
            <span className="dk-kbd">→</span>
            <span className="mr-2">cards</span>
            <span className="dk-kbd">[</span>
            <span className="dk-kbd">]</span>
            <span>views</span>
          </p>
        </div>
      </div>
    </section>
  );
};
