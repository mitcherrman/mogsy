/**
 * UX-3 — Worlds Dynasty BO5 driven by server state (`/dev/dynasty-v2?view=bo5`).
 *
 * The screen is chosen from the series envelope's `status`, never from local
 * game logic: prep → drafting → in_game → between_games → … → complete.
 * Local state holds only presentation: which org branding was picked, whether
 * the roster/result screens were already seen, and the lock-in overlay.
 *
 * Authority today (see the UX-3 handoff): game frames are recorded E1 machine
 * output served by the in-browser contract double; series persistence (RUN-2),
 * objective hosting (E2B) and between-game state (E3) are PENDING.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { BETWEEN_GAME_DECISIONS, type BetweenGameDecisionId, type FixtureLineup, type SeriesEnvelope, type SeriesGameView } from "@/lib/dynasty/e1/contracts";
import { FixtureSeriesServer, browserStore } from "@/lib/dynasty/e1/fixtureServer";
import type { DynastySeriesTransport } from "@/lib/dynasty/e1/transport";
import { useDynastySeries, type DynastySeries } from "@/lib/dynasty/e1/useDynastySeries";
import { installDynastyAudioUnlock, playCue, playMoment } from "../audio";
import { AmbienceButton } from "../ambience";
import { SimTag, ambientNewGame, useStinger } from "../broadcast";
import { CLASS_COLOR, ClassGlyph } from "../cards";
import type { EnvState } from "../environments";
import { ORGS, type Org } from "../fixtures";
import { Btn, Crest, Eyebrow, LABEL_TONE, ORG_ACCENT, PLATE, Plate, Pips, Rule, Screen, SourceChip, accentStyle } from "../parts";
import { Scene } from "../scenes";
import { BoPips, OrgScreen } from "../screens";
import { ServerGame, ServerLineupStrip, type ServerGameMood } from "./ServerGame";
import { ServerEffectChip } from "./ServerObjective";
import { HOW_TEXT, ROLE_ORDER, STAGE_NAME, champClass, lineupById, matchPoint, shortName } from "./present";

const BRAND_KEY = "mogzy.dynasty.ux3.brand";
const readBrand = (): string | null => { try { return window.localStorage.getItem(BRAND_KEY); } catch { return null; } };
const writeBrand = (id: string | null) => { try { if (id) window.localStorage.setItem(BRAND_KEY, id); else window.localStorage.removeItem(BRAND_KEY); } catch { /* ignore */ } };

export function Bo5Banner({ compact }: { compact?: boolean }) {
  return (
    <div role="note" data-testid="bo5-banner" className={cn("flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-300/[0.06] px-3 text-[11px] leading-snug text-violet-100/85", compact ? "py-1" : "py-1.5")}>
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
      <span className={cn(compact && "truncate")}>
        <strong className="font-semibold text-violet-100">UX-3 · recorded E1 server output · </strong>
        Synthetic catalogs and players; every number provisional.<span className={cn("hidden", compact ? "md:inline" : "sm:inline")}> Served by a contract double: series (RUN-2), question hosting (E2) and between-game state (E3) are pending.</span>
      </span>
    </div>
  );
}

function ErrorPanel({ s }: { s: DynastySeries }) {
  if (!s.error && !s.notice) return null;
  return (
    <div role="alert" data-testid="series-error" data-code={s.error?.code ?? "notice"} className={cn(PLATE, "flex flex-wrap items-center gap-2 border-rose-400/40 px-3 py-2 text-[13px]", !s.error && "border-sky-300/30")}>
      <span className="min-w-0 flex-1 text-white/85">{s.error ? (s.error.code === "NETWORK" ? "Lost contact with the server. Your last action may or may not have landed; Retry resends the same request and cannot apply it twice." : s.error.message) : s.notice}</span>
      {s.error?.retryable ? <Btn primary testId="series-retry" disabled={!!s.busy} className="min-h-[36px] px-3 py-1 text-xs" onClick={() => void (s.error?.action === "resume" ? s.reload() : s.retry())}>Retry</Btn> : null}
      {!s.error && s.notice ? <Btn testId="series-notice-ok" className="min-h-[36px] px-3 py-1 text-xs" onClick={s.clearNotice}>OK</Btn> : null}
    </div>
  );
}

function ChampRow({ l }: { l: FixtureLineup }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {l.champions.map((c, i) => {
        const cls = champClass(c.class);
        return (
          <div key={c.key} className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-white/10 bg-[#0b1727]/80 px-1 py-2 text-center" data-testid="draft-champ">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: `${CLASS_COLOR[cls]}66`, background: `${CLASS_COLOR[cls]}1a` }}><ClassGlyph cls={cls} size={18} /></span>
            <span className="dyn-title w-full truncate text-[10.5px] font-semibold text-white sm:text-[12px]">{shortName(c.name)}</span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-white/45">{l.roles[i]}</span>
            <span className="dyn-num hidden text-[9.5px] text-white/45 sm:block">{c.ratings.join(" / ")}</span>
          </div>
        );
      })}
    </div>
  );
}

function LineupChoice({ lineups, value, onPick, testPrefix }: { lineups: FixtureLineup[]; value: string | null; onPick: (id: string) => void; testPrefix: string }) {
  return (
    <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Legal lineups">
      {lineups.map((l) => {
        const sel = value === l.lineup_id;
        return (
          <button key={l.lineup_id} type="button" role="radio" aria-checked={sel} data-testid={`${testPrefix}-${l.lineup_id}`} onClick={() => onPick(l.lineup_id)}
            className={cn(PLATE, "flex flex-col gap-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", sel ? "dyn-plate--selected border-[#e3c66f]/70" : "hover:border-white/30")}>
            <div className="flex items-center gap-2">
              <span className="dyn-title text-[15px] font-semibold text-white">{l.title.split(" (")[0]}</span>
              <span className="text-[11px] text-white/55">{l.title.match(/\((.*)\)/)?.[1]}</span>
              <span className="dyn-num ml-auto text-[10.5px] text-white/50">players {l.player_ratings.join(" / ")}</span>
            </div>
            <ChampRow l={l} />
          </button>
        );
      })}
    </div>
  );
}

/** VIS-F4 lock-in, fed by the server lineup (presentation only; the lock already landed). */
function ServerLockSequence({ env, org, onDone }: { env: SeriesEnvelope; org: Org; onDone: () => void }) {
  const motion = useMotionAllowed();
  const done = useRef(false);
  const finish = useCallback(() => { if (done.current) return; done.current = true; onDone(); }, [onDone]);
  const l = lineupById(env.series, env.series.current_lineup);
  useEffect(() => {
    const timers: number[] = [];
    if (motion) ROLE_ORDER.forEach((_, i) => timers.push(window.setTimeout(() => playCue("dynasty.draft.lock_role"), 420 + i * 160)));
    timers.push(window.setTimeout(() => playCue("dynasty.draft.lock_all"), motion ? 1150 : 50));
    timers.push(window.setTimeout(finish, motion ? 2100 : 1200));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); };
    window.addEventListener("keydown", onKey);
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.removeEventListener("keydown", onKey); };
  }, [motion, finish]);
  if (!l) return null;
  return (
    <div role="status" aria-live="polite" data-testid="lock-seq" onClick={finish} className={cn("dyn-lock cursor-pointer select-none", motion && "dyn-lock--in dyn-lock--motion")} style={{ "--dyn-light": "44 90% 62%", "--dyn-accent": ORG_ACCENT[org.id]?.hex ?? "#e3c66f" } as CSSProperties}>
      <div className="flex w-full max-w-3xl flex-col items-center gap-4 px-4 text-center">
        <div className="flex items-center gap-3"><Crest org={org} size={40} /><Eyebrow>Game {env.series.current_game} · vs {shortName(env.series.opponent.name)} · BO5</Eyebrow></div>
        <div className="grid w-full grid-cols-5 gap-1.5 sm:gap-3">
          {l.champions.map((c, i) => {
            const cls = champClass(c.class);
            return (
              <div key={c.key} data-testid="lock-tile" style={{ "--i": i } as CSSProperties} className="dyn-lock-tile flex min-w-0 flex-col items-center gap-1.5 overflow-hidden rounded-xl border border-white/15 bg-[#0b1727]/90 px-1 py-3 sm:px-1.5 sm:py-4">
                <span className="w-full truncate text-[9px] font-bold uppercase tracking-[0.2em] text-white/50">{l.roles[i]}</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-full border sm:h-14 sm:w-14" style={{ borderColor: `${CLASS_COLOR[cls]}88`, background: `${CLASS_COLOR[cls]}22` }}><ClassGlyph cls={cls} size={24} /></span>
                <span className="dyn-title w-full truncate text-[11px] font-semibold text-white sm:text-[14px]">{shortName(c.name)}</span>
                <span className="w-full truncate text-[9.5px] text-white/55 sm:text-[11px]">{env.series.team.team_id}-{l.roles[i]}</span>
                <span className="dyn-lock-stamp dyn-title rotate-[-8deg] rounded border-2 border-[#e3c66f]/80 px-1 text-[8px] font-black uppercase tracking-[0.18em] text-[#f6dd8f] sm:text-[9px]">Locked</span>
              </div>
            );
          })}
        </div>
        <span className="dyn-lock-identity dyn-title rounded-full border border-[#e3c66f]/50 bg-[#e3c66f]/10 px-5 py-1.5 text-[18px] font-bold text-[#f6dd8f] sm:text-[24px]" data-testid="lock-identity">{l.title.split(" (")[0]}</span>
        <p className="dyn-lock-sub text-[12px] text-white/70">Locked by the server. Walk out.</p>
      </div>
      <div className="absolute bottom-6 right-6" onClick={(e) => e.stopPropagation()}><Btn testId="lock-skip" className="min-h-[36px] px-4 py-1.5 text-[12px]" onClick={finish}>Skip</Btn></div>
    </div>
  );
}

function GameRow({ g }: { g: SeriesGameView }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px]" data-testid={`series-game-${g.index}`} data-winner={g.winner}>
      <span className="dyn-title w-14 font-semibold text-white">Game {g.index}</span>
      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", g.winner === "you" ? LABEL_TONE.Winning : LABEL_TONE.Losing)}>{g.winner === "you" ? "Won" : "Lost"}</span>
      <span className="dyn-num text-white/70">{g.points.join(" · ")}</span>
      <span className="text-white/55">{HOW_TEXT[g.how]}</span>
      {g.objective ? <span className="text-violet-200/90">Baron {g.objective.correct_count}/3</span> : null}
      <span className="ml-auto text-[10.5px] uppercase tracking-[0.12em] text-white/45">{g.lineup_id}{g.decision ? ` · then ${g.decision.replace("_", " ")}` : ""}</span>
    </li>
  );
}

function PendingConsequences({ games }: { games: SeriesGameView[] }) {
  const all = games.flatMap((g) => g.pending_consequences.map((e) => ({ g: g.index, e })));
  return (
    <Plate className="flex flex-col gap-2 p-3" testId="pending-consequences">
      <div className="flex items-center gap-2"><Eyebrow>Carried-over state</Eyebrow><SimTag>E3 pending</SimTag></div>
      {all.length ? (
        <>
          <p className="text-[12px] text-white/60">Typed persistent effects the server recorded. In E1 they are <b>pending and applied to nothing</b>: a future state engine (E3) will consume each once. They did not change any later game.</p>
          <div className="flex flex-wrap gap-1.5">{all.map(({ g, e }, i) => <span key={i} className="inline-flex items-center gap-1"><span className="text-[10px] text-white/40">G{g}</span><ServerEffectChip e={e} /></span>)}</div>
        </>
      ) : <p className="text-[12px] text-white/60">No persistent effects were recorded in these games.</p>}
    </Plate>
  );
}

export function Bo5Flow({ transport }: { transport?: DynastySeriesTransport }) {
  const t = useMemo(() => transport ?? new FixtureSeriesServer({ store: browserStore(), delayMs: 140 }), [transport]);
  const s = useDynastySeries(t);
  const sting = useStinger();
  const [brand, setBrand] = useState<string | null>(() => readBrand());
  const [picking, setPicking] = useState(false);
  const [rosterSeen, setRosterSeen] = useState(false);
  const [resultSeen, setResultSeen] = useState<number>(0);
  /** games whose final in-game frame the player has left (the settled game stays on stage until then) */
  const [gameAck, setGameAck] = useState<number>(0);
  const [locking, setLocking] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [decision, setDecision] = useState<BetweenGameDecisionId>("keep_plan");
  const [mood, setMood] = useState<ServerGameMood | "home">("home");
  const mainRef = useRef<HTMLElement>(null);
  const env = s.env;
  const org = ORGS.find((o) => o.id === brand) ?? ORGS[0];
  const series = env?.series ?? null;

  useEffect(() => installDynastyAudioUnlock(), []);

  const screen = !env ? (s.loading ? "loading" : picking ? "org" : "home")
    : series!.status === "prep" ? (rosterSeen ? "prep" : "roster")
    : series!.status === "drafting" ? "draft"
    : series!.status === "in_game" || series!.games.length > gameAck ? "game"
    : (series!.games.length > resultSeen ? "result" : series!.status === "complete" ? "series" : "decision");

  useEffect(() => {
    window.scrollTo?.(0, 0);
    mainRef.current?.querySelector<HTMLElement>("h2[tabindex]")?.focus({ preventScroll: true });
    if (screen !== "game") ambientNewGame(`ux3|${screen}|${series?.games.length ?? 0}`);
    if (screen !== "game") setMood("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by screen on purpose
  }, [screen]);

  // Resume / re-entry: whatever the server already settled counts as seen; the last result is shown again.
  const inited = useRef(false);
  const announced = useRef(0);
  useEffect(() => {
    if (inited.current || !series) return;
    inited.current = true;
    const n = series.games.length;
    announced.current = n;
    setGameAck(n);
    setResultSeen(series.status === "in_game" || series.status === "drafting" ? n : Math.max(0, n - 1));
    if (series.status !== "prep") setRosterSeen(true);
  }, [series]);
  const resetLocal = () => { setRosterSeen(false); setResultSeen(0); setGameAck(0); setPlan(null); announced.current = 0; inited.current = false; };

  // Series broadcast: fires once per recorded game, from the server tally only.
  useEffect(() => {
    if (!series || !inited.current || series.games.length <= announced.current) return;
    announced.current = series.games.length;
    const g = series.games[series.games.length - 1];
    const score = `${series.wins}–${series.losses}`;
    playMoment(g.winner === "you" ? "dyn.result.game_win" : "dyn.result.game_loss");
    if (series.status === "complete") sting({ id: series.winner === "you" ? "series.won" : "series.lost", kicker: "Series", title: series.winner === "you" ? `Series won ${score}` : `Series lost ${score}`, tone: series.winner === "you" ? "gold" : "red", ms: 2200, cue: "dynasty.series.point" });
    else if (matchPoint(series)) sting({ id: "series.point", kicker: series.wins === 2 && series.losses === 2 ? "Game five decides it" : series.wins === 2 ? "Match point" : "They have match point", title: g.winner === "you" ? `Victory · ${score}` : `Defeat · ${score}`, tone: series.wins === 2 ? "gold" : "red", ms: 2200, cue: "dynasty.series.match_point" });
    else sting({ id: g.winner === "you" ? "game.win" : "game.loss", kicker: `Game ${g.index}`, title: g.winner === "you" ? "Victory" : "Defeat", sub: `Series ${score}`, tone: g.winner === "you" ? "gold" : "red" });
  }, [series, sting]);

  useEffect(() => { if (series?.plan) setPlan((p) => p ?? series.plan); }, [series?.plan]);

  const results = series?.games.map((g) => (g.winner === "you" ? "W" as const : "L" as const)) ?? [];
  const last = series?.games[series.games.length - 1];
  const envState: EnvState = {
    accent: ORG_ACCENT[org.id]?.hex, mono: ORG_ACCENT[org.id]?.mono, team: org.name, opp: series?.opponent.name,
    roster: ROLE_ORDER.map((r) => ({ name: `SYN ${series?.team.team_id ?? "t_user"}-${r}`, role: r, kind: "academy" as const })),
    results, cohesion: undefined,
    mood: screen === "result" || screen === "decision" || screen === "series" ? (last?.winner === "you" ? "win" : "loss") : "neutral",
  };
  const teamName = shortName(org.name);
  const busy = !!s.busy;

  let body: ReactNode = null;
  if (screen === "loading") {
    body = <Plate className="p-4" testId="series-loading"><p className="text-sm text-white/70" role="status">Connecting to the series…</p></Plate>;
  } else if (screen === "home") {
    body = (
      <Screen testId="bo5-home" eyebrow="Worlds Dynasty · BO5" title="A best-of-five, played by the server" hero kicker="Every stage, event, Baron and result below is real E1 machine output, replayed through the adapter boundary.">
        <Plate ornate className="flex flex-col gap-2 p-4">
          <p className="text-sm text-white/80">Choose an organization, prepare for <b>SYN t_opp</b>, draft one of three legal lineups each game, and play until one team has three wins.</p>
          <p className="text-[12px] text-white/55">Qualification policy: <code className="text-white/75">narrow_early_mid_combo</code> (candidate; owner decision pending). A three-question Baron appears only when the server qualifies it.</p>
        </Plate>
        <div className="flex justify-end"><Btn primary beckon testId="bo5-new" onClick={() => setPicking(true)}>Start a series</Btn></div>
      </Screen>
    );
  } else if (screen === "org") {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-[12px] text-white/55" data-testid="org-branding-note">Organization = your broadcast identity (crest, colours, name). The server roster is the same synthetic team whichever you pick; org-specific rosters need the RUN-2 run service.</p>
        <OrgScreen onChoose={async (o) => { setBrand(o.id); writeBrand(o.id); const out = await s.create(); if (out) { setPicking(false); sting({ id: "org.choose", kicker: "Your organization", title: shortName(o.name), sub: "BO5 vs SYN t_opp", tone: "gold", cue: "dynasty.org.choose" }); } }} />
      </div>
    );
  } else if (screen === "roster" && series) {
    body = (
      <Screen testId="bo5-roster" eyebrow="Starting roster" title="Five on the server roster" kicker="The legal starting five for this series, as the server defines it. Roster assembly (signings, bench) is not hosted yet."
        actions={<Btn primary beckon testId="roster-confirm" onClick={() => setRosterSeen(true)}>Confirm the roster</Btn>}>
        <ul className="grid gap-2 sm:grid-cols-5" data-testid="server-roster">
          {ROLE_ORDER.map((r) => (
            <li key={r} className={cn(PLATE, "flex flex-col items-center gap-1 p-3 text-center")}>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">{r}</span>
              <span className="dyn-title text-[14px] font-semibold text-white">{series.team.team_id}-{r}</span>
              <span className="text-[10.5px] text-white/50">ratings set by the lineup plan</span>
            </li>
          ))}
        </ul>
        <SourceChip kind="synthetic" />
      </Screen>
    );
  } else if (screen === "prep" && series) {
    const opp = series.opponent.lineup;
    body = (
      <Screen testId="bo5-prep" eyebrow={`Preparation · vs ${shortName(series.opponent.name)}`} title="Prepare for the opponent"
        kicker="Scouting is the opponent's recorded server lineup. Your preparation is the series game plan: the lineup you draft by default."
        actions={<Btn primary beckon testId="prep-confirm" disabled={!plan || busy} onClick={() => plan && void s.choosePlan(plan)}>Set the game plan</Btn>}>
        <Plate className="flex flex-col gap-2 p-3" testId="opp-dossier">
          <div className="flex items-center gap-2"><Eyebrow>Dossier · {shortName(series.opponent.name)}</Eyebrow><span className="text-[11px] text-white/55">{opp.title}</span></div>
          <ChampRow l={opp} />
        </Plate>
        <LineupChoice lineups={series.legal_lineups} value={plan} onPick={setPlan} testPrefix="plan" />
      </Screen>
    );
  } else if (screen === "draft" && series) {
    const pick = plan ?? series.plan;
    body = (
      <Screen testId="bo5-draft" eyebrow={`Game ${series.current_game} · draft`} title="Lock a legal lineup"
        kicker={<>Three lineups are legal. The server rejects anything else. <span className="text-white/45">Game plan: {series.plan}</span></>}
        actions={<Btn primary beckon testId="draft-lock" disabled={!pick || busy} onClick={async () => { if (!pick) return; const out = await s.lockLineup(pick); if (out) setLocking(true); }}>Lock in</Btn>}>
        <LineupChoice lineups={series.legal_lineups} value={pick} onPick={setPlan} testPrefix="draft" />
      </Screen>
    );
  } else if (screen === "game" && env?.game) {
    body = <ServerGame key={`g${series!.status === "in_game" ? series!.current_game : series!.games[series!.games.length - 1]?.index}`} s={s} env={env} teamName={teamName} accent={ORG_ACCENT[org.id]?.hex} mono={ORG_ACCENT[org.id]?.mono} onMood={setMood} onResult={() => setGameAck(series!.games.length)} />;
  } else if (screen === "game" && env && !env.game) {
    body = <Plate className="p-4"><p className="text-sm text-white/70">The game has no snapshot yet.</p></Plate>;
  } else if (screen === "result" && series && last) {
    const g = env!.game;
    body = (
      <Screen testId="bo5-result" eyebrow={`Game ${last.index} · result`} title={last.winner === "you" ? "Victory" : "Defeat"} hero={last.winner === "you"}
        kicker={HOW_TEXT[last.how]}
        actions={<Btn primary beckon testId="result-next" onClick={() => setResultSeen(series.games.length)}>{series.status === "complete" ? "See the series" : "Backstage"}</Btn>}>
        <BoPips wins={series.wins} losses={series.losses} />
        <Plate className="flex flex-col gap-2 p-3" testId="result-stages">
          {g?.stages.map((x) => (
            <div key={x.stage} className="flex items-center gap-2 text-[13px]">
              <span className="dyn-title w-12 font-semibold text-white">{STAGE_NAME[x.stage]}</span>
              <span className="dyn-num text-white/85">{x.you_points}–{x.opponent_points}</span>
              {x.outcome_label ? <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", LABEL_TONE[x.outcome_label])}>{x.outcome_label}</span> : <span className="text-white/55">{x.winner === "you" ? "Late won" : "Late lost"}</span>}
            </div>
          ))}
          {last.objective ? <p className="text-[12.5px] text-violet-200/90">Baron: {last.objective.correct_count} of 3, {last.objective.category.replace(/_/g, " ")}.</p> : null}
        </Plate>
        <PendingConsequences games={[last]} />
      </Screen>
    );
  } else if (screen === "decision" && series) {
    const pick = decision === "keep_plan" ? series.plan : plan;
    body = (
      <Screen testId="bo5-decision" eyebrow={`Backstage · before game ${series.current_game}`} title="Between games"
        kicker={matchPoint(series) === "you" ? "Match point. One more win takes the series." : matchPoint(series) === "them" ? "They have match point. Lose this and the series is over." : matchPoint(series) === "both" ? "Two games each: game five decides it." : `Series ${series.wins}–${series.losses}.`}
        actions={<Btn primary beckon testId="decision-confirm" disabled={!pick || busy} onClick={() => pick && void s.decide(decision, pick)}>To the draft</Btn>}>
        <BoPips wins={series.wins} losses={series.losses} />
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Between-game decision">
          {BETWEEN_GAME_DECISIONS.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={decision === d.id} disabled={!d.authoritative} data-testid={`decision-${d.id}`} onClick={() => setDecision(d.id)}
              className={cn(PLATE, "flex flex-col gap-1 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]", decision === d.id && "dyn-plate--selected border-[#e3c66f]/70", !d.authoritative && "cursor-not-allowed opacity-55")}>
              <span className="flex items-center gap-2"><b className="text-white">{d.title}</b><span className="text-[10px] uppercase tracking-[0.14em] text-white/45">{d.kind}</span>{!d.authoritative ? <SimTag>E3 pending</SimTag> : null}</span>
              <span className="text-[12.5px] text-white/65">{d.blurb}{!d.authoritative ? " Needs the E3 state engine; not selectable yet." : ""}</span>
            </button>
          ))}
        </div>
        {decision === "switch_plan" ? <LineupChoice lineups={series.legal_lineups.filter((l) => l.lineup_id !== series.plan)} value={plan === series.plan ? null : plan} onPick={setPlan} testPrefix="switch" /> : null}
        <PendingConsequences games={series.games} />
      </Screen>
    );
  } else if (screen === "series" && series) {
    const won = series.winner === "you";
    body = (
      <Screen testId="bo5-series" eyebrow="Series complete" title={won ? `Series won ${series.wins}–${series.losses}` : `Series lost ${series.wins}–${series.losses}`} hero={won}
        kicker={`First to three, decided by the server's settled games. ${series.games.length} games played.`}
        actions={<Btn testId="series-again" onClick={async () => { await s.abandon(); resetLocal(); }}>New series</Btn>}>
        <BoPips wins={series.wins} losses={series.losses} />
        <ol className="flex flex-col gap-1.5" data-testid="series-games">{series.games.map((g) => <GameRow key={g.index} g={g} />)}</ol>
        <PendingConsequences games={series.games} />
        <Rule />
        <p className="text-[11.5px] text-white/50" data-testid="series-authority">Series tally: <code>{series.authority}</code>. Policy {series.policy.policy_id} ({series.policy.status}).</p>
      </Screen>
    );
  }

  const sceneId = screen === "game" ? null : screen === "prep" ? "warroom" : screen === "draft" ? "warroom" : screen === "result" || screen === "decision" ? "backstage" : screen === "series" ? (series?.winner === "you" ? "trophy" : "backstage") : "hq";
  const pageMood = screen === "game" ? mood : screen === "result" || screen === "decision" ? (last?.winner === "you" ? "victory" : "defeat") : screen === "series" ? (series?.winner === "you" ? "victory" : "defeat") : "home";

  return (
    <div className="dyn min-h-screen pt-11" data-testid="dynasty-bo5" data-screen={screen} data-status={series?.status ?? "none"} data-rev={series?.rev ?? -1} data-mood={pageMood} style={accentStyle(org.id)}>
      {series ? (
        <div className="sticky top-11 z-20 border-b border-white/10 bg-[#07111f]/90 backdrop-blur" data-testid="run-bar">
          <div className="mx-auto flex h-11 max-w-4xl items-center gap-2.5 px-4 text-xs">
            <Crest org={org} size={26} />
            <span className="dyn-title hidden truncate text-[13px] font-semibold text-white sm:inline">{teamName}</span>
            <span className="hidden text-white/50 sm:inline">BO5 vs {shortName(series.opponent.name)}</span>
            <span data-testid="run-bar-series" className="whitespace-nowrap text-white/70">Series <b className="dyn-num text-white">{series.wins}–{series.losses}</b></span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55"><Pips n={series.wins} max={3} label="Your wins" /></span>
            <AmbienceButton />
            <Btn testId="series-leave" className="min-h-[32px] px-2 py-1 text-[11px]" onClick={async () => { await s.abandon(); resetLocal(); }}>Leave</Btn>
          </div>
        </div>
      ) : <div className="fixed right-3 top-[3.25rem] z-20"><AmbienceButton /></div>}
      <main ref={mainRef} className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pb-8 pt-4" data-testid="dynasty-bo5-main">
        <Bo5Banner compact={screen === "game"} />
        <ErrorPanel s={s} />
        {sceneId ? <Scene id={sceneId} caption env={envState} champion={screen === "series" && series?.winner === "you"}>{body}</Scene> : body}
      </main>
      {locking && env && series?.status === "in_game" ? <ServerLockSequence env={env} org={org} onDone={() => setLocking(false)} /> : null}
    </div>
  );
}
