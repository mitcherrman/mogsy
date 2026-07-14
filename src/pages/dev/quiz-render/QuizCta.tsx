/**
 * CTA footer for content screenshots: Mogsy wordmark, "Play more LoL quizzes
 * at mogsy.app", and a deterministic QR code pointing at the quiz landing
 * page. Rendered by the content shell OUTSIDE the answer area (fixed footer
 * strip), never overlapping the question card.
 *
 * compact → single-line strip (question state / tight formats)
 * full    → wordmark + CTA text + QR block (reveal states)
 */
import qrcodegen from "qrcode-generator";
import type { CtaMode } from "@/lib/quiz-screenshot/types";

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

function QrBlock({ px }: { px: number }) {
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

export default function QuizCta({ mode }: { mode: Exclude<CtaMode, "none"> }) {
  if (mode === "compact") {
    return (
      <div
        data-quiz-cta
        data-quiz-cta-mode="compact"
        className="flex items-center justify-center gap-2.5 text-[13px]"
        style={{ color: "hsl(42 45% 78%)" }}
      >
        <img src="/mogsy-logo-text.png" alt="Mogsy" className="h-9 w-auto opacity-95" />
        <span className="opacity-80 text-[15px]">{CTA_TEXT}</span>
        <span className="font-bold tracking-wide text-[16px]" style={{ color: "hsl(42 75% 62%)" }}>
          {CTA_DOMAIN}
        </span>
      </div>
    );
  }
  return (
    <div
      data-quiz-cta
      data-quiz-cta-mode="full"
      className="flex items-center justify-center gap-4 rounded-xl border px-5 py-3.5"
      style={{
        borderColor: "hsl(188 75% 38% / 0.5)",
        background: "hsl(213 55% 8% / 0.92)",
        boxShadow: "inset 0 0 0 1px hsl(215 55% 5%), 0 6px 24px -10px hsl(215 80% 2% / 0.8)",
      }}
    >
      <QrBlock px={84} />
      <div className="flex flex-col items-start gap-1.5">
        <img src="/mogsy-logo-text.png" alt="Mogsy" className="h-12 w-auto" />
        <div className="text-[16px] leading-tight" style={{ color: "hsl(42 45% 80%)" }}>
          {CTA_TEXT}{" "}
          <span className="font-bold tracking-wide" style={{ color: "hsl(42 75% 62%)" }}>
            {CTA_DOMAIN}
          </span>
        </div>
      </div>
    </div>
  );
}
