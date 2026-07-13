import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Star } from "lucide-react";
import {
  MOCK_PLAYERS,
  MockQuestion,
  PlayerId,
  PrototypeAbility,
  getDuelClass,
  usableAbilities,
  allClassAbilities,
  MAX_LEVEL,
} from "./fixtures";
import { DuelState, DuelAction, RoundPlayerState } from "./duelMachine";
import { Dispatch } from "react";

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
    </section>
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
    return (
      <p className="text-sm text-muted-foreground pt-3" data-testid={`${player}-progression-controls`}>
        {prog.ultimateUnlocked
          ? `${cls.ultimate.name} (Ultimate) unlocked automatically — no choice required.`
          : "No action needed for this player."}
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2" data-testid={`${player}-progression-controls`}>
      <div className="text-xs font-semibold">
        Level 2 reached — choose ONE normal ability (permanent for this mock match)
      </div>
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
              className={`rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60 ${
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
    if (a.slot === "ultimate") return `Unlocks at level ${MAX_LEVEL}`;
    if (a.slot === "normal") {
      return match.chosenLevelTwoAbilityId
        ? "Not chosen this match"
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
          Ability (optional — change freely until locked or round ends)
        </div>
        <div className="flex flex-wrap gap-2">
          {allClassAbilities(cls).map((a) => {
            const isUsable = usableIds.has(a.id);
            const selected = round.selectedAbilityId === a.id;
            return (
              <Button
                key={a.id}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                disabled={!active || !isUsable || round.abilityLocked}
                title={isUsable ? a.description : lockedLabel(a)}
                onClick={() =>
                  dispatch({ type: "SELECT_ABILITY", player, abilityId: selected ? null : a.id })
                }
              >
                {!isUsable && <Lock className="h-3 w-3 mr-1" aria-hidden />}
                {a.slot === "ultimate" && <Star className="h-3 w-3 mr-1 text-amber-500" aria-hidden />}
                {a.name}
                {!isUsable && (
                  <span className="ml-1 text-[10px]">{lockedLabel(a)}</span>
                )}
              </Button>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!active || round.abilityLocked || round.selectedAbilityId === null}
            onClick={() => dispatch({ type: "LOCK_ABILITY", player })}
          >
            {round.abilityLocked ? "Ability locked" : "Lock ability"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Prototype note: abilities are revealed at round end but have no combat effect yet.
        </p>
      </div>
    </div>
  );
}
