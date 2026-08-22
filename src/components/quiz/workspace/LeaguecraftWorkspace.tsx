/**
 * MALT Phase A — the Leaguecraft HISTORY / REVIEW workspace.
 *
 * The lower half of `/quiz`, underneath the approved ceremonial first screen
 * and its category rail. Two questions, one surface:
 *
 *   HISTORY  what have I studied?      — the account's quiz-session record
 *   REVIEW   what did I get wrong?     — the missed-question bank
 *
 * SUBORDINATE BY CONSTRUCTION
 * ───────────────────────────
 * The canonical visual reference is explicit that the three-scroll rack is
 * this page's LAYOUT, not the Leaguecraft system, and that a dense workspace
 * on parchment inherits a manuscript margin costing ~30% of its width and an
 * ink ceiling of 0.0747 luminance. So this is not a fourth scroll, not a
 * second hero and not a three-column rack: it is one `LobbyPanel` plate — the
 * lobby's existing lower-area shell — carrying ruled headings and ruled rows
 * in the brass the workspace already prints in. Ledger, not dashboard.
 *
 * THE SHELL IS THE POINT, NOT THE TWO TABS IN IT
 * ──────────────────────────────────────────────
 * Phase A ships one pane per mode, but the mode list is DATA. History is
 * scheduled to gain Practice / Daily / Ranked streams once the DSA
 * reconciliation and a Ranked history read model exist; Review is scheduled
 * to gain Session Review and Ranked Review once there is a persistent
 * session-review endpoint behind them. Both arrive as entries in a mode's
 * `panes` list — the shell, the tab strip, the deep-link scheme and the
 * scroll target do not change. Nothing empty is displayed in the meantime: a
 * tab the product cannot fill yet is not rendered at all.
 *
 * WHAT IT IS NOT: a player-facing "Review" is the player's OWN mistakes. The
 * moderator's question-review console is a different product at a different
 * route, and this must never borrow its name.
 *
 * Presentation only. History reads the payload the page already holds; Review
 * mounts its own gated loader, and only once it is actually opened.
 */
import { BookX, History as HistoryIcon } from "lucide-react";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import { LEDGER_INK } from "@/components/quiz/leaguecraft-ink";

/** Which top-level question the workspace is answering. Also the URL hash. */
export type WorkspaceMode = "history" | "review";

export const WORKSPACE_MODES: readonly WorkspaceMode[] = ["history", "review"] as const;

/** `/quiz#history` and `/quiz#review`. One scheme, so a link from anywhere in
 *  the product can open the workspace on the pane it means. */
export function parseWorkspaceHash(hash: string | null | undefined): WorkspaceMode | null {
  const raw = (hash ?? "").replace(/^#/, "").toLowerCase();
  return (WORKSPACE_MODES as readonly string[]).includes(raw) ? (raw as WorkspaceMode) : null;
}

export function workspaceHash(mode: WorkspaceMode): string {
  return `#${mode}`;
}

const MODE_META: Record<
  WorkspaceMode,
  { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }
> = {
  history: {
    label: "History",
    icon: HistoryIcon,
    hint: "Every study session on record.",
  },
  review: {
    label: "Review",
    icon: BookX,
    hint: "The questions you got wrong, with the answers.",
  },
};

export default function LeaguecraftWorkspace({
  mode,
  onModeChange,
  history,
  review,
  className = "",
}: {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  /** The History pane's body. Supplied by the host so this file fetches
   *  nothing and the lobby can hand down the payload it already holds. */
  history: React.ReactNode;
  /** The Review pane's body. Mounted only while Review is the open mode, so
   *  its Pro-gated endpoint is never read by a reader who did not ask. */
  review: React.ReactNode;
  className?: string;
}) {
  const meta = MODE_META[mode];

  return (
    <div className={className} data-testid="leaguecraft-workspace" data-mode={mode}>
      <LobbyPanel className="gap-2">
        {/* The tab strip. Real tabs — `tablist`/`tab`/`tabpanel` with roving
            selection — because these are two views of one surface, not two
            destinations; a reader on a screen reader should be told the panel
            changed, not that the page did. */}
        <div
          role="tablist"
          aria-label="Leaguecraft record"
          data-testid="workspace-tablist"
          className="flex items-end gap-1 border-b pb-px"
          style={{ borderColor: LEDGER_INK.rule }}
        >
          {WORKSPACE_MODES.map((id) => {
            const active = id === mode;
            const Icon = MODE_META[id].icon;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`workspace-tab-${id}`}
                aria-selected={active}
                aria-controls={`workspace-panel-${id}`}
                tabIndex={active ? 0 : -1}
                data-testid={`workspace-tab-${id}`}
                onClick={() => onModeChange(id)}
                onKeyDown={(e) => {
                  // Arrow keys move between tabs, as a tablist owes its reader.
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const i = WORKSPACE_MODES.indexOf(id);
                  const next =
                    e.key === "ArrowRight"
                      ? (i + 1) % WORKSPACE_MODES.length
                      : (i - 1 + WORKSPACE_MODES.length) % WORKSPACE_MODES.length;
                  onModeChange(WORKSPACE_MODES[next]);
                }}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-[#e2c877]/70 text-[#e2c877]"
                    : "border-transparent text-muted-foreground hover:text-[#e2c877]/75"
                }`}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {MODE_META[id].label}
              </button>
            );
          })}
          {/* The open pane's own line, on the strip's far end where it reads as
              a caption for what is below rather than as a second heading. */}
          <span className="ml-auto hidden pb-1.5 pl-3 text-[10px] text-muted-foreground/80 sm:inline">
            {meta.hint}
          </span>
        </div>

        <div
          role="tabpanel"
          id={`workspace-panel-${mode}`}
          aria-labelledby={`workspace-tab-${mode}`}
          data-testid={`workspace-panel-${mode}`}
          className="min-h-[9rem] pt-1"
        >
          {mode === "history" ? history : review}
        </div>
      </LobbyPanel>
    </div>
  );
}
