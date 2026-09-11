import { useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import type { ItemAnalysisSubject, ScenarioSectionData } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ScenarioBadge, ScenarioDivider, ScenarioSection, ScenarioTitle } from "./primitives";
import itemShopkeeper from "@/assets/ranked/item-shopkeeper.png";

/**
 * Item Analysis card.
 *
 * Build-path questions render the RECIPE TREE — a League-shop-inspired tree
 * (final item on top, connector lines down to component nodes) sized as the
 * card's main visual, since the recipe is the teaching object. The unknown
 * component is a pulsing "?" node that fills with the answer at reveal.
 *
 * Non-recipe item questions render the SHOP COMPOSITION (RIV2): a layered
 * media panel — warm shop interior, an oversized faint echo of the item's own
 * artwork, the shopkeeper standing in the right of frame, a gold academy
 * medallion, and the item itself as a large foreground focal object. Every
 * layer but the shopkeeper is driven by the SAME `item.icon` the card is
 * already given, so the composition is dynamic for every item question and
 * there is not one line of per-item styling anywhere in it.
 *
 * Spoiler rules: known_components appear verbatim in the question text, so
 * the tree is safe pre-reveal. The missing component's name/icon and the
 * info sections render ONLY when `revealed` (it is the correct answer).
 *
 * ── SIZING (RIV1) ──────────────────────────────────────────────────────────
 * This card was the ONE scenario card the `--sc-fit` pass never reached, and
 * it is the card whose whole subject IS a piece of item art. Every size below
 * was bare `cqmin`, so on the 16:9 broadcast stage (cqmin ~10px) it read as
 * designed while in the Ranked band — capped at `--qs-media-max: 16rem`, so
 * cqmin is 2.56px — the focal item rendered at 27px and a component at 18px.
 * That is the "item images are way too small" report: the ARTWORK got better
 * (MAA1 Phase 2 shipped 512px sources) but the BOX it is drawn in never did.
 *
 * The fix is the idiom primitives.tsx already documents and every sibling card
 * already uses: `max(N cqmin, calc(M * var(--sc-fit)))`. Each M here obeys that
 * file's rule `M <= 0.625 * N`, which is exactly the condition for the `cqmin`
 * term to keep winning on the broadcast stage — so the stage is unchanged to
 * the pixel and only the short band moves. The M values deliberately COMPRESS
 * the composition's ratios (the stage gives the shrine rings 1.86x the icon's
 * diameter; the band gives them 1.52x), for the same reason primitives.tsx
 * compresses the type scale: at 256px tall there is no room to spend on
 * decoration, and the item is the thing that has to read.
 *
 * RecipeTree additionally had the OTHER bug that file describes: its inner
 * stack's vertical rhythm was `pt-[9%] pb-[3%]`, and a percentage PADDING
 * resolves against the container's WIDTH. In the band that container is ~896px
 * wide and 156px tall, so those two rules alone claimed 112px of padding and
 * forced the tree to overflow its own box by 121px. They are `cqh` now, which
 * is 1% of the container's HEIGHT and — at 16/9, where 1% of width is 16/9 cqh
 * — resolves to the identical value on the stage.
 */
export function ItemAnalysisScenarioCard({
  item,
  revealed,
}: {
  item: ItemAnalysisSubject;
  revealed: boolean;
}) {
  const hasRecipe = item.knownComponents.length > 0;

  const sections = useMemo<ScenarioSectionData[]>(() => {
    if (!revealed) return [];
    const out: ScenarioSectionData[] = [];

    if (item.cost != null) {
      out.push({
        title: "Item Information",
        entries: [{ title: `${item.cost.toLocaleString()} Gold` }],
      });
    }

    const statEntries = item.statValue
      ? [{ title: `${item.statValue.value} ${item.statValue.label}` }]
      : item.statCodes.map((code) => ({ title: prettifyStatCode(code) }));
    if (statEntries.length) {
      out.push({ title: "Stats", entries: statEntries });
    }

    if (item.buildsInto) {
      out.push({ title: "Builds Into", entries: [{ title: item.buildsInto }] });
    }

    return out;
  }, [item, revealed]);

  return (
    <ScenarioCardFrame
      backgroundUrl={null}
      backgroundAlt={item.name}
      // RIV2 — the item-primary card is the one scenario card with no
      // background photograph of its own, which is why it read as an empty
      // box. It now composes one from what it already has. The recipe path is
      // deliberately untouched: its tree IS the picture and a shopkeeper
      // behind it would compete with the thing being taught.
      backgroundSlot={hasRecipe ? undefined : <ItemShopBackdrop item={item} />}
      gradientClass={
        hasRecipe
          ? "bg-[linear-gradient(to_top,rgba(3,2,2,0.92)_0%,rgba(3,2,2,0.7)_26%,rgba(3,2,2,0.25)_44%,transparent_60%)]"
          : "bg-[linear-gradient(to_top,rgba(4,3,2,0.94)_0%,rgba(4,3,2,0.66)_30%,rgba(4,3,2,0.12)_58%,transparent_78%)]"
      }
    >
      {/* The ghost/echo layer used to live here, in FRONT of the frame's
          vignette. On the item-primary path it is now the echo inside
          `ItemShopBackdrop` — behind the vignette and behind the gradient,
          which is what lets it stay faint at the size the concept asks for.
          The recipe path keeps the ghost it always had, so its panel is not
          drawn on flat black. */}
      {hasRecipe && item.icon && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <motion.img
            src={item.icon}
            alt=""
            className="absolute left-1/2 top-[26%] h-[52cqmin] w-[52cqmin] max-w-none -translate-x-[58%] -translate-y-1/2 rounded-[4cqmin] object-cover opacity-[0.13] blur-md saturate-[1.15]"
            animate={{ x: ["-58%", "-52%", "-58%"], scale: [1, 1.06, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      )}

      <ScenarioBadge>Item Analysis</ScenarioBadge>

      {/* Build-path questions: the recipe tree IS the hero */}
      {hasRecipe && <RecipeTree item={item} revealed={revealed} />}

      {/* Hero artifact zone — gold medallion + large foreground item (RIV2).
          `data-item-media` is the sizing-token host; see index.css. */}
      {!hasRecipe && (
      <div
        data-item-media
        className="pointer-events-none absolute inset-x-0 top-0 flex h-[80cqh] items-center justify-center"
      >
        <div className="relative flex items-center justify-center">
          {/* warm pool of light the medallion sits in */}
          <div
            aria-hidden
            className="absolute h-[calc(2.6*var(--item-hero-icon))] w-[calc(2.6*var(--item-hero-icon))] rounded-full bg-[radial-gradient(circle,rgba(212,179,90,0.22)_0%,rgba(212,179,90,0.07)_42%,transparent_70%)]"
          />

          {/* medallion — outer dashed ring, slow rotation */}
          <motion.div
            aria-hidden
            className="absolute h-[var(--item-medallion)] w-[var(--item-medallion)] rounded-full border border-[#d4b35a]/45"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            style={{ borderStyle: "dashed" }}
          />
          {/* medallion — solid inner ring */}
          <motion.div
            aria-hidden
            className="absolute h-[var(--item-medallion-inner)] w-[var(--item-medallion-inner)] rounded-full border border-[#e8c97a]/40 bg-[radial-gradient(circle,rgba(232,201,122,0.10)_0%,transparent_68%)]"
            animate={{ scale: [1, 1.03, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* medallion cardinal points — four small gold diamonds on the ring */}
          {["top", "right", "bottom", "left"].map((side, i) => (
            <div
              key={side}
              aria-hidden
              className="absolute h-[var(--item-medallion)] w-[var(--item-medallion)]"
              style={{ transform: `rotate(${i * 90}deg)` }}
            >
              <div className="absolute left-1/2 top-0 h-[calc(0.042*var(--item-hero-icon))] w-[calc(0.042*var(--item-hero-icon))] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#e8c97a]/65" />
            </div>
          ))}

          {/* gold flourishes reaching out of the medallion, left and right —
              the concept's "divider/detailing", drawn as two mirrored rules
              that start where the medallion ends. */}
          {/* Both classes are written out in full rather than interpolated:
              Tailwind extracts class names by scanning the source text, so a
              `bg-[linear-gradient(${dir},…)]` template would compile to no
              rule at all and these would silently render as nothing. */}
          {([
            ["right", "absolute top-1/2 h-px w-[calc(0.9*var(--item-hero-icon))] -translate-y-1/2 bg-[linear-gradient(to_right,rgba(212,179,90,0.7),transparent)]"],
            ["left", "absolute top-1/2 h-px w-[calc(0.9*var(--item-hero-icon))] -translate-y-1/2 bg-[linear-gradient(to_left,rgba(212,179,90,0.7),transparent)]"],
          ] as const).map(([side, cls]) => (
            <div
              key={side}
              aria-hidden
              className={cls}
              style={{ [side]: "calc(50% + 0.56 * var(--item-medallion))" } as CSSProperties}
            />
          ))}

          {/* soft hextech glow directly behind the item */}
          <motion.div
            aria-hidden
            className="absolute h-[calc(1.05*var(--item-hero-icon))] w-[calc(1.05*var(--item-hero-icon))] rounded-full bg-[#d4b35a]/30 blur-2xl"
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* particle specks — kept proportional to the item, not to the card */}
          {[
            { x: -0.62, y: -0.34, delay: 0 },
            { x: 0.66, y: -0.14, delay: 1.6 },
            { x: 0.48, y: 0.5, delay: 3.1 },
          ].map((p, i) => (
            <motion.div
              key={i}
              aria-hidden
              className="absolute h-[calc(0.032*var(--item-hero-icon))] w-[calc(0.032*var(--item-hero-icon))] rounded-full bg-[#f3dca0]"
              style={{
                left: `calc(50% + ${p.x} * var(--item-hero-icon))`,
                top: `calc(50% + ${p.y} * var(--item-hero-icon))`,
              }}
              animate={{ y: [0, -8, 0], opacity: [0, 0.8, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
            />
          ))}

          {/* crisp hero icon with float */}
          <motion.div
            className="relative"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <HeroIcon iconUrl={item.icon} alt={item.name} />
          </motion.div>

          {/* pedestal shadow */}
          <motion.div
            aria-hidden
            className="absolute top-[calc(0.68*var(--item-hero-icon))] h-[calc(0.115*var(--item-hero-icon))] w-[calc(0.79*var(--item-hero-icon))] rounded-[50%] bg-black/55 blur-md"
            animate={{ scaleX: [1, 0.9, 1], opacity: [0.55, 0.4, 0.55] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
      )}

      {/* Gold panel detailing — corner brackets and the bottom-edge ornament
          the concept frames the media with. Item-primary only. */}
      {!hasRecipe && <PanelFiligree />}

      {/* Bottom label + reveal-gated sections */}
      {/* pb in `cqh` — see CombatCalculationScenarioCard; same 5% on 16:9. */}
      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[8.89cqh]">
        <ScenarioTitle>{item.name}</ScenarioTitle>
        <div className="mt-[0.4cqmin] text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] leading-[min(1.5rem,1.25em)] font-semibold uppercase tracking-[0.24em] text-white/70">
          {hasRecipe ? "Item · Build Path" : "Item"}
        </div>

        {sections.length > 0 && (
          <>
            <ScenarioDivider />
            {sections.map((section) => (
              <ScenarioSection key={section.title} section={section} />
            ))}
          </>
        )}
      </div>
    </ScenarioCardFrame>
  );
}

/**
 * The foreground focal item — the one thing on this card that must read at a
 * glance. Sized off `--item-hero-icon` (index.css), which steps with the
 * BAND'S HEIGHT exactly the way the recipe tree's tokens do, so a phone and a
 * desktop each get the largest item their band can actually seat.
 */
function HeroIcon({ iconUrl, alt }: { iconUrl?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  const box = "h-[var(--item-hero-icon)] w-[var(--item-hero-icon)]";
  if (!iconUrl || errored) {
    return (
      <div
        data-item-hero-icon
        className={`flex ${box} items-center justify-center rounded-[18%] border border-[#d4b35a]/40 bg-black/40 text-[calc(0.22*var(--item-hero-icon))] text-white/30`}
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={iconUrl}
      alt={alt}
      data-item-hero-icon
      onError={() => setErrored(true)}
      className={`${box} rounded-[18%] border-2 border-[#d4b35a]/70 object-cover shadow-[0_22px_52px_-6px_rgba(0,0,0,0.95),0_0_0_1px_rgba(0,0,0,0.5)] ring-1 ring-[#f3dca0]/35`}
    />
  );
}

/**
 * The shop the item is being sold in — every layer behind the gradient.
 *
 * Sits in `ScenarioCardFrame`'s `backgroundSlot`, so it inherits the frame's
 * Ken Burns pan, its vignette and its readability gradient rather than
 * re-implementing any of them. Three layers, back to front:
 *
 *   1. the warm interior wash, so the panel is not flat black;
 *   2. an oversized, heavily blurred ECHO of `item.icon` — the same dynamic
 *      artwork the foreground draws, at ~3.4x its size and 11% opacity;
 *   3. `item-shopkeeper.png` in the right of frame, masked off at its right
 *      and bottom edges so it reads as presence rather than as a cut-out.
 *
 * `data-item-media` is repeated here because the sizing tokens are declared on
 * that attribute and this subtree is a SIBLING of the hero zone, not a
 * descendant — one CSS block, two hosts, no duplicated numbers.
 */
const SHOPKEEPER_MASK =
  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 22%, #000 52%),"
  + " linear-gradient(to top, transparent 0%, rgba(0,0,0,0.4) 14%, #000 34%),"
  + " linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, #000 26%)";

function ItemShopBackdrop({ item }: { item: ItemAnalysisSubject }) {
  return (
    <div data-item-media aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(125%_150%_at_46%_36%,#241a12_0%,#150f0a_46%,#070505_100%)]" />

      {item.icon && (
        <motion.img
          src={item.icon}
          alt=""
          className="absolute left-[33%] top-[44%] h-[var(--item-echo)] w-[var(--item-echo)] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-[10%] object-cover opacity-[0.13] blur-[10px] saturate-[1.2]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.13, scale: [1, 1.05, 1] }}
          transition={{
            opacity: { duration: 0.6 },
            scale: { duration: 18, repeat: Infinity, ease: "easeInOut" },
          }}
        />
      )}

      {/* lantern light the shopkeeper is lit by */}
      <div className="absolute right-0 top-0 h-full w-[46%] bg-[radial-gradient(75%_85%_at_78%_45%,rgba(214,150,74,0.20)_0%,transparent_72%)]" />

      <motion.img
        src={itemShopkeeper}
        alt=""
        className="absolute bottom-[4%] right-[-6%] h-[160%] w-auto max-w-none object-contain opacity-[0.54] saturate-[0.85]"
        style={{
          // Fades into the panel's dark left and bottom rather than ending on
          // a cut-out edge. Two ramps intersected, so a corner gets both.
          maskImage: SHOPKEEPER_MASK,
          maskComposite: "intersect",
          WebkitMaskImage: SHOPKEEPER_MASK,
          WebkitMaskComposite: "source-in",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.54 }}
        transition={{ duration: 0.8 }}
      />
    </div>
  );
}

/**
 * The gold detailing the concept frames the media panel with: a bracket in
 * each corner and one ornament centred on the bottom edge. Purely decorative,
 * expressed in `cqmin`/`cqh` so it thins out with the band instead of
 * crowding a phone.
 */
function PanelFiligree() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {([
        ["left-[2.2%] top-[5cqh]", "border-l border-t rounded-tl-md"],
        ["right-[2.2%] top-[5cqh]", "border-r border-t rounded-tr-md"],
        ["left-[2.2%] bottom-[5cqh]", "border-l border-b rounded-bl-md"],
        ["right-[2.2%] bottom-[5cqh]", "border-r border-b rounded-br-md"],
      ] as const).map(([pos, edges]) => (
        <div
          key={pos}
          className={`absolute ${pos} ${edges} h-[max(2.4cqmin,calc(0.7*var(--sc-fit)))] w-[max(2.4cqmin,calc(0.7*var(--sc-fit)))] border-[#d4b35a]/35`}
        />
      ))}

      <div className="absolute bottom-[2.4cqh] left-1/2 flex -translate-x-1/2 items-center gap-[max(0.8cqmin,calc(0.25*var(--sc-fit)))]">
        <div className="h-px w-[max(6cqmin,calc(1.9*var(--sc-fit)))] bg-[linear-gradient(to_right,transparent,rgba(212,179,90,0.55))]" />
        <div className="h-[max(0.9cqmin,calc(0.28*var(--sc-fit)))] w-[max(0.9cqmin,calc(0.28*var(--sc-fit)))] rotate-45 bg-[#e8c97a]/75" />
        <div className="h-px w-[max(6cqmin,calc(1.9*var(--sc-fit)))] bg-[linear-gradient(to_left,transparent,rgba(212,179,90,0.55))]" />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Recipe Tree — League-shop-inspired build tree.

     [ final item ]          large focal node
        /   |   \            thin connector lines
   [known][known][ ? ]       component nodes; "?" becomes the answer at reveal

   Known components arrive as names only (no icon paths in metadata), so
   their nodes render as monogram tiles — League-shop empty-slot style. If
   the metadata ever ships known-component icons, ItemNodeTile already
   accepts an iconUrl. The "?" node reserves identical dimensions to the
   revealed answer node, so the reveal never shifts layout.
   ──────────────────────────────────────────────────────────────────────── */

function RecipeTree({ item, revealed }: { item: ItemAnalysisSubject; revealed: boolean }) {
  // Children: known components in order, mystery/answer slot last.
  const childCount = item.knownComponents.length + 1;
  const compact = childCount >= 4;
  // See index.css "RIV1: Item recipe-tree media scale" — how big a tile may be
  // is a question about the BAND'S HEIGHT, which --sc-fit alone cannot answer.
  const tile = compact
    ? "h-[var(--recipe-tile-compact)] w-[var(--recipe-tile-compact)]"
    : "h-[var(--recipe-tile)] w-[var(--recipe-tile)]";
  const labelWidth = compact
    ? "max-w-[max(8cqmin,calc(3.2*var(--sc-fit)))]"
    : "max-w-[max(10cqmin,calc(4*var(--sc-fit)))]";

  // Connector endpoints as percentages of the row width.
  const childX = Array.from({ length: childCount }, (_, i) => ((i + 0.5) / childCount) * 100);

  return (
    <div data-item-recipe className="absolute inset-x-[6%] top-[7%] h-[57%]">
      {/* glass panel */}
      <div className="absolute inset-0 rounded-2xl border border-[#d4b35a]/20 bg-black/35 backdrop-blur-sm" />
      <div className="absolute left-1/2 top-[2.5%] -translate-x-1/2 text-[max(0.85cqmin,calc(0.53*var(--sc-fit)))] leading-[min(1.5rem,1.25em)] font-bold uppercase tracking-[0.34em] text-[#e8c97a]/70">
        Build Path
      </div>

      {/* pt/pb in `cqh`, NOT `%` — a percentage padding resolves against the
          container's WIDTH, which here is ~896px against a 156px height, so
          these two rules alone claimed 112px and overflowed the tree by 121px.
          9% and 3% of a stack that is 88% of a 16/9 card wide are 14.08cqh and
          4.69cqh, so the broadcast stage is unchanged. */}
      <div className="relative flex h-full flex-col items-center px-[4%] pb-[4.69cqh] pt-[14.08cqh]">
        {/* Final item — focal node */}
        <div className="relative flex flex-col items-center">
          <motion.div
            aria-hidden
            className="absolute -inset-[max(1.6cqmin,calc(1*var(--sc-fit)))] rounded-2xl bg-[#d4b35a]/20 blur-xl"
            animate={{ opacity: [0.45, 0.8, 0.45] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="relative"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ItemNodeTile iconUrl={item.icon} name={item.name} sizeClass="h-[var(--recipe-focal)] w-[var(--recipe-focal)]" focal />
          </motion.div>
        </div>

        {/* Connectors */}
        <svg
          aria-hidden
          // Bare `cqmin` on purpose (RIV1): this is the GAP between the focal
          // node and the component row, not artwork. Flooring it would spend
          // the band's scarce height on empty space and shrink the tiles the
          // floors above just grew.
          className="h-[6.5cqmin] w-full shrink-0"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {childX.map((x, i) => {
            const isMystery = i === childCount - 1;
            return (
              <line
                key={i}
                x1="50"
                y1="4"
                x2={x}
                y2="96"
                stroke={isMystery ? "#7dd3fc" : "#d4b35a"}
                strokeOpacity={isMystery ? 0.5 : 0.35}
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Component row */}
        <div className="flex w-full flex-1 items-start justify-around">
          {item.knownComponents.map((comp) => (
            <div key={comp.name} className="flex flex-col items-center gap-[max(0.7cqmin,calc(0.19*var(--sc-fit)))]">
              <ItemNodeTile iconUrl={comp.icon} name={comp.name} sizeClass={tile} />
              <div className={`${labelWidth} truncate text-center text-[length:var(--recipe-label)] leading-[min(1.5rem,1.25em)] font-bold uppercase tracking-[0.08em] text-white/85`}>
                {comp.name}
              </div>
            </div>
          ))}

          {/* Mystery / answer node — identical box pre & post reveal */}
          <div className="flex flex-col items-center gap-[max(0.7cqmin,calc(0.19*var(--sc-fit)))]">
            {revealed && item.missingComponent ? (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <motion.div
                    aria-hidden
                    className="absolute -inset-[max(0.9cqmin,calc(0.56*var(--sc-fit)))] rounded-xl bg-[#f3dca0]/25 blur-lg"
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <ItemNodeTile
                    iconUrl={item.missingComponent.icon}
                    name={item.missingComponent.name}
                    sizeClass={tile}
                    answer
                  />
                </motion.div>
                <div className={`${labelWidth} truncate text-center text-[length:var(--recipe-label)] leading-[min(1.5rem,1.25em)] font-black uppercase tracking-[0.08em] text-[#f3dca0]`}>
                  {item.missingComponent.name}
                </div>
              </>
            ) : (
              <>
                <motion.div
                  className={`flex ${tile} items-center justify-center rounded-xl border-2 border-dashed border-[#7dd3fc]/60 bg-black/55 text-[max(2.8cqmin,calc(1*var(--sc-fit)))] font-black leading-none text-[#7dd3fc]`}
                  animate={{
                    opacity: [0.6, 1, 0.6],
                    boxShadow: [
                      "0 0 6px rgba(125,211,252,0.15)",
                      "0 0 18px rgba(125,211,252,0.45)",
                      "0 0 6px rgba(125,211,252,0.15)",
                    ],
                  }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  ?
                </motion.div>
                <div className={`${labelWidth} truncate text-center text-[length:var(--recipe-label)] leading-[min(1.5rem,1.25em)] font-bold uppercase tracking-[0.12em] text-[#7dd3fc]/80`}>
                  Missing
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A single tree node tile: item icon when available, otherwise a monogram
 * placeholder (League-shop empty-slot style). Never shows a broken image.
 */
function ItemNodeTile({
  iconUrl,
  name,
  sizeClass,
  focal,
  answer,
}: {
  iconUrl?: string | null;
  name: string;
  sizeClass: string;
  focal?: boolean;
  answer?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const border = answer
    ? "border-2 border-[#f3dca0]/80 ring-1 ring-[#f3dca0]/40"
    : focal
      ? "border-2 border-[#d4b35a]/70 ring-1 ring-[#f3dca0]/30"
      : "border border-[#d4b35a]/40";

  if (iconUrl && !errored) {
    return (
      <img
        src={iconUrl}
        alt={name}
        onError={() => setErrored(true)}
        className={`${sizeClass} rounded-xl object-cover shadow-[0_10px_28px_-8px_rgba(0,0,0,0.9)] ${border}`}
      />
    );
  }
  return (
    <div
      className={`flex ${sizeClass} items-center justify-center rounded-xl bg-gradient-to-b from-[#1a1610] to-[#0c0a08] shadow-[0_10px_28px_-8px_rgba(0,0,0,0.9)] ${border}`}
    >
      <span className="text-[max(1.9cqmin,calc(1*var(--sc-fit)))] font-black leading-none tracking-wide text-[#e8c97a]/90">{monogram(name)}</span>
    </div>
  );
}

function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const STAT_CODE_LABELS: Record<string, string> = {
  AD: "Attack Damage",
  AP: "Ability Power",
  HP: "Health",
  MANA: "Mana",
  ARMOR: "Armor",
  MR: "Magic Resist",
  ABILITY_HASTE: "Ability Haste",
  ATTACK_SPEED: "Attack Speed",
  CRIT: "Critical Strike",
  CRIT_CHANCE: "Critical Strike",
  LETHALITY: "Lethality",
  LIFESTEAL_PERCENT: "Lifesteal",
  OMNIVAMP: "Omnivamp",
  MOVE_SPEED: "Move Speed",
  MOVEMENT_SPEED: "Move Speed",
  HP5: "Health Regen",
  MP5: "Mana Regen",
  HEAL_SHIELD_POWER: "Heal & Shield Power",
  MAGIC_PEN: "Magic Penetration",
  ARMOR_PEN: "Armor Penetration",
  TENACITY: "Tenacity",
  GOLD_PER_10: "Gold Generation",
};

function prettifyStatCode(code: string): string {
  const known = STAT_CODE_LABELS[code.toUpperCase()];
  if (known) return known;
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
