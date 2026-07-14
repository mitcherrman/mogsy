import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock, Star } from "lucide-react";
import {
  MOCK_PLAYERS,
  MockQuestion,
  PlayerId,
  PrototypeAbility,
  finalNormalAbility,
  getDuelClass,
  usableAbilities,
  allClassAbilities,
  MAX_LEVEL,
} from "./fixtures";
import { DuelState, DuelAction, RoundPlayerState } from "./duelMachine";
import { Dispatch, useState } from "react";
import { FIXTURE_PLAYER_IDS } from "./backend-adapter/backendSettlementFixtures";
import {
  RESOLVED_ENVELOPE_SCENARIOS,
  getResolvedEnvelopeScenario,
} from "./transport-adapter/rankedDuelEnvelopeFixtures";
import { adaptResolvedRoundEnvelope } from "./transport-adapter/adaptResolvedRoundEnvelope";
import { ApiResolvedRoundLoader } from "./transport-client/ApiResolvedRoundLoader";

const CHOICE_LABELS = ["A", "B", "C", "D"];

/**
 * Same-screen developer controls. This is the ONLY place a player's actual
 * answer/ability choice is visible before reveal, and it is split into
 * per-player tabs so operating one player doesn't expose the other's picks
 * in the primary duel interface above. During a progression stop the tabs
 * host each player's Level 2 ability choice cards.
 */
export function OperatorPanel({
  state,
  question,
  dispatch,
}: {
  state: DuelState;
  question: MockQuestion;
  dispatch: Dispatch<DuelAction>;
}) {
  const active = state.phase === "question";

  return (
    <section
      aria-label="Developer operator panel"
      className="rounded-xl border-2 border-dashed border-amber-500/50 bg-amber-500/5 p-4"
      data-testid="operator-panel"
    >
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">
          DEV CONTROLS
        </Badge>
        <span className="text-xs text-muted-foreground">
          Operate both players locally. Choices here stay hidden from the duel panels until reveal.
        </span>
      </div>

      <Tabs defaultValue="p1">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="p1">Player 1 · {MOCK_PLAYERS.p1.name}</TabsTrigger>
          <TabsTrigger value="p2">Player 2 · {MOCK_PLAYERS.p2.name}</TabsTrigger>
        </TabsList>
        {(["p1", "p2"] as PlayerId[]).map((p) => (
          <TabsContent key={p} value={p}>
            {state.phase === "progression" ? (
              <ProgressionControls player={p} state={state} dispatch={dispatch} />
            ) : (
              <PlayerControls
                player={p}
                state={state}
                round={state.roundPlayers[p]}
                question={question}
                active={active}
                dispatch={dispatch}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      {(state.phase === "question" || state.phase === "awaiting_reveal") && (
        <>
          <SettlementScenarioPicker dispatch={dispatch} />
          <ApiResolvedRoundLoader dispatch={dispatch} />
        </>
      )}
    </section>
  );
}

/**
 * Dev-only picker that resolves the CURRENT round from a deterministic
 * backend-shaped settlement fixture (mapped through the adapter) instead of
 * the mock resolver. Proves the UI consumes already-resolved backend totals.
 */
function SettlementScenarioPicker({ dispatch }: { dispatch: Dispatch<DuelAction> }) {
  const [key, setKey] = useState(RESOLVED_ENVELOPE_SCENARIOS[0].key);
  return (
    <div className="mt-3 border-t border-dashed border-amber-500/40 pt-3 flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="border-amber-500/60 text-amber-600 dark:text-amber-400">
        BACKEND SETTLEMENT FIXTURES
      </Badge>
      <label className="sr-only" htmlFor="settlement-scenario">
        Settlement scenario
      </label>
      <select
        id="settlement-scenario"
        data-testid="settlement-scenario-select"
        className="h-8 rounded-md border bg-background px-2 text-xs max-w-full"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      >
        {RESOLVED_ENVELOPE_SCENARIOS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        data-testid="apply-settlement"
        onClick={() => {
          const scenario = getResolvedEnvelopeScenario(key);
          if (!scenario) return;
          dispatch({
            type: "APPLY_BACKEND_SETTLEMENT",
            // Full read-endpoint envelope -> strict validation -> exact
            // payload -> existing settlement adapter. Explicit id mapping —
            // array order never decides p1/p2.
            settlement: adaptResolvedRoundEnvelope(scenario.envelope, FIXTURE_PLAYER_IDS),
          });
        }}
      >
        Resolve round from fixture
      </Button>
      <span className="text-[11px] text-muted-foreground basis-full">
        Applies a full resolved-round envelope (ranked_duel.resolved_round.v1) through strict
        validation and the adapter — no combat math runs in the frontend.
      </span>
    </div>
  );
}

/** Level 2 ability choice cards for one player during a progression stop. */
function ProgressionControls({
  player,
  state,
  dispatch,
}: {
  player: PlayerId;
  state: DuelState;
  dispatch: Dispatch<DuelAction>;
}) {
  const match = state.players?.[player];
  const prog = state.progression?.[player];
  if (!match || !prog) return null;
  const cls = getDuelClass(match.classId);

  if (!prog.needsChoice) {
    const finalAbility = finalNormalAbility(cls, match.chosenLevelTwoAbilityId);
    return (
      <p className="text-sm text-muted-foreground pt-3" data-testid={`${player}-progression-controls`}>
        {prog.finalAbilityUnlocked && finalAbility
          ? `${finalAbility.name} (final normal ability) unlocked automatically — no choice required.`
          : "No action needed for this player."}
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2" data-testid={`${player}-progression-controls`}>
      <div className="text-xs font-semibold">
        Level 2 reached — choose ONE normal ability
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">
        Your pick is permanent for this match and stays hidden until everyone confirms. The other
        option isn't lost — it unlocks automatically at Level 3.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cls.levelTwoChoices.map((a) => {
          const selected = prog.selectedAbilityId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={selected}
              disabled={prog.confirmed}
              onClick={() => dispatch({ type: "CHOOSE_LEVEL_TWO", player, abilityId: a.id })}
              className={`rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                {a.name}
                <Badge variant="outline" className="text-[10px]">Normal · Lv2</Badge>
                {selected && <Badge className="ml-auto text-[10px]">Selected</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
              {a.disclaimer && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">{a.disclaimer}</p>
              )}
            </button>
          );
        })}
      </div>
      <Button
        size="sm"
        disabled={prog.confirmed || prog.selectedAbilityId === null}
        onClick={() => dispatch({ type: "CONFIRM_LEVEL_TWO", player })}
      >
        {prog.confirmed ? "Choice locked" : "Confirm choice"}
      </Button>
      {prog.confirmed && (
        <p className="text-[11px] text-muted-foreground">
          Locked in. The other option stays unavailable for the rest of this match.
        </p>
      )}
    </div>
  );
}

function PlayerControls({
  player,
  state,
  round,
  question,
  active,
  dispatch,
}: {
  player: PlayerId;
  state: DuelState;
  round: RoundPlayerState;
  question: MockQuestion;
  active: boolean;
  dispatch: Dispatch<DuelAction>;
}) {
  const match = state.players?.[player];
  if (!match) return null;
  const cls = getDuelClass(match.classId);
  const answered = round.answerIndex !== null;
  const usable = usableAbilities(cls, match.level, match.chosenLevelTwoAbilityId);
  const usableIds = new Set(usable.map((a) => a.id));
  const lockedLabel = (a: PrototypeAbility): string => {
    if (a.slot === "future_ultimate") return "Future — not implemented";
    if (a.slot === "normal") {
      return match.chosenLevelTwoAbilityId
        ? `Unlocks at level ${MAX_LEVEL}` // the unchosen normal, auto at Lv3
        : "Level 2 choice pending";
    }
    return "";
  };

  return (
    <div className="space-y-3 pt-2" data-testid={`${player}-controls`}>
      <div>
        <div className="text-xs font-semibold mb-1.5">Answer (one-shot submit)</div>
        <div className="grid grid-cols-2 gap-2">
          {question.choices.map((choice, i) => {
            const isMine = round.answerIndex === i;
            return (
              <Button
                key={i}
                type="button"
                variant={isMine ? "default" : "outline"}
                size="sm"
                className="justify-start h-auto py-2 whitespace-normal text-left"
                disabled={!active || answered}
                onClick={() => dispatch({ type: "SUBMIT_ANSWER", player, answerIndex: i })}
              >
                <span className="font-bold mr-1.5">{CHOICE_LABELS[i]}.</span>
                {choice}
                {isMine && <Lock className="ml-auto h-3 w-3 shrink-0" aria-hidden />}
              </Button>
            );
          })}
        </div>
        {answered && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Answer submitted — you can still choose or change an ability until the round ends.
          </p>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold mb-1.5">
          Active ability (optional — change freely until locked or round ends)
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Active ability choice">
          {allClassAbilities(cls).map((a) => {
            const isUsable = usableIds.has(a.id);
            const selected = round.selectedAbilityId === a.id;
            return (
              <Button
                key={a.id}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                disabled={!active || !isUsable || round.abilityLocked}
                title={isUsable ? a.description : lockedLabel(a)}
                onClick={() =>
                  dispatch({ type: "SELECT_ABILITY", player, abilityId: selected ? null : a.id })
                }
              >
                {!isUsable && <Lock className="h-3 w-3 mr-1" aria-hidden />}
                {selected && <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden />}
                {a.slot === "future_ultimate" && (
                  <Star className="h-3 w-3 mr-1 text-amber-500" aria-hidden />
                )}
                {a.name}
                {a.slot === "starter_active" && isUsable && (
                  <span className="ml-1 text-[10px] text-muted-foreground">Starter · Lv1</span>
                )}
                {!isUsable && (
                  <span className="ml-1 text-[10px]">{lockedLabel(a)}</span>
                )}
              </Button>
            );
          })}
          {/* Locking with NO ability is a valid, deliberate choice. */}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!active || round.abilityLocked}
            onClick={() => dispatch({ type: "LOCK_ABILITY", player })}
          >
            {round.abilityLocked ? (
              <>
                <Lock className="h-3 w-3 mr-1" aria-hidden />
                Locked for this round
              </>
            ) : round.selectedAbilityId === null ? (
              "Lock in: no ability"
            ) : (
              "Lock ability"
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Your choice stays hidden from the opponent and is revealed at round resolution. Locking
          with no ability is allowed. Prototype note: abilities have no combat effect yet.
        </p>
      </div>
    </div>
  );
}
