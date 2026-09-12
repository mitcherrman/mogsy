import { useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * The Ranked "subject media panel" — the composition RIV1–RIV4 built for the
 * item-primary card, extracted here so every subject whose whole premise IS a
 * small square icon renders the same picture.
 *
 * It exists because those cards share one problem: a 64px asset alone in a
 * ~700x310 panel reads as an empty box. The answer is not per-card art, it is
 * a SYSTEM — a lit ground, an oversized echo of the subject's own icon, a gold
 * medallion, a large foreground focal icon, one piece of atmospheric character
 * art in the right of frame, and gold panel detailing. Every layer but the
 * atmosphere art is driven by the SAME icon the card is already handed, so the
 * composition is dynamic for every subject and there is no per-subject styling
 * anywhere in it.
 *
 * ── WHAT IS SHARED AND WHAT IS NOT ─────────────────────────────────────────
 * Shared: the ground wash, the echo, the medallion and its rings/points/
 * flourishes, the glow, the specks, the focal icon, the pedestal shadow, the
 * filigree, the readability gradient, and the sizing tokens in index.css.
 *
 * Per subject: the ICON (obviously) and how the atmosphere art is SEATED.
 * That last one is not a design difference, it is an asset-shape difference:
 * `item-shopkeeper.png` is a tall alpha cut-out of a character, and
 * `Spellcaster.jpg` is a small opaque 320x180 landscape. Seating both with one
 * rule would either crop the shopkeeper's head off or upscale the spellbook to
 * ~3x its pixel width. Callers pass one `AtmosphereSeating` preset, which
 * carries the crop and the exposure together; the mask, the lantern light and
 * the fade-in are fixed here, so both read as the same layer in the same
 * system at the same weight.
 *
 * Tokens live on `[data-subject-media]`, which the card puts on BOTH the focal
 * zone and the backdrop — they are siblings, not ancestor and descendant, and
 * a custom property only inherits downwards. Names are deliberately neutral:
 * this stopped being item-only the moment summoner spells adopted it.
 */

/** The frame gradient the subject-media panel is readable under. */
export const SUBJECT_MEDIA_GRADIENT =
  "bg-[linear-gradient(to_top,rgba(4,3,2,0.94)_0%,rgba(4,3,2,0.66)_30%,rgba(4,3,2,0.12)_58%,transparent_78%)]";

/**
 * Seating for the atmosphere art, per asset shape. A preset carries the
 * geometry AND the tone normalisation together, because the two are not
 * independent: how bright a layer must be pushed depends on what the source
 * already is, and splitting them lets a caller pair a crop with the wrong
 * exposure.
 *
 * TALL_CUTOUT — a character PNG on transparency, taller than the band. Seated
 * by HEIGHT and allowed to overflow, so the figure keeps its proportions. The
 * source is already dark and muted, so it needs no exposure correction.
 *
 * WIDE_SCENE — an opaque landscape photo/illustration. Seated to the right of
 * the panel and cropped with `object-cover`, because scaling a 320px-wide
 * source across the full band would be a visible upscale. These sources are
 * shot high-key: `Spellcaster.jpg` at the cut-out's own 0.64/saturate(0.85)
 * flooded the panel with yellow and took the "dark premium" ground with it,
 * which is the one thing this composition cannot lose. Brightness is pulled
 * down so the layer lands at the SAME perceived weight as the cut-out — the
 * measured fix, not a taste adjustment: with the echo hidden, the atmosphere
 * alone was what lifted the panel.
 */
export type AtmosphereSeating = {
  className: string;
  filter: string;
  opacity: number;
};

export const ATMOSPHERE_TALL_CUTOUT: AtmosphereSeating = {
  className: "absolute bottom-[-8%] right-[-6%] h-[160%] w-auto max-w-none object-contain",
  filter: "saturate(0.85)",
  opacity: 0.64,
};

export const ATMOSPHERE_WIDE_SCENE: AtmosphereSeating = {
  className: "absolute inset-y-0 right-0 h-full w-[54%] object-cover",
  filter: "brightness(0.38) saturate(0.8)",
  opacity: 0.58,
};

/**
 * Fades the atmosphere art into the panel's dark left and bottom rather than
 * letting it end on a cut-out edge. Two ramps intersected, so a corner gets
 * both. Shared by every subject: it is what makes the layer read as presence
 * rather than as a pasted-in picture, and it is the reason an opaque JPEG can
 * sit in the same composition as an alpha PNG without looking like a sticker.
 */
const ATMOSPHERE_MASK =
  "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.45) 18%, #000 44%),"
  + " linear-gradient(to top, transparent 0%, rgba(0,0,0,0.5) 12%, #000 28%),"
  + " linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, #000 26%)";

/**
 * Everything behind the frame's readability gradient.
 *
 * Sits in `ScenarioCardFrame`'s `backgroundSlot`, so it inherits the frame's
 * Ken Burns pan, its vignette and its readability gradient rather than
 * re-implementing any of them. Three layers, back to front:
 *
 *   1. the warm interior wash, so the panel is not flat black;
 *   2. an oversized, blurred ECHO of the subject's own icon at 4x its size and
 *      22% opacity, anchored so it washes across the LEFT/background. It is
 *      positioned with plain `left`/`top` and no `-translate-x-1/2`:
 *      framer-motion writes its own `transform` for the scale drift, which
 *      silently overrides a Tailwind translate, so centring it that way never
 *      took effect. Blur is 3px, not more: the echo is already a ~64px source
 *      upscaled ~11x, and stacking blur on that erased the silhouette
 *      entirely on cooler, low-contrast art.
 *   3. the atmosphere art in the right of frame, masked as described above.
 */
export function SubjectMediaBackdrop({
  echoIcon,
  atmosphereSrc,
  atmosphereSeating = ATMOSPHERE_TALL_CUTOUT,
  atmosphereAlt = "",
}: {
  echoIcon?: string | null;
  atmosphereSrc: string;
  atmosphereSeating?: AtmosphereSeating;
  atmosphereAlt?: string;
}) {
  return (
    <div data-subject-media aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(125%_150%_at_46%_36%,#241a12_0%,#150f0a_46%,#070505_100%)]" />

      {echoIcon && (
        <motion.img
          src={echoIcon}
          alt=""
          className="absolute left-[-12%] top-[-47%] h-[var(--subject-echo)] w-[var(--subject-echo)] max-w-none rounded-[10%] object-cover opacity-[0.22] blur-[3px] saturate-[1.2]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.22, scale: [1, 1.05, 1] }}
          transition={{
            opacity: { duration: 0.6 },
            scale: { duration: 18, repeat: Infinity, ease: "easeInOut" },
          }}
        />
      )}

      {/* lantern light the atmosphere art is lit by */}
      <div className="absolute right-0 top-0 h-full w-[46%] bg-[radial-gradient(75%_85%_at_78%_45%,rgba(214,150,74,0.20)_0%,transparent_72%)]" />

      <motion.img
        src={atmosphereSrc}
        alt={atmosphereAlt}
        className={atmosphereSeating.className}
        style={{
          filter: atmosphereSeating.filter,
          maskImage: ATMOSPHERE_MASK,
          maskComposite: "intersect",
          WebkitMaskImage: ATMOSPHERE_MASK,
          WebkitMaskComposite: "source-in",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: atmosphereSeating.opacity }}
        transition={{ duration: 0.8 }}
      />
    </div>
  );
}

/**
 * The foreground focal subject — the one thing on this card that must read at
 * a glance. Sized off `--subject-hero-icon` (index.css), which steps with the
 * BAND'S HEIGHT, so a phone and a desktop each get the largest icon their band
 * can actually seat.
 */
function FocalIcon({ iconUrl, alt }: { iconUrl?: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  const box = "h-[var(--subject-hero-icon)] w-[var(--subject-hero-icon)]";
  if (!iconUrl || errored) {
    return (
      <div
        data-subject-hero-icon
        className={`flex ${box} items-center justify-center rounded-[18%] border border-[#d4b35a]/40 bg-black/40 text-[calc(0.22*var(--subject-hero-icon))] text-white/30`}
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={iconUrl}
      alt={alt}
      data-subject-hero-icon
      onError={() => setErrored(true)}
      className={`${box} rounded-[18%] border-2 border-[#d4b35a]/70 object-cover shadow-[0_22px_52px_-6px_rgba(0,0,0,0.95),0_0_0_1px_rgba(0,0,0,0.5)] ring-1 ring-[#f3dca0]/35`}
    />
  );
}

/**
 * The lit medallion the focal icon sits inside: a pool of warm light, a slowly
 * rotating dashed outer ring, a breathing inner ring, four cardinal diamonds,
 * two mirrored flourishes, a hextech glow, three drifting specks, the icon
 * itself and a pedestal shadow beneath it.
 *
 * `data-subject-media` is repeated here because the sizing tokens are declared
 * on that attribute and this subtree is a SIBLING of the backdrop.
 */
export function SubjectFocalZone({
  iconUrl,
  alt,
  beside = false,
}: {
  iconUrl?: string | null;
  alt: string;
  /**
   * Set when the card's caption is a STACK rather than a footer — the SSM
   * slice's spell carries a haste chip, a divider and its source rows.
   *
   * That stack is a column running most of a short band's height, so a
   * panel-centred icon has to overlap it however short the zone is made. The
   * geometry lives in index.css under `[data-subject-focal="beside"]`, which
   * seats the icon beside the column below the 190px band step and hands it
   * back the item card's centred proportions at and above it — the same
   * breakpoint the sizing tokens step on, so a desktop band is untouched.
   */
  beside?: boolean;
}) {
  return (
    <div
      data-subject-media
      data-subject-focal={beside ? "beside" : undefined}
      className={`pointer-events-none absolute top-0 flex items-center justify-center ${
        beside ? "" : "inset-x-0 h-[80cqh]"
      }`}
    >
      <div className="relative flex items-center justify-center">
        {/* warm pool of light the medallion sits in */}
        <div
          aria-hidden
          className="absolute h-[calc(2.6*var(--subject-hero-icon))] w-[calc(2.6*var(--subject-hero-icon))] rounded-full bg-[radial-gradient(circle,rgba(212,179,90,0.22)_0%,rgba(212,179,90,0.07)_42%,transparent_70%)]"
        />

        {/* medallion — outer dashed ring, slow rotation */}
        <motion.div
          aria-hidden
          className="absolute h-[var(--subject-medallion)] w-[var(--subject-medallion)] rounded-full border border-[#d4b35a]/45"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          style={{ borderStyle: "dashed" }}
        />
        {/* medallion — solid inner ring */}
        <motion.div
          aria-hidden
          className="absolute h-[var(--subject-medallion-inner)] w-[var(--subject-medallion-inner)] rounded-full border border-[#e8c97a]/40 bg-[radial-gradient(circle,rgba(232,201,122,0.10)_0%,transparent_68%)]"
          animate={{ scale: [1, 1.03, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* medallion cardinal points — four small gold diamonds on the ring */}
        {["top", "right", "bottom", "left"].map((side, i) => (
          <div
            key={side}
            aria-hidden
            className="absolute h-[var(--subject-medallion)] w-[var(--subject-medallion)]"
            style={{ transform: `rotate(${i * 90}deg)` }}
          >
            <div className="absolute left-1/2 top-0 h-[calc(0.042*var(--subject-hero-icon))] w-[calc(0.042*var(--subject-hero-icon))] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#e8c97a]/65" />
          </div>
        ))}

        {/* gold flourishes reaching out of the medallion, left and right. */}
        {/* Both classes are written out in full rather than interpolated:
            Tailwind extracts class names by scanning the source text, so a
            `bg-[linear-gradient(${dir},…)]` template would compile to no rule
            at all and these would silently render as nothing. */}
        {([
          ["right", "absolute top-1/2 h-px w-[calc(0.9*var(--subject-hero-icon))] -translate-y-1/2 bg-[linear-gradient(to_right,rgba(212,179,90,0.7),transparent)]"],
          ["left", "absolute top-1/2 h-px w-[calc(0.9*var(--subject-hero-icon))] -translate-y-1/2 bg-[linear-gradient(to_left,rgba(212,179,90,0.7),transparent)]"],
        ] as const).map(([side, cls]) => (
          <div
            key={side}
            aria-hidden
            className={cls}
            style={{ [side]: "calc(50% + 0.56 * var(--subject-medallion))" } as CSSProperties}
          />
        ))}

        {/* soft hextech glow directly behind the subject */}
        <motion.div
          aria-hidden
          className="absolute h-[calc(1.05*var(--subject-hero-icon))] w-[calc(1.05*var(--subject-hero-icon))] rounded-full bg-[#d4b35a]/30 blur-2xl"
          animate={{ opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* particle specks — kept proportional to the subject, not to the card */}
        {[
          { x: -0.62, y: -0.34, delay: 0 },
          { x: 0.66, y: -0.14, delay: 1.6 },
          { x: 0.48, y: 0.5, delay: 3.1 },
        ].map((p, i) => (
          <motion.div
            key={i}
            aria-hidden
            className="absolute h-[calc(0.032*var(--subject-hero-icon))] w-[calc(0.032*var(--subject-hero-icon))] rounded-full bg-[#f3dca0]"
            style={{
              left: `calc(50% + ${p.x} * var(--subject-hero-icon))`,
              top: `calc(50% + ${p.y} * var(--subject-hero-icon))`,
            }}
            animate={{ y: [0, -8, 0], opacity: [0, 0.8, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
          />
        ))}

        {/* crisp focal icon with float */}
        <motion.div
          className="relative"
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <FocalIcon iconUrl={iconUrl} alt={alt} />
        </motion.div>

        {/* pedestal shadow */}
        <motion.div
          aria-hidden
          className="absolute top-[calc(0.68*var(--subject-hero-icon))] h-[calc(0.115*var(--subject-hero-icon))] w-[calc(0.79*var(--subject-hero-icon))] rounded-[50%] bg-black/55 blur-md"
          animate={{ scaleX: [1, 0.9, 1], opacity: [0.55, 0.4, 0.55] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

/**
 * The gold detailing the concept frames the media panel with: a bracket in
 * each corner and one ornament centred on the bottom edge. Purely decorative,
 * expressed in `cqmin`/`cqh` so it thins out with the band instead of crowding
 * a phone.
 */
export function PanelFiligree() {
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

/**
 * The bottom label block both cards share: the subject's name and a caption
 * under it, bottom anchored with 7% gutters and padding in `cqh` so it
 * resolves against the band's HEIGHT rather than its width.
 */
export function SubjectMediaCaption({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[8.89cqh]">{children}</div>
  );
}
