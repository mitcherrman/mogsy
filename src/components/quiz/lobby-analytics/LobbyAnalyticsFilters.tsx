/**
 * RL2 — the three compact controls above the Academy slides.
 *
 * TIME is real. Its options come from `capability.allowed_windows`, which the
 * server computes from the account's entitlement — Free is offered a single
 * 7-day window and Premium 7/30/90. A single option is still RENDERED: a
 * control that hides itself at one option is a control that needs a new branch
 * the day a tier gains a second, and the reader can see what window they are
 * looking at either way.
 *
 * MODE is real, and it chooses a DIMENSION rather than narrowing one. The
 * payload has per-category figures and per-mode figures, and no cross-tab
 * between them; see `analyticsSlices`.
 *
 * ROLE IS NOT WIRED, AND SAYS SO. No attempt carries the role the reader held
 * when they answered, and there is no approved role dimension on the analytics
 * contract. The control is therefore rendered DISABLED in production rather
 * than omitted — the composition it belongs to is under review — and is live
 * only where a demo source supplies the dimension. It never filters real
 * figures, in either state.
 */
import { LEAGUECRAFT_INK as INK } from "@/components/quiz/leaguecraft-ink";
import { RANKED_ROLES, RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import { windowOptionLabel, type ModeFilter } from "./analyticsSlices";

/** Drawn text only. The full label rides on `aria-label`/`title`. */
const ROLE_PILL_TEXT: Record<RankedRole, string> = {
  top: "Top", jungle: "Jng", mid: "Mid", adc: "ADC", support: "Sup",
};

function Pill({
  active, disabled, onClick, children, testId, label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  /** The full word, when the pill is drawn abbreviated. */
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
      /* px-1, not px-1.5, and no extra tracking: at 222px the Role group's six
         pills measured 222 exactly and wrapped onto a second line, and the
         chart pays for every wrapped line out of a fixed 280px box. */
      className="rounded-full px-1 py-[1px] text-[9px] font-bold uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        color: active ? INK.strong : INK.faint,
        background: active ? INK.inset : "transparent",
        border: `1px solid ${active ? INK.rule : "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span
        className="shrink-0 text-[8px] font-bold uppercase tracking-[0.14em]"
        style={{ color: INK.brass }}
      >
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-0.5">{children}</div>
    </div>
  );
}

export default function LobbyAnalyticsFilters({
  windows, windowDays, onWindow,
  modes, mode, onMode,
  role, onRole, roleEnabled,
}: {
  windows: readonly number[];
  windowDays: number | null;
  onWindow: (days: number) => void;
  modes: readonly { value: ModeFilter; label: string }[];
  mode: ModeFilter;
  onMode: (mode: ModeFilter) => void;
  /** null = no role narrowing applied. */
  role: RankedRole | null;
  onRole: (role: RankedRole | null) => void;
  /** False in production: there is no role dimension to narrow by. */
  roleEnabled: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
      data-testid="lobby-analytics-filters"
    >
      <Group label="Time">
        {windows.map((days) => (
          <Pill
            key={days}
            active={days === windowDays}
            onClick={() => onWindow(days)}
            testId={`lobby-analytics-window-${days}`}
          >
            {windowOptionLabel(days)}
          </Pill>
        ))}
      </Group>

      <Group label="Mode">
        {modes.map((option) => (
          <Pill
            key={option.value}
            active={option.value === mode}
            onClick={() => onMode(option.value)}
            testId={`lobby-analytics-mode-${option.value}`}
          >
            {option.label === "All modes" ? "All" : option.label}
          </Pill>
        ))}
      </Group>

      <Group label="Role">
        <Pill
          active={role === null}
          disabled={!roleEnabled}
          onClick={() => onRole(null)}
          testId="lobby-analytics-role-all"
        >
          Any
        </Pill>
        {/* ABBREVIATED, not renamed. Six full role words wrap this group onto
            a second line and the chart pays for it out of a 280px box; the
            full word is on `aria-label` and `title`, so nothing is lost to a
            screen reader or to a pointer. ADC and Mid are already their own
            full labels. */}
        {RANKED_ROLES.map((r) => (
          <Pill
            key={r}
            active={role === r}
            disabled={!roleEnabled}
            onClick={() => onRole(r)}
            testId={`lobby-analytics-role-${r}`}
            label={RANKED_ROLE_LABELS[r]}
          >
            {ROLE_PILL_TEXT[r]}
          </Pill>
        ))}
      </Group>
    </div>
  );
}
