import { createContext, type MouseEvent } from "react";
import type { CatchUpChainLineInfo } from "./presentation";

/** Shared by every row of one Catch-Up render (avoids threading props through four levels). */
export type CatchUpRenderContext = {
  chainByLine: Map<string, CatchUpChainLineInfo>;
  /** The `?since=` baseline in the URL (explicit, never inferred); null when none. */
  shareSince: string | null;
  wording: { sincePatch: string; clampedToCoverageFloor: boolean };
  /** Called on a plain left click of any link back to a Patch Report, before it navigates. */
  onLeaveToReport: (entryId: string, event: MouseEvent<HTMLAnchorElement>) => void;
};

export const CatchUpRenderContextProvider = createContext<CatchUpRenderContext | null>(null);
