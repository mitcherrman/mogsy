/**
 * Public Ranked route (/quiz/ranked, F1.5). Entry -> role -> queue -> matched
 * -> live match. Requires a verified non-anonymous account; fails closed on
 * backend disabled/ineligible/pool-unavailable via typed error codes (never
 * hidden-route security). No staff token or admin control is ever exposed.
 *
 * R1: the normal player picks a LEAGUE ROLE (Top/Jungle/Mid/ADC/Support), not
 * a combat class. The legacy class cards below are NOT deleted — they are the
 * fallback for a backend with no role identity (an older deployment answers
 * 404 on `/api/ranked/role`), which is the only path that still lets those
 * players queue. Nothing here maps a role to a class in either direction.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MogzyClass } from "@/components/mascot/MogzyMascot";
import { isMogzyClassCharacter } from "@/components/mascot/mascot-assets";
import {
  BotDifficulty, createBotMatch, getActiveMatch, isAborted, RankedApiError,
} from "@/lib/ranked-public/client";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import { QuizRankedMatch } from "./QuizRankedMatch";
import { RankedMatchHistory } from "./RankedMatchHistory";
import { RankedRolePicker } from "./RankedRolePicker";
import { RankedTierPanel } from "./RankedTierPanel";
import { RankedClass, useRankedQueue } from "./useRankedQueue";
import { useRankedProgression } from "./useRankedProgression";
import { useRankedRole } from "./useRankedRole";

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "standard", label: "Standard" },
  { id: "hard", label: "Hard" },
];

const CLASSES: { id: RankedClass; label: string; blurb: string }[] = [
  { id: "tank", label: "Tank", blurb: "Durable — forgiving abilities and extra HP." },
  { id: "mage", label: "Mage", blurb: "Offensive burst — amplify your damage." },
  { id: "marksman", label: "Marksman", blurb: "Tempo — pressure the opponent's clock." },
];

/**
 * Ordinary document-flow frame. There is no pinned-height / internal-scroll
 * variant any more: Ranked scrolls with the page like every other route, so the
 * browser scrollbar is the only one on screen.
 *
 * Phase 2 compact layout: the heading is ONE row (title · eyebrow · nav) —
 * the stacked eyebrow/title block spent ~65px of every desktop viewport
 * before the arena began. Hierarchy is preserved (h1 title, quiet eyebrow,
 * essential Back link), only the vertical cost changed.
 *
 * `ranked-academy` (RA4 Slice A) is the ONE place the Mogzy academy theme is
 * switched on. It is a presentation class only — every rule it carries lives in
 * index.css, it is applied nowhere else in the app, and no shared component
 * (question surface, quiz answer grid, arena primitives) knows it exists. The
 * background it paints is a fixed layer inside <main>, so it adds no height and
 * cannot reach the navbar or any floating control.
 */
function Frame({ children, size = "default" }:
{ children: React.ReactNode; size?: "default" | "wide" }) {
  return (
    <div className={`ranked-shell ranked-academy mx-auto w-full space-y-3 px-4 py-3 ${
      // RA10 widened the live-match frame a step at xl; RA11 lets it take the
      // full stage at large desktops (the route is full-bleed now, so main's
      // reading column no longer caps it). The centre question track — not the
      // fixed duelist rails — absorbs every extra pixel.
      size === "wide" ? "max-w-6xl xl:max-w-[76rem] min-[1500px]:max-w-[90rem]" : "max-w-3xl"}`}
      data-testid="quiz-ranked">
      {/* md:pl clears the shell's fixed "League Hub" pill (left-4, ~7rem wide),
          which sits on this row now that the heading is one line. The default
          frame's own left margin clears it from 1440px; the wide frame runs
          nearly stage-wide from 1500px, so it keeps the padding until its
          margin genuinely exceeds the pill (~1700px). */}
      <header className={`flex min-h-7 items-center justify-between gap-3 ${
        size === "wide"
          ? "md:pl-28 min-[1440px]:pl-0 min-[1500px]:pl-28 min-[1700px]:pl-0"
          : "md:pl-28 min-[1440px]:pl-0"}`}>
        <div className="flex items-baseline gap-2.5">
          <h1 className="ranked-title text-lg font-bold leading-tight">Ranked Duel</h1>
          <span className="ranked-eyebrow hidden sm:inline">Competitive Mode</span>
        </div>
        <Link to="/quiz" className="text-sm text-muted-foreground underline">Back to Quiz</Link>
      </header>
      {children}
    </div>
  );
}

export default function QuizRankedPage() {
  const { user } = useAuth();
  const account = user && !(user as { is_anonymous?: boolean }).is_anonymous ? user : null;

  if (!account) {
    return (
      <Frame>
        <section data-testid="ranked-account-required" className="ranked-panel p-5">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Account required</div>
          <h2 className="mt-1 font-semibold">Sign in to play Ranked</h2>
          <p className="text-sm text-muted-foreground">Ranked Duel requires a signed-in account.</p>
          <Button asChild className="mt-3"><Link to="/auth">Sign in</Link></Button>
        </section>
      </Frame>
    );
  }
  return <RankedQueueGate viewerUserId={account.id} />;
}

function RankedQueueGate({ viewerUserId }: { viewerUserId: string }) {
  const q = useRankedQueue();
  const roleCtl = useRankedRole();
  // RE1 3B: read-only Ranked standing. Its absence never blocks the queue.
  const progressionCtl = useRankedProgression();
  const [botMatchId, setBotMatchId] = useState<string | null>(null);
  const [recoveredMatchId, setRecoveredMatchId] = useState<string | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("standard");
  const [botClass, setBotClass] = useState<RankedClass>("tank");
  const [botBusy, setBotBusy] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  // The class whose queue-join is in flight. Doubles as the double-activation
  // guard: while it is set every card is disabled, so a second click (mouse or
  // keyboard) cannot start a second join.
  const [joiningClass, setJoiningClass] = useState<RankedClass | null>(null);
  // The role whose WRITE is in flight, for the picker's per-option busy state.
  const [savingRole, setSavingRole] = useState<RankedRole | null>(null);
  // Opened explicitly from the idle lobby. A role is durable identity, so the
  // picker is not re-presented every match once one is chosen.
  const [changingRole, setChangingRole] = useState(false);

  function joinAs(classId: RankedClass) {
    if (joiningClass !== null) return;
    setJoiningClass(classId);
    q.joinAs(classId);
  }

  // R1: role identity is available only when the backend exposes it. Anything
  // else (an older deployment, a read failure) falls back to the legacy class
  // cards, which is the only path that still lets those players queue.
  const roleIdentityAvailable = roleCtl.loadState === "ready";

  async function chooseRole(role: RankedRole) {
    if (roleCtl.saving) return;
    setSavingRole(role);
    const accepted = await roleCtl.selectRole(role);
    setSavingRole(null);
    // Only the SERVER's acceptance closes the picker; a rejected change (an
    // active match, a live queue entry) leaves it open with the reason shown.
    if (accepted) setChangingRole(false);
  }

  // Release the guard whenever the queue leaves the joining state — on success
  // the page has already moved on; on failure the cards become clickable again
  // and `q.error` explains why.
  useEffect(() => {
    if (q.state !== "joining") setJoiningClass(null);
  }, [q.state]);

  // Reconnect after a full page reload: an active bot match is NOT in the queue,
  // so queue recovery alone loses it. Account-bound discovery rediscovers the
  // caller's own active match (bot or human) and re-enters the same live view.
  // Best-effort: a disabled/ineligible backend just leaves the user at the menu.
  useEffect(() => {
    const controller = new AbortController();
    getActiveMatch(controller.signal)
      .then((found) => { if (found) setRecoveredMatchId(found.matchId); })
      .catch(() => { /* not recoverable — fall through to the normal menu */ })
      .finally(() => setRecoveryChecked(true));
    return () => controller.abort();
  }, []);

  // The class shown while queued: server-confirmed class first, local pick as
  // fallback (mirrors the "Queued as" copy below). LEGACY path only.
  const queuedClass = q.status?.classId ?? q.selectedClass;
  // R1: the identity the player queued WITH. Server-confirmed entry role
  // first, the account's stored role as the fallback for the frame before the
  // first status poll lands. Null on the legacy path, where the copy below
  // keeps naming the class exactly as it always has.
  const queuedRole = q.status?.role ?? (roleIdentityAvailable ? roleCtl.role : null);

  // A freshly created bot match wins; otherwise re-enter a rediscovered active
  // match (bot or human), then a live queue match.
  const liveMatchId = botMatchId ?? recoveredMatchId
    ?? (q.state === "matched" ? q.matchId : null);

  async function startBotMatch() {
    setBotBusy(true);
    setBotError(null);
    try {
      const created = await createBotMatch(botClass, botDifficulty);
      setBotMatchId(created.matchId);
    } catch (e) {
      if (isAborted(e)) return;
      const msg = e instanceof RankedApiError
        ? (e.code === "RANKED_BOT_DISABLED"
            ? "Ranked Bot is not currently enabled."
            : e.message)
        : "Could not start a bot match.";
      setBotError(msg);
    } finally {
      setBotBusy(false);
    }
  }

  // A launched / recovered / queued match reuses the exact live-match view.
  if (liveMatchId) {
    return (
      <Frame size="wide">
        <QuizRankedMatch matchId={liveMatchId} viewerUserId={viewerUserId} />
      </Frame>
    );
  }

  // Don't flash the menu before the account-bound active-match check resolves,
  // or before the role read settles — otherwise the legacy class cards appear
  // for a frame and are then replaced by the role picker.
  if (!recoveryChecked || roleCtl.loadState === "loading") {
    return (
      <Frame>
        <p data-testid="ranked-loading" className="text-sm text-muted-foreground">Loading Ranked…</p>
      </Frame>
    );
  }

  return (
    <Frame>
      {q.state === "recovering" && (
        <p data-testid="ranked-loading" className="text-sm text-muted-foreground">Loading Ranked…</p>
      )}

      {q.state === "unavailable" && (
        <section data-testid="ranked-unavailable" className="ranked-panel p-5">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Ranked</div>
          <h2 className="mt-1 font-semibold">Ranked is unavailable</h2>
          <p className="text-sm text-muted-foreground">{q.unavailableReason ?? "Not available right now."}</p>
        </section>
      )}

      {q.state === "fatal" && (
        <section data-testid="ranked-fatal-queue" className="rounded-lg border border-destructive bg-card p-4">
          <p className="text-sm text-destructive">{q.error}</p>
        </section>
      )}

      {/* RE1 3B — Mogzy competitive standing, shown on the idle/queue
          surface only. Renders nothing at all when the backend has no
          progression to give (older deployment, guest, read failure). */}
      {(q.state === "selecting_class" || q.state === "joining")
        && progressionCtl.progression !== null && (
        <RankedTierPanel progression={progressionCtl.progression} />
      )}

      {(q.state === "selecting_class" || q.state === "joining") && (
        <section
          data-testid={roleIdentityAvailable ? "ranked-role-select" : "ranked-class-select"}
          className="ranked-panel p-4 space-y-4">
          {/* R1 role path. The player's League role is durable account
              identity: once chosen it is reused for every match and is only
              re-presented when the player asks to change it. */}
          {roleIdentityAvailable && (
            <div className="space-y-4">
              {roleCtl.role === null || changingRole ? (
                <RankedRolePicker
                  value={roleCtl.role}
                  onSelect={(r) => { void chooseRole(r); }}
                  busy={roleCtl.saving}
                  busyRole={savingRole}
                  legend={roleCtl.role === null ? "Choose your role" : "Change your role"}
                  hint="Your League role is your Ranked identity. You can change it between matches."
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="ranked-eyebrow">Your role</div>
                    {/* Text, always — never an icon or colour alone. */}
                    <p data-testid="ranked-current-role" className="text-lg font-semibold">
                      {RANKED_ROLE_LABELS[roleCtl.role]}
                    </p>
                  </div>
                  <Button variant="outline" data-testid="ranked-change-role"
                    onClick={() => setChangingRole(true)} className="min-h-[44px]">
                    Change role
                  </Button>
                </div>
              )}
              {roleCtl.error && (
                <p data-testid="ranked-role-error" className="text-xs text-destructive">
                  {roleCtl.error}
                </p>
              )}
              <Button data-testid="ranked-find-match" className="w-full min-h-[44px]"
                // Fails CLOSED: no role, no queue. The backend enforces the
                // same rule (RANKED_ROLE_REQUIRED); this only avoids sending a
                // request that is already known to be rejected.
                disabled={roleCtl.role === null || q.state === "joining" || roleCtl.saving}
                // Called with NO arguments — there is nothing about the
                // player's identity for the client to send. The backend reads
                // the role off the account itself.
                onClick={() => q.joinWithoutClass()}>
                {q.state === "joining" ? "Joining queue…" : "Find a match"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {roleCtl.role === null
                  ? "Choose a role to join the Ranked queue against another player."
                  : "You'll be matched with another player."}
              </p>
              {q.error && <p className="text-xs text-destructive">{q.error}</p>}
            </div>
          )}

          {/* LEGACY class path — retained, never deleted. Rendered only when
              the backend has no role identity (an older deployment), because
              those players have no other way into the queue. */}
          {!roleIdentityAvailable && (
          <>
          <div className="space-y-1">
            <div className="ranked-eyebrow">Choose your class</div>
            <p className="text-xs text-muted-foreground">
              Your class sets your abilities and combat identity for the duel.
            </p>
          </div>
          {/* R3: one click. Picking a class IS joining the queue as that class
              — there is no separate confirmation. `joiningClass` marks the card
              whose request is in flight and blocks a double activation; the
              server's acceptance is what moves the page on. */}
          <div className="grid gap-2 sm:grid-cols-3">
            {CLASSES.map((c) => {
              const pending = joiningClass === c.id;
              return (
                <button key={c.id} type="button"
                  data-testid={`ranked-class-${c.id}`}
                  aria-pressed={q.selectedClass === c.id}
                  aria-busy={pending}
                  disabled={joiningClass !== null}
                  onClick={() => joinAs(c.id)}
                  className={`min-h-[44px] rounded-lg border-2 p-3 text-center transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 ${
                    q.selectedClass === c.id
                      ? "border-[#c9a84c] bg-[#c9a84c]/10 shadow-[0_0_18px_-6px_rgba(201,168,76,0.6)]"
                      : "border-white/10 bg-white/[0.03] enabled:hover:border-[#c9a84c]/40"}`}>
                  {/* Card label carries the class name; the art is combat identity. */}
                  <MogzyClass character={c.id} decorative
                    className="mx-auto mb-1.5 h-16 w-16 sm:h-20 sm:w-20" />
                  <div className="font-semibold">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {pending ? "Joining queue…" : c.blurb}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Choose a class to join the Ranked queue against another player.
          </p>
          {q.error && <p className="text-xs text-destructive">{q.error}</p>}
          </>
          )}

          {/* Distinct, clearly-labeled owner playtest path (bot). Owner/staff
              PLAYTEST surface, allowlist-gated by the backend: it keeps its
              legacy class picker because bot creation still requires a class,
              and R1 removes nothing from diagnostic paths. */}
          <div className="relative flex items-center gap-3 pt-1" aria-hidden>
            <span className="h-px flex-1 bg-white/10" />
            <span className="ranked-eyebrow ranked-eyebrow--cyan">or practice</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div data-testid="ranked-playtest-bot" className="ranked-subpanel p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[#e8c97a]">Play vs Bot</span>
              <span className="rounded border border-[#7fd6ef]/30 bg-[#7fd6ef]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#7fd6ef]">
                Playtest
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Practice the full duel against a deterministic bot. Placeholder questions.
            </p>
            {/* The playtest keeps its OWN class picker: the Ranked cards above
                now queue on click, so this path needs its own selection. "Play
                vs Bot" is a distinct destination, not a confirmation of it. */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bot class">
              {CLASSES.map((c) => (
                <button key={c.id} type="button"
                  data-testid={`ranked-bot-class-${c.id}`}
                  aria-pressed={botClass === c.id}
                  onClick={() => setBotClass(c.id)}
                  className={`min-h-[36px] rounded-md border px-3 text-xs transition-colors motion-reduce:transition-none ${
                    botClass === c.id
                      ? "border-[#c9a84c]/60 bg-[#c9a84c]/10 text-[#e8c97a]"
                      : "border-white/10 bg-white/[0.03] hover:border-[#c9a84c]/40"}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Bot difficulty">
              {BOT_DIFFICULTIES.map((d) => (
                <button key={d.id} type="button"
                  data-testid={`ranked-bot-difficulty-${d.id}`}
                  aria-pressed={botDifficulty === d.id}
                  onClick={() => setBotDifficulty(d.id)}
                  className={`min-h-[36px] rounded-md border px-3 text-xs transition-colors motion-reduce:transition-none ${
                    botDifficulty === d.id
                      ? "border-[#7fd6ef]/60 bg-[#7fd6ef]/10 text-[#cdeefb]"
                      : "border-white/10 bg-white/[0.03] hover:border-[#7fd6ef]/40"}`}>
                  {d.label}
                </button>
              ))}
            </div>
            <Button variant="outline" data-testid="ranked-play-vs-bot"
              disabled={botBusy} onClick={startBotMatch} className="w-full min-h-[44px]">
              {botBusy ? "Starting…" : "Play vs Bot"}
            </Button>
            {botError && <p data-testid="ranked-bot-error" className="text-xs text-destructive">{botError}</p>}
          </div>

          {/* Best-effort recent results; renders nothing when empty/unavailable. */}
          <RankedMatchHistory />
        </section>
      )}

      {(q.state === "waiting" || q.state === "cancelling") && (
        <section data-testid="ranked-waiting" className="ranked-panel p-5 space-y-3">
          <div role="status" className="space-y-1">
            {/* Legacy class art only on the legacy path — a role has no
                mascot yet, and inventing one from the class would be exactly
                the class→role mapping R1 forbids. */}
            {queuedRole === null && queuedClass && isMogzyClassCharacter(queuedClass) && (
              <MogzyClass character={queuedClass} decorative className="h-16 w-16" />
            )}
            <div className="ranked-eyebrow ranked-eyebrow--cyan animate-pulse motion-reduce:animate-none">
              Matchmaking
            </div>
            <h2 className="font-semibold">Searching for an opponent…</h2>
            <p className="text-sm text-muted-foreground" data-testid="ranked-queued-as">
              Queued as {queuedRole !== null
                ? RANKED_ROLE_LABELS[queuedRole]
                : (q.status?.classId ?? q.selectedClass)}. You'll be matched with another player.
            </p>
          </div>
          <Button variant="outline" data-testid="ranked-cancel" disabled={q.state === "cancelling"}
            onClick={q.cancel} className="min-h-[44px]">
            {q.state === "cancelling" ? "Cancelling…" : "Cancel"}
          </Button>
        </section>
      )}
    </Frame>
  );
}
