// ---------------------------------------------------------------------------
// The board's selection state: which player+champion the reader is asking
// about, in the matchup and scope currently on screen.
//
// WHY A CONTEXT AND NOT PROPS. The champion tile is five levels below the
// board (LanePlate -> LaneHalf -> CandidateFace -> ChampionPoolSummary ->
// ChampionChip). Threading a callback and the scope label through all five
// would put three parameters on four components that have no other use for
// them. The team key is NOT here: it differs per side and the side already
// knows it.
//
// WHAT THIS IS FOR. Step 2 builds a player x champion dossier. Everything it
// needs to ask a question -- who, which champion, in which lane, against which
// opponent, in which scope -- is captured the moment a tile is clicked, so the
// drawer can be written against a settled shape rather than inventing one.
// Deliberately NOT an API contract: no request is made from this, and no
// endpoint is assumed.
// ---------------------------------------------------------------------------

import { createContext, useContext } from "react";

import type { Lane } from "@/lib/pro-play/matchupApi";

export interface ChampionSelection {
  /** Canonical player key — the same one the media layer and profile use. */
  player_lp_page: string;
  display_name: string;
  /** The player's own team, not the board's "A"/"B". */
  team_key: string;
  /** The other team in the matchup on screen, for the Step 2 question. */
  opponent_team_key: string | null;
  lane: Lane;
  champion: string;
  scope_id: string;
  scope_label: string;
}

export interface BoardSelectionValue {
  /** Board-wide scope label, printed on each player card. */
  scopeLabel: string;
  scopeId: string;
  opponentOf: (teamKey: string) => string | null;
  selected: ChampionSelection | null;
  onSelect: (selection: ChampionSelection) => void;
}

const NOOP: BoardSelectionValue = {
  scopeLabel: "",
  scopeId: "",
  opponentOf: () => null,
  selected: null,
  onSelect: () => {},
};

const BoardSelectionContext = createContext<BoardSelectionValue>(NOOP);

export const BoardSelectionProvider = BoardSelectionContext.Provider;

/**
 * Never throws and never requires a provider. The dossier parts are rendered
 * in isolation by a dozen tests and by the lane explorer, and a context that
 * hard-crashes off the board would make every one of them carry a wrapper for
 * a feature they do not use.
 */
export function useBoardSelection(): BoardSelectionValue {
  return useContext(BoardSelectionContext);
}
