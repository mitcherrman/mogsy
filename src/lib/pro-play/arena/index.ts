/**
 * PPQ2-B — Pro Play × Canonical Arena: projection and controller.
 * Typed data only; no component lives under this directory.
 */
export * from "./types";
export {
  INITIAL_PRO_PLAY_ARENA_STATE,
  proPlayArenaReducer,
  canSubmitAnswer,
  canResendAnswer,
  advanceNeedsResync,
  type ProPlayArenaAction,
} from "./state";
export {
  PRO_PLAY_ARENA_MODE,
  PRO_PLAY_REPORT_IDENTITY,
  projectProPlayArena,
  projectProPlayOptions,
  projectProPlayQuestion,
  projectProPlayReportable,
  projectRunPips,
  optionIdForLabel,
} from "./projectProPlayArena";
export {
  bindProPlayArenaSurface,
  composeProPlayArenaView,
  type ProPlayArenaSlots,
  type ProPlayArenaViewModel,
} from "./composeArenaView";
export {
  useProPlayArenaController,
  type ProPlayArenaController,
  type ProPlayArenaControllerOptions,
  type ProPlayArenaTransport,
} from "./useProPlayArenaController";
