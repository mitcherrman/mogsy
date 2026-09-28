/**
 * HUB6.3E — the room's game-like marks: record medals, the streak flame and
 * chain, and the current-vs-previous board.
 *
 * RECORDS are the server's (`records[]`: first attempt / new / tied / below,
 * prior best EXCLUDING this attempt). Only a new or tied record is gilded, and
 * only it catches the light — once. A first attempt shows its value with no
 * medal claim. Deliberately absent: the raw Daily score (Review awards points
 * after misses), best accuracy, fewest strikes.
 */
import { useId, useRef } from "react";
import { Flame, Link2 } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { clamp01 } from "@/lib/motion/easing";
import type { PersonalRecord } from "@/lib/history/contracts";
import { instantDateLabel } from "@/components/quiz/workspace/historyFormat";
import { RECORD_LABEL } from "@/components/quiz/workspace/historyComparisons";
import { CHART } from "./ink";
import { Counted, DeltaChip, useNarrow } from "./charts";

// ─────────────────────────────────────────────────────────── medal

export type MedalShape = "round" | "shield" | "star" | "hex";

const SHAPE_PATH: Record<MedalShape, string> = {
  round: "M50,6 a38,38 0 1,1 -0.01,0 Z",
  shield: "M50,6 L86,16 L86,44 C86,68 70,84 50,94 C30,84 14,68 14,44 L14,16 Z",
  star: "M50,4 L60,24 L82,18 L76,40 L96,50 L76,60 L82,82 L60,76 L50,96 L40,76 L18,82 L24,60 L4,50 L24,40 L18,18 L40,24 Z",
  hex: "M50,5 L89,27 L89,73 L50,95 L11,73 L11,27 Z",
};

/**
 * One personal record as a medal. `glyph` names what it counts (a stopwatch
 * for questions played, a tower for depth); `shape` tells records apart at a
 * glance. The value counts from the prior best to this attempt's value.
 */
export function RecordMedal({
  record,
  label,
  glyph: Glyph,
  shape,
  progress,
  format = (v) => String(Math.round(v)),
  testId,
}: {
  record: PersonalRecord | null;
  label: string;
  glyph: React.ElementType;
  shape: MedalShape;
  progress: number;
  format?: (v: number) => string;
  testId?: string;
}) {
  const motion = useMotionAllowed();
  const uid = useId().replace(/:/g, "");
  if (!record || record.current === null) return null;
  const status = record.status;
  const gilded = status === "new_record" || status === "tied_record";
  const first = status === "first_attempt";
  const done = progress >= 1;
  // prior → current: the number climbs from the old best when it beats it.
  const from = record.priorBest !== null && gilded ? record.priorBest : 0;
  const shown = done ? record.current : from + (record.current - from) * clamp01(progress);
  const fill = status === "new_record"
    ? `url(#${uid}-gold)`
    : status === "tied_record" ? `url(#${uid}-pale)` : first ? "rgba(255,249,233,0.4)" : "rgba(239,226,194,0.9)";
  const stroke = gilded ? "#7a5610" : first ? "rgba(96,68,28,0.45)" : "rgba(96,68,28,0.55)";
  const statusText = status ? RECORD_LABEL[status] : "";
  const recordLine = status === "below_record" && record.priorBest !== null
    ? `Record ${format(record.priorBest)}${record.priorBestCompletedAt ? ` · ${instantDateLabel(record.priorBestCompletedAt)}` : ""}`
    : status === "new_record" && record.priorBest !== null
      ? `Previous best ${format(record.priorBest)}`
      : status === "tied_record"
        ? `Matches your best${record.priorBestCompletedAt ? ` from ${instantDateLabel(record.priorBestCompletedAt)}` : ""}`
        : first ? "No earlier attempt to compare" : null;
  return (
    <figure
      className="flex min-w-0 flex-row flex-wrap items-center gap-[12px] text-left [@container(min-width:16rem)]:flex-col [@container(min-width:16rem)]:flex-nowrap [@container(min-width:16rem)]:gap-0 [@container(min-width:16rem)]:text-center"
      data-testid={testId ?? "record-medal"}
      data-metric={record.metric}
      data-status={status ?? "unknown"}
      aria-label={`${label}: ${format(record.current)}. ${statusText}.${recordLine ? ` ${recordLine}.` : ""}`}
      role="group"
    >
      <div className={`relative h-[68px] w-[68px] shrink-0 [@container(min-width:16rem)]:h-[80px] [@container(min-width:16rem)]:w-[80px] [@container(min-width:24rem)]:h-[100px] [@container(min-width:24rem)]:w-[100px] ${gilded && done && motion ? "history-medal-settle" : ""}`}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <radialGradient id={`${uid}-gold`} cx="35%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#fbe8a8" />
              <stop offset="55%" stopColor="#d5a948" />
              <stop offset="100%" stopColor="#9c7424" />
            </radialGradient>
            <radialGradient id={`${uid}-pale`} cx="35%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#fbf0cf" />
              <stop offset="100%" stopColor="#dcc28a" />
            </radialGradient>
          </defs>
          {gilded && (
            <g opacity={done ? 1 : 0.3}>
              <path d="M34,78 L26,99 L37,94 L42,103 L48,82 Z" fill={status === "new_record" ? "#7a2820" : "#8a6a2c"} />
              <path d="M66,78 L74,99 L63,94 L58,103 L52,82 Z" fill={status === "new_record" ? "#7a2820" : "#8a6a2c"} />
            </g>
          )}
          <path d={SHAPE_PATH[shape]} fill={fill} stroke={stroke} strokeWidth={first ? 2 : 2.5}
            strokeDasharray={first ? "4 3" : undefined} />
          {gilded && <path d={SHAPE_PATH[shape]} fill="none" stroke="rgba(255,249,233,0.7)" strokeWidth={1} transform="translate(50 50) scale(0.84) translate(-50 -50)" />}
        </svg>
        {status === "new_record" && done && motion && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: "circle(46% at 50% 50%)" }}>
            <span className="history-medal-shine absolute -inset-y-2 left-0 block w-5" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,240,0.85), transparent)" }} />
          </span>
        )}
        <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <div className="flex flex-col items-center leading-none">
            <Glyph className="mb-0.5 h-4 w-4" style={{ color: gilded ? "#4a3208" : LEAGUECRAFT_INK.brass }} aria-hidden={true} />
            <span className="text-[19px] font-black tabular-nums [@container(min-width:24rem)]:text-[23px]" style={{ color: gilded ? "#2a1a04" : LEAGUECRAFT_INK.strong }}>
              {format(shown)}
            </span>
          </div>
        </div>
      </div>
      <figcaption className="min-w-0 max-w-full [@container(min-width:16rem)]:mt-1.5">
        <span className="block text-[11px] font-extrabold" style={{ color: LEAGUECRAFT_INK.strong }}>{label}</span>
        <span
          className="mt-0.5 inline-block rounded-full px-1.5 text-[9.5px] font-black uppercase tracking-[0.12em]"
          style={{
            background: status === "new_record" ? "#7a2820" : status === "tied_record" ? "#8a6a2c" : "transparent",
            color: gilded ? "#fff3df" : LEAGUECRAFT_INK.faint,
            border: gilded ? undefined : "1px solid rgba(96,68,28,0.3)",
          }}
          data-testid="record-status"
        >
          {statusText}
        </span>
        {recordLine && (
          <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>{recordLine}</span>
        )}
      </figcaption>
    </figure>
  );
}

// ─────────────────────────────────────────────────────────── streak

/**
 * The streak as a chain: one link per consecutive correct answer, for this
 * attempt, the previous one and the best — on one scale — with a flame at the
 * end of this attempt's chain once it has resolved. `onLight` lights the
 * streak's exact questions on the rail.
 */
export function StreakChain({
  current,
  previous,
  best,
  progress,
  onLight,
  lit = false,
  onPreview,
  testId,
  percentileNote,
}: {
  current: number;
  previous: number | null;
  best: number | null;
  progress: number;
  onLight?: () => void;
  lit?: boolean;
  onPreview?: (on: boolean) => void;
  testId?: string;
  percentileNote?: React.ReactNode;
}) {
  const motion = useMotionAllowed();
  const coarse = useCoarsePointer();
  const top = Math.max(current, previous ?? 0, best ?? 0, 1);
  const per = top > 36 ? Math.ceil(top / 36) : 1; // one link per `per` answers
  const done = progress >= 1;
  const rows: Array<{ key: string; label: string; value: number | null; mine: boolean }> = [
    { key: "current", label: "This attempt", value: current, mine: true },
    { key: "previous", label: "Previous", value: previous, mine: false },
    { key: "best", label: "Best before", value: best, mine: false },
  ];
  const delta = previous !== null ? current - previous : null;
  return (
    <div className="min-w-0" data-testid={testId ?? "streak-chain"} data-streak={current}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-end gap-1.5">
          <span className={`relative grid h-12 w-10 place-items-center ${done && motion && current > 0 ? "history-flame-in" : ""}`} aria-hidden="true">
            <Flame className="h-11 w-11" style={{ color: current > 0 ? "#c2571a" : "rgba(96,68,28,0.3)", fill: current > 0 ? "rgba(236,150,46,0.55)" : "transparent", opacity: done || !motion ? 1 : 0.5 }} />
          </span>
          <span className="pb-0.5">
            <span className="block text-[30px] font-black leading-none tabular-nums" style={{ color: LEAGUECRAFT_INK.strong, textShadow: LEAGUECRAFT_INK.press }}>
              <Counted value={current} progress={progress} />
            </span>
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: LEAGUECRAFT_INK.faint }}>
              in a row
            </span>
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-1">
          {delta !== null && (
            <DeltaChip
              direction={delta > 0 ? "up" : delta < 0 ? "down" : "same"}
              text={delta === 0 ? "Same as previous" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs previous`}
            />
          )}
          {percentileNote}
        </div>
        {onLight && current > 0 && (
          <button
            type="button"
            aria-pressed={lit}
            onClick={onLight}
            onPointerEnter={(e) => e.pointerType !== "touch" && onPreview?.(true)}
            onPointerLeave={(e) => e.pointerType !== "touch" && onPreview?.(false)}
            onFocus={() => onPreview?.(true)}
            onBlur={() => onPreview?.(false)}
            data-testid="streak-light"
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 text-[10.5px] font-bold transition-colors hover:bg-[rgba(96,68,28,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${coarse ? "min-h-[44px]" : "min-h-[28px]"}`}
            style={{ borderColor: lit ? LEAGUECRAFT_INK.strong : "rgba(96,68,28,0.35)", color: LEAGUECRAFT_INK.brass, background: lit ? "rgba(96,68,28,0.12)" : undefined }}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            {lit ? "Lit on the rail" : "Light the streak"}
          </button>
        )}
      </div>
      <ul className="mt-2.5 grid gap-1.5" aria-label={`Streak links${per > 1 ? `, one link per ${per} answers` : ""}`}>
        {rows.map((row) => {
          if (row.value === null) return null;
          const links = Math.ceil(row.value / per);
          const fillTo = row.mine ? Math.ceil(links * clamp01(progress)) : links;
          return (
            <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 [@container(min-width:24rem)]:grid-cols-[5.25rem_minmax(0,1fr)_2rem]" data-testid={`streak-row-${row.key}`}>
              <span className="col-span-2 truncate text-[10.5px] font-bold [@container(min-width:24rem)]:col-span-1" style={{ color: row.mine ? LEAGUECRAFT_INK.strong : LEAGUECRAFT_INK.faint }}>{row.label}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-[2px]" aria-hidden="true">
                {Array.from({ length: Math.ceil(top / per) }, (_, i) => {
                  const on = i < fillTo;
                  const exists = i < links;
                  return (
                    <span
                      key={i}
                      className="block h-[9px] w-[7px] rounded-[3px] border"
                      style={{
                        borderColor: exists ? (row.mine ? "#a0521a" : "rgba(83,56,8,0.5)") : "rgba(96,68,28,0.12)",
                        background: on ? (row.mine ? "linear-gradient(180deg, #f0a24a, #c2571a)" : "rgba(83,56,8,0.28)") : "transparent",
                      }}
                    />
                  );
                })}
              </span>
              <span className="text-right text-[12px] font-extrabold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>{row.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── compare board

export interface BoardFigure {
  label: string;
  value: React.ReactNode;
  /** Accessible text when `value` is a picture. */
  aria?: string;
  /** Identity, so a change can sit under its own figure (narrow layout). */
  key?: string;
}

export interface BoardChange {
  text: string;
  direction: "up" | "down" | "same";
  testId?: string;
  /** The figure (`BoardFigure.key`) this change describes. */
  metric?: string;
}

/** Below this width (in rem, so it tracks the text size) the board is two
 *  compact columns with each change under its figure. */
const NARROW_REM = 28;

/**
 * Current vs previous, side by side, and the exact changes between them.
 * Only factual differences of displayed figures: counts, and accuracy in
 * points between the two shown percentages ("89% vs 79%", "10 points
 * higher").
 *
 * HUB6.3G: on a narrow board (a phone) the three stacked cards became one
 * compact grid — Today | Previous in two columns, one row per figure, and
 * that figure's change directly beneath it — instead of three full-width
 * cards. Wide boards keep the Today / Previous / Change cards.
 */
export function CompareBoard({
  currentTitle,
  previousTitle,
  current,
  previous,
  changes,
  note,
  testId,
}: {
  currentTitle: string;
  previousTitle: React.ReactNode;
  current: BoardFigure[];
  previous: BoardFigure[] | null;
  changes: BoardChange[];
  note?: React.ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const narrow = useNarrow(ref, NARROW_REM);
  const column = (title: React.ReactNode, figures: BoardFigure[], mine: boolean, id: string) => (
    <div
      className="min-w-0 rounded-md border px-2.5 py-2"
      style={{
        borderColor: mine ? "rgba(8,64,79,0.35)" : "rgba(96,68,28,0.22)",
        background: mine ? "rgba(8,64,79,0.05)" : "rgba(255,249,233,0.28)",
      }}
      data-testid={id}
    >
      <div className="mb-1.5 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: mine ? CHART.current : LEAGUECRAFT_INK.faint }}>
        {title}
      </div>
      <dl className="grid gap-1.5">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: LEAGUECRAFT_INK.faint }}>{f.label}</dt>
            <dd className="text-[15px] font-extrabold leading-tight tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }} aria-label={f.aria}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );

  let body: React.ReactNode;
  if (narrow) {
    const keyOf = (f: BoardFigure) => f.key ?? f.label;
    const rows = current.map((f) => ({
      f,
      prev: previous?.find((x) => keyOf(x) === keyOf(f)) ?? null,
      changes: changes.filter((c) => c.metric === keyOf(f)),
    }));
    const shown = new Set(current.map(keyOf));
    const rest = changes.filter((c) => c.metric === undefined || !shown.has(c.metric));
    body = (
      <>
        <div className="overflow-hidden rounded-md border" style={{ borderColor: "rgba(96,68,28,0.22)" }} data-testid="compare-narrow">
          <div className="grid grid-cols-2 border-b text-[9.5px] font-black uppercase tracking-[0.14em]" style={{ borderColor: "rgba(96,68,28,0.16)" }}>
            <div className="px-2.5 py-1.5" style={{ color: CHART.current, background: "rgba(8,64,79,0.06)" }} data-testid="compare-narrow-current">{currentTitle}</div>
            <div className="min-w-0 px-2.5 py-1.5" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="compare-narrow-previous">{previous ? previousTitle : "Previous"}</div>
          </div>
          <dl>
            {rows.map(({ f, prev, changes: cs }) => (
              <div key={f.label} className={`border-b last:border-b-0 ${cs.length === 0 ? "pb-1.5" : ""}`} style={{ borderColor: "rgba(96,68,28,0.12)" }} data-testid="compare-row" data-metric={keyOf(f)}>
                <dt className="px-2.5 pt-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: LEAGUECRAFT_INK.faint }}>{f.label}</dt>
                <dd className="grid grid-cols-2 items-baseline">
                  <span className="min-w-0 px-2.5 text-[15px] font-extrabold leading-tight tabular-nums" style={{ color: LEAGUECRAFT_INK.strong, background: "rgba(8,64,79,0.04)" }} aria-label={f.aria ? `${currentTitle}: ${f.aria}` : undefined}>
                    {f.value}
                  </span>
                  <span className="min-w-0 px-2.5 text-[13px] font-bold leading-tight tabular-nums" style={{ color: LEAGUECRAFT_INK.body }} aria-label={prev?.aria ? `Previous: ${prev.aria}` : undefined}>
                    {prev ? prev.value : "—"}
                  </span>
                </dd>
                {cs.length > 0 && (
                  <dd className="flex flex-wrap gap-1 px-2.5 pb-1.5 pt-1">
                    {cs.map((c) => <DeltaChip key={c.text} text={c.text} direction={c.direction} testId={c.testId} />)}
                  </dd>
                )}
              </div>
            ))}
          </dl>
          {rest.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t px-2.5 py-1.5" style={{ borderColor: "rgba(96,68,28,0.12)" }}>
              {rest.map((c) => <DeltaChip key={c.text} text={c.text} direction={c.direction} testId={c.testId} />)}
            </div>
          )}
        </div>
        {!previous && (
          <p className="mt-1.5 text-[11px]" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="compare-previous-none">
            No earlier matching attempt yet — this is the first.
          </p>
        )}
      </>
    );
  } else {
    body = (
      <div className="grid gap-2 [@container(min-width:28rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
        {column(currentTitle, current, true, "compare-current")}
        {previous ? column(previousTitle, previous, false, "compare-previous") : (
          <div className="rounded-md border border-dashed px-2.5 py-2 text-[11px]" style={{ borderColor: "rgba(96,68,28,0.3)", color: LEAGUECRAFT_INK.faint }} data-testid="compare-previous-none">
            No earlier matching attempt yet — this is the first.
          </div>
        )}
        {previous && (
          <div className="min-w-0 rounded-md border px-2.5 py-2" style={{ borderColor: "rgba(96,68,28,0.22)" }} data-testid="compare-change">
            <div className="mb-1.5 text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: LEAGUECRAFT_INK.faint }}>Change</div>
            <ul className="flex flex-wrap gap-1.5">
              {changes.map((c) => (
                <li key={c.text} className="min-w-0 max-w-full">
                  <DeltaChip text={c.text} direction={c.direction} testId={c.testId} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // One measured wrapper for both layouts, so the width is always observed.
  return (
    <div ref={ref} className="min-w-0" data-testid={testId} data-layout={narrow ? "narrow" : "wide"}>
      {body}
      {note && <p className="mt-1.5 text-[10.5px] italic" style={{ color: LEAGUECRAFT_INK.faint }} data-testid="compare-note">{note}</p>}
    </div>
  );
}

export const dir = (n: number): "up" | "down" | "same" => (n > 0 ? "up" : n < 0 ? "down" : "same");
