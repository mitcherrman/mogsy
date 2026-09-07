/**
 * CON1 Step 4 — the factory's BRAND chrome, in the current Mogzy academy
 * language.
 *
 *   MogzyWordmark  — the wordmark itself, SET IN TYPE rather than loaded from
 *                    an image. See below for why.
 *   QuizCtaTop     — the brand lockup that sits above the folio in the
 *                    stacked (portrait/square) compositions.
 *   QuizCtaRail    — the same lockup rebuilt as a vertical rail for the
 *                    landscape compositions, where nothing sits "above" the
 *                    card at all.
 *   QuizCtaQr      — the standalone QR tile, unchanged in behaviour.
 *
 * ### The wordmark is type, not `mogsy-logo-text.png`
 *
 * That PNG is the pre-2026 mark: a lowercase blue-to-violet "mogsy". It is the
 * wrong NAME, not merely the wrong style, so retinting or re-cropping it was
 * never an option — and the repo has no Mogzy wordmark file to swap in (see
 * the note in `index.css` above `--lc-laid-paper`, which reached the same
 * conclusion for the Leaguecraft scroll and chose paper over iconography).
 *
 * So the wordmark is set in Cinzel, the academy display face the live site
 * already uses for `.theme-lol h1/h2` and `.ranked-title`, in the Ranked
 * academy's own gold. It is a real DOM node carrying `data-quiz-brand-mark`,
 * which is what the capture gate now checks — the gate used to assert
 * `img.src.includes("mogsy-logo")`, and a filename is a poor proxy for "the
 * brand rendered".
 *
 * Cinzel is loaded by `index.html` and the harness waits on
 * `document.fonts.ready` before it stamps ready, so a capture never catches
 * the fallback mid-swap. If the face genuinely cannot load, the stack degrades
 * to Georgia — the same degradation `.ranked-title` has always accepted.
 */
import qrcodegen from "qrcode-generator";
import { SITE_DOMAIN, SITE_NAME, SITE_URL } from "@/lib/site-config";
import { QUESTION_PROMPT, REVEAL_PROMPT } from "@/lib/quiz-screenshot/cta";

/** Quiz acquisition target: the live quiz landing page (shorter than any
 *  campaign URL, more precise than the bare domain). Derived from the central
 *  site config so a domain change propagates automatically. */
export const CTA_URL = `${SITE_URL}/quiz`;
export const CTA_TEXT = QUESTION_PROMPT;
export const CTA_DOMAIN = SITE_DOMAIN;

/**
 * The stacked lockup's box is a CONSTANT, not its content's natural width.
 *
 * The prompt line differs between a question card and a reveal card, and the
 * cross-state geometry gate compares the two captures' lockup rects: a line
 * that sized itself made the strip 301px wide on one and 230px on the other,
 * and every question/correct pair in the run failed `layout-shift` on it. A
 * fixed box makes the two identical by construction, and leaves the copy free.
 */
export const CTA_STRIP_WIDTH = 420;

/** The academy display stack, mirrored from `.ranked-title` in index.css. */
const ACADEMY_FACE = '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif';

/** Ranked academy palette, mirrored from the `.ranked-academy` custom
 *  properties. Mirrored rather than inherited, because the lockup renders
 *  outside the folio subtree those properties are declared on. */
const GOLD = "#d5b66f";
const GOLD_DEEP = "#b9934c";
const VELLUM = "#e9dcbe";

/** Deterministic QR as an SVG path (module grid → one path, crisp at any size). */
export function buildQrSvgPath(text: string): { path: string; size: number } {
  const qr = qrcodegen(0, "M"); // type 0 = auto-size, medium error correction
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { path, size };
}

/**
 * The wordmark. `data-quiz-brand-mark` is the capture gate's hook; the text is
 * `SITE_NAME`, so a card cannot say a different name from the rest of the app.
 */
export function MogzyWordmark({ px = 40 }: { px?: number }) {
  return (
    <span
      data-quiz-brand-mark
      style={{
        fontFamily: ACADEMY_FACE,
        fontWeight: 700,
        fontSize: px,
        lineHeight: 1.05,
        letterSpacing: "0.14em",
        color: GOLD,
        textShadow: `0 1px 0 rgba(2,6,16,0.85), 0 0 ${Math.round(px * 0.5)}px rgba(213,182,111,0.28)`,
      }}
    >
      {SITE_NAME.toUpperCase()}
    </span>
  );
}

/** A brass hairline that fades out at both ends — the academy's one ornament,
 *  reused from the `.ranked-header-plate::before` treatment. */
function BrassRule({ width = "100%", height = 1 }: { width?: number | string; height?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width,
        height,
        background: `linear-gradient(90deg, transparent 0%, ${GOLD_DEEP}59 22%, ${GOLD}f2 50%, ${GOLD_DEEP}59 78%, transparent 100%)`,
      }}
    />
  );
}

/**
 * The stacked brand lockup, above the folio.
 *
 * variant "full"  — question/recap/reveal slides: wordmark, brass rule, and
 *                   the prompt line with the domain as its loudest word.
 * variant "brand" — end slides (app-cta/community): the wordmark alone, at a
 *                   larger size, because the slide body carries the messaging.
 *
 * `tone` picks which prompt line is printed. A reveal has already answered the
 * question, so it invites the next one instead of repeating the play line.
 */
export function QuizCtaTop({
  variant = "full",
  tone = "question",
}: {
  variant?: "full" | "brand";
  tone?: "question" | "reveal";
}) {
  if (variant === "brand") {
    return (
      <div
        data-quiz-cta
        data-quiz-cta-mode="brand"
        className="flex flex-col items-center justify-center gap-2 text-center"
        style={{ width: CTA_STRIP_WIDTH }}
      >
        <MogzyWordmark px={62} />
        <BrassRule width={280} />
      </div>
    );
  }
  return (
    <div
      data-quiz-cta
      data-quiz-cta-mode="top"
      className="flex flex-col items-center justify-center gap-1.5 text-center"
      style={{ color: VELLUM, width: CTA_STRIP_WIDTH }}
    >
      <MogzyWordmark px={38} />
      <BrassRule width={230} />
      <span className="text-[17px] leading-tight" style={{ opacity: 0.86 }}>
        {tone === "reveal" ? REVEAL_PROMPT : QUESTION_PROMPT}{" "}
        <span className="font-bold tracking-wide text-[19px]" style={{ color: GOLD }}>
          {CTA_DOMAIN}
        </span>
      </span>
    </div>
  );
}

/**
 * The landscape rail. The same three elements as the stacked lockup — mark,
 * rule, domain — plus the QR, stacked vertically in a column beside the folio.
 *
 * It carries `data-quiz-cta` too, so every gate that asks "did this capture
 * render the brand" keeps working across both compositions without having to
 * learn about layout families.
 */
export function QuizCtaRail({
  tone = "question",
  qrPx = 108,
}: {
  tone?: "question" | "reveal";
  qrPx?: number;
}) {
  return (
    <div
      data-quiz-cta
      data-quiz-cta-mode="rail"
      className="flex h-full flex-col items-center justify-center gap-5 text-center"
      style={{ color: VELLUM }}
    >
      <div className="flex flex-col items-center gap-2">
        <MogzyWordmark px={46} />
        <BrassRule width={190} />
        <span className="text-[19px] font-bold tracking-wide" style={{ color: GOLD }}>
          {CTA_DOMAIN}
        </span>
      </div>
      <span className="max-w-[15ch] text-[15px] leading-snug" style={{ opacity: 0.78 }}>
        {tone === "reveal" ? "More League questions" : "Play more LoL quizzes"}
      </span>
      <QuizCtaQr px={qrPx} />
      <span
        data-quiz-cta-scan
        className="text-[13px] font-semibold tracking-wide"
        style={{ color: VELLUM, opacity: 0.8 }}
      >
        Scan to play
      </span>
    </div>
  );
}

/** Small standalone QR tile. The white padding is the scanability quiet zone
 *  (plus two quiet modules inside the viewBox). */
export function QuizCtaQr({ px = 76 }: { px?: number }) {
  const { path, size } = buildQrSvgPath(CTA_URL);
  const quiet = 2; // quiet-zone modules around the code
  return (
    <div
      data-quiz-cta-qr
      className="rounded-md bg-white p-1.5 shrink-0"
      style={{ width: px, height: px }}
    >
      <svg
        viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        role="img"
        aria-label={CTA_URL}
      >
        <path d={path} fill="#0a1022" />
      </svg>
    </div>
  );
}
