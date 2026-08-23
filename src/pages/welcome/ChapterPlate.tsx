import combatMage from "@/academy/welcome/combat-mage.png";
import combatTank from "@/academy/welcome/combat-tank.png";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";

import type { ChapterArt } from "./academyChapters";

/**
 * What the register card is currently showing.
 *
 * The one illustration in the book that is fed by live state rather than by the
 * script. Passed down rather than read from a store so that ChapterPlate stays
 * a pure renderer and the page keeps owning the form's state — including when
 * the same plate is rendered a second time onto a turning sheet, where it must
 * show exactly what it showed a moment ago.
 */
export interface RegisterMirror {
  /** The name as typed, already trimmed for display. Empty until they type. */
  username: string;
  /** The chosen rank's display label, or null while none is chosen. */
  rankLabel: string | null;
}

/**
 * The illustration on a chapter's page.
 *
 * Every chapter's artwork is composed into the SAME square box and revealed by
 * the same wash, so the reveal reads as "this page is being illustrated" rather
 * than as four unrelated widgets taking turns. That uniformity is doing real
 * work: the source art is uneven — one finished Academy plate, two composed
 * scenes, one mascot, and nothing at all for the data chapter — and a layout
 * that let each one size itself would put that unevenness on display. HI1-2
 * learned this the expensive way with a four-card grid.
 *
 * THE INKED-PLATE TREATMENT. The book's pages are light parchment, and most of
 * this artwork is dark: the Academy plates are navy, and the Mogzy class
 * characters have no alpha channel at all (they are RGB on solid black, which
 * is why they may never be dropped onto a lit surface directly — see the same
 * note in MogzyEntryV2 and AcademyModeExhibit). Rather than fight that, the
 * dark art is mounted inside a dark panel with a gold hairline, so it reads as
 * an engraving pressed into the page. Mogzy himself is the exception: he is the
 * one asset with real alpha and saturated colour, so he stands on the parchment
 * unframed, as a drawn character.
 *
 * All artwork is local. This is the first thing a new visitor sees, so nothing
 * in it waits on the champion-assets API — a first impression that renders empty
 * because a backend is cold is worse than no artwork at all.
 */
export default function ChapterPlate({
  art,
  register,
}: {
  art: ChapterArt;
  /** Only meaningful for `{ kind: "register" }`; ignored by every other art. */
  register?: RegisterMirror;
}) {
  if (art.kind === "mascot") {
    return (
      <div
        className={[
          "tome-art flex h-full w-full items-center justify-center",
          art.entrance ? "tome-mogzy-entrance" : "",
        ].join(" ")}
      >
        <div className="tome-mogzy relative flex h-full items-center justify-center">
          {art.entrance && (
            <>
              {/* The haze gathering around the apparition. Behind him, sized off
                  him, gone once he has resolved. */}
              <div className="tome-mogzy-glow" aria-hidden="true" />
              {/* A handful of motes drifting up out of the gathering — an
                  Academy apparition, not a particle spectacle. Each span gets
                  its position and beat from indexed custom properties in CSS. */}
              <div className="tome-mogzy-motes" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </>
          )}
          <MogzyMascot
            pose="base"
            decorative
            loading="eager"
            className="tome-mogzy-figure h-full max-h-[min(38vh,270px)] w-auto"
            style={{ filter: "drop-shadow(0 10px 26px rgba(60,42,12,0.34))" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tome-art flex h-full w-full items-center justify-center">
      <div className="tome-plate relative flex aspect-square h-full max-h-[min(36vh,260px)] items-center justify-center">
        {art.kind === "plate" && <MedallionArt src={art.src} focus={art.emblemFocus} />}
        {art.kind === "duel" && <DuelArt />}
        {art.kind === "register" && (
          <RegisterArt username={register?.username ?? ""} rankLabel={register?.rankLabel ?? null} />
        )}
        {art.kind === "chart" && <ChartArt />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A painted Academy plate, shown emblem-only.
 *
 * The source images are complete card designs — plate, emblem, and the mode's
 * name ENGRAVED INTO THE PIXELS. `focus` frames the emblem so that engraved
 * name falls outside the circle: Leaguecraft's reads "Leaguecraft Studies",
 * which is not the approved product name, and the page prints the real name in
 * real text alongside either way. A corrected asset can be dropped in and the
 * focus value simply re-tuned or removed.
 */
function MedallionArt({ src, focus }: { src: string; focus: string }) {
  return (
    <div className="relative h-full w-full">
      {/* Rings hung on negative insets of the medallion rather than sized
          independently, so they scale with it at every viewport. Ink-coloured
          here, not gold: on parchment a gold ring disappears. */}
      <div
        className="pointer-events-none absolute -inset-[6%] rounded-full"
        aria-hidden="true"
        style={{ border: "1px solid rgba(43,35,20,0.28)" }}
      />
      <div
        className="pointer-events-none absolute -inset-[13%] rounded-full"
        aria-hidden="true"
        style={{ border: "1px solid rgba(43,35,20,0.14)" }}
      />
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          border: "1px solid rgba(107,84,24,0.55)",
          boxShadow: "0 10px 26px rgba(60,42,12,0.34), inset 0 0 26px rgba(0,0,0,0.45)",
        }}
      >
        <img
          src={src}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="h-full w-full scale-[1.55] object-cover"
          style={{ objectPosition: focus }}
        />
      </div>
    </div>
  );
}

/**
 * Combat Lab — two combatants and a damage readout, staged as a plate.
 *
 * The class characters stand for combat roles throughout the product. They are
 * RGB with no alpha, so each is mounted inside its own black-grounded frame
 * where that ground reads as the inside of the frame.
 */
function DuelArt() {
  return (
    <div
      className="flex h-full w-full flex-col gap-2 rounded-xl p-2.5"
      style={{
        background: "linear-gradient(180deg, #10182b 0%, #070c17 100%)",
        border: "1px solid rgba(107,84,24,0.6)",
        boxShadow: "0 12px 28px rgba(60,42,12,0.38)",
      }}
    >
      {/* The combatants take the plate's width, with the readout beneath them
          rather than wedged between: side by side with a column of numbers in
          the middle, each portrait is squeezed to about a quarter of a square
          plate, and `object-contain` then renders the character at a third of
          the height available — a large dark frame with a small figure in it. */}
      <div className="flex min-h-0 flex-1 items-stretch gap-2">
        <Combatant src={combatMage} />
        <Combatant src={combatTank} />
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2.5">
        <span className="ranked-title text-[clamp(0.95rem,2.4vw,1.5rem)] leading-none text-[#ff9d6b] drop-shadow-[0_0_14px_rgba(255,120,60,0.5)]">
          1,284
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[8px] uppercase leading-none tracking-[0.24em] text-[#cfc4a5]/65">
            damage
          </span>
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-[#ff6b4a] to-[#ffb46b]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Combatant({ src }: { src: string }) {
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-[#c9a84c]/30 bg-black">
      {/* `cover`, not `contain`: the source has no alpha channel, so its black
          ground IS the frame's interior and cropping into it costs nothing. */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center 32%" }}
      />
    </div>
  );
}

/**
 * The Academy register — the second spread's illustration, and a mirror.
 *
 * Every other plate in the book is a picture of the product. This one is a
 * picture of the VISITOR: a registration card inked onto the page whose two
 * ruled lines fill in with the name and the rank as they are entered beside it,
 * and whose wax seal presses in once both are there. That is the whole reason
 * the registration reads as part of the tome rather than as a web form dropped
 * into one — the form is the pen, and this is the page it is writing on.
 *
 * ENTIRELY `aria-hidden`. It duplicates, character for character, fields that
 * are already live labelled controls a few inches away; a screen reader hearing
 * the name announced a second time from a decoration would be reading the same
 * thing twice. The card is presentation for the eye only, exactly like every
 * other illustration in this file.
 */
function RegisterArt({ username, rankLabel }: { username: string; rankLabel: string | null }) {
  const sealed = Boolean(username && rankLabel);
  return (
    <div
      className="tome-register"
      data-sealed={sealed ? "true" : "false"}
      data-testid="academy-register-card"
      aria-hidden="true"
    >
      <p className="tome-register-title">Academy Register</p>
      <RegisterLine label="Name" value={username} />
      <RegisterLine label="Rank" value={rankLabel ?? ""} />
      {/* The seal. Faint and unpressed until the card is complete, so the page
          shows the visitor how close they are without printing a validation
          message onto the artwork. */}
      <div className="tome-register-seal">
        <span className="tome-register-seal-mark">M</span>
      </div>
    </div>
  );
}

/** One ruled line of the register: a label, and whatever has been written. */
function RegisterLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="tome-register-field" data-filled={value ? "true" : "false"}>
      <span className="tome-register-label">{label}</span>
      <span className="tome-register-value">{value}</span>
    </div>
  );
}

/**
 * Pro Data & Esports — a chart ruled onto the page.
 *
 * Drawn rather than photographed, and drawn in ink on the parchment rather than
 * mounted on a dark plate: this chapter has no source artwork, and inventing a
 * fake screenshot of a real product is worse than having none. The strokes are
 * plain SVG paths animated by dash offset, so the chart genuinely draws itself
 * in the same gesture as the writing beside it.
 *
 * The shape is illustrative, not a data claim — no axis is labelled and no
 * number is printed, precisely so it cannot be read as a real statistic.
 *
 * EXPORTED because the last spread composes its own two pages rather than
 * taking the templated illustration slot (see FinaleSpread), and this is the
 * figure it puts on the left one. It is the same component drawing the same
 * paths — nothing about the graph itself changed.
 */
export function ChartArt() {
  const INK = "#2b3a57";
  const FAINT = "rgba(43,58,87,0.22)";
  const ACCENT = "#8a6d2a";
  return (
    <svg
      viewBox="0 0 200 200"
      className="h-full w-full"
      role="presentation"
      aria-hidden="true"
      fill="none"
    >
      {/* Ruled grid — laid down first, like guide lines. */}
      {[52, 84, 116, 148].map((y, i) => (
        <line
          key={y}
          className="tome-stroke"
          x1="26"
          y1={y}
          x2="182"
          y2={y}
          stroke={FAINT}
          strokeWidth="1"
          style={{ ["--len" as string]: "160", ["--d" as string]: `${i * 150}` }}
        />
      ))}
      {/* Axes. */}
      <path
        className="tome-stroke"
        d="M26 24 L26 172 L182 172"
        stroke={INK}
        strokeWidth="1.8"
        strokeLinecap="round"
        style={{ ["--len" as string]: "310", ["--d" as string]: "540" }}
      />
      {/* The comparison series — quieter, drawn second. */}
      <path
        className="tome-stroke"
        d="M34 138 C 66 132, 92 142, 118 118 S 160 108, 176 96"
        stroke={ACCENT}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ ["--len" as string]: "175", ["--d" as string]: "1150" }}
      />
      {/* The lead series. */}
      <path
        className="tome-stroke"
        d="M34 152 C 62 150, 84 112, 112 96 S 152 62, 176 44"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
        style={{ ["--len" as string]: "195", ["--d" as string]: "1650" }}
      />
      {/* Plot points, pressed in after the line. */}
      {[
        [34, 152],
        [72, 128],
        [112, 96],
        [148, 66],
        [176, 44],
      ].map(([cx, cy], i) => (
        <circle
          key={`${cx}-${cy}`}
          className="tome-dot"
          cx={cx}
          cy={cy}
          r="3.4"
          fill={INK}
          style={{ ["--d" as string]: `${2350 + i * 140}` }}
        />
      ))}
    </svg>
  );
}
