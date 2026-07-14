/**
 * CTA elements for content screenshots, rendered IDENTICALLY in the question
 * and correct states:
 *
 *   QuizCtaTop — compact centered strip ABOVE the quiz card: wordmark +
 *                "Play more LoL quizzes at mogsy.app" (mogsy.app prominent).
 *   QuizCtaQr  — small standalone QR BELOW the quiz card: white tile with a
 *                quiet zone, deterministic SVG encoding the quiz URL.
 *
 * There is deliberately NO combined bottom panel — text lives above the card,
 * the QR below it, and neither ever sits inside the answer area.
 */
import qrcodegen from "qrcode-generator";

/** Quiz acquisition target: the live quiz landing page (shorter than any
 *  campaign URL, more precise than the bare domain). */
export const CTA_URL = "https://mogsy.app/quiz";
export const CTA_TEXT = "Play more LoL quizzes at";
export const CTA_DOMAIN = "mogsy.app";

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

/** Compact centered CTA strip shown ABOVE the quiz card. */
export function QuizCtaTop() {
  return (
    <div
      data-quiz-cta
      data-quiz-cta-mode="top"
      className="flex items-center justify-center gap-2.5 text-center"
      style={{ color: "hsl(42 45% 80%)" }}
    >
      <img src="/mogsy-logo-text.png" alt="Mogsy" className="h-10 w-auto opacity-95" />
      <span className="text-[17px] leading-tight">
        {CTA_TEXT}{" "}
        <span className="font-bold tracking-wide text-[19px]" style={{ color: "hsl(42 75% 62%)" }}>
          {CTA_DOMAIN}
        </span>
      </span>
    </div>
  );
}

/** Small standalone QR tile shown BELOW the quiz card. The white padding is
 *  the scanability quiet zone (plus two quiet modules inside the viewBox). */
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
