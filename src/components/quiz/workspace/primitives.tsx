/**
 * MALT — the study workspace's shared vocabulary.
 *
 * The lower half of `/quiz` is a LEDGER, not a dashboard: ruled headings and
 * ruled rows on the classroom's own dark surface, printed in the brass the
 * hub's section headings already use. These are the pieces every pane in the
 * workspace prints with, so the History ledger and the Review bank cannot
 * drift into two different kinds of list.
 *
 * `SectionHeading` moved here out of `LeaguecraftHub.tsx`, where it was
 * private. It is unchanged — the hub still renders exactly the heading it
 * rendered before — but the workspace needs the same treatment, and a second
 * hand-written copy is the thing this directory exists to avoid.
 *
 * TWO SURFACES, TWO INKS. `SectionHeading` sits OUTSIDE the record, on the
 * classroom's dark plate, and keeps the brass it has always printed in.
 * Everything else here is printed ON the vellum sheet and uses
 * `LEAGUECRAFT_INK` — the same parchment palette the lobby scrolls use, which
 * this surface is entitled to because its crop guarantees a sheet no darker
 * under text than the one those values were derived against (see `.lc-vellum`
 * in `index.css`).
 */
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";

/**
 * A labelled part of the page begins here.
 *
 * The dark-surface twin of the parchment's ruled heading: brass caps at the
 * lobby's tracking, with the hint alongside rather than beneath so the pair
 * costs one line instead of two.
 */
export function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#e2c877]/85">
        <Icon className="h-3 w-3 text-[#c9a84c]/70" aria-hidden="true" />
        {title}
      </h2>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * The ledger's own title rule — a small caps label closed by a hairline that
 * fades out, so it reads as drawn across the sheet rather than as a border on
 * a box. The parchment columns use the same device; this is it in brass.
 */
export function LedgerTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.2em]"
        style={{ color: LEAGUECRAFT_INK.brass, textShadow: LEAGUECRAFT_INK.press }}
      >
        {children}
      </span>
      <span
        aria-hidden="true"
        className="h-px min-w-0 flex-1"
        style={{
          background: `linear-gradient(90deg, ${LEAGUECRAFT_INK.rule} 0%, rgba(96,68,28,0.04) 100%)`,
        }}
      />
    </div>
  );
}

/**
 * One ruled row. The hairline is what separates rows — no card, no radius, no
 * fill — which is what keeps a long record scannable instead of turning into
 * a stack of tiles.
 */
export function LedgerRow({
  children,
  className = "",
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      className={`border-b py-1.5 last:border-b-0 ${className}`}
      style={{ borderColor: "rgba(96,68,28,0.24)" }}
    >
      {children}
    </li>
  );
}

/**
 * The quiet line a pane uses to state a limit, a scope or a caveat.
 *
 * It exists so an honesty note never has to be styled as a warning: what the
 * account can and cannot see is part of the record, not an error about it.
 */
export function WorkspaceNote({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className="text-[11px] leading-relaxed"
      style={{ color: LEAGUECRAFT_INK.faint }}
    >
      {children}
    </p>
  );
}
