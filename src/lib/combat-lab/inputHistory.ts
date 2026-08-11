/**
 * Input history for the Combat Lab sandbox: a pure past → present → future
 * snapshot stack over the user-authored simulator inputs.
 *
 * Scope: this models ONLY canonical input state (attacker config, ability
 * ranks, rank mode, defender setup, summoner picks, hijack target). Combat
 * runtime state, backend responses, credits, previews, skins and other
 * presentation state never enter the stack — undo restores inputs and the
 * existing calculation flow (auto-reset + build-preview) recomputes from them.
 *
 * Transaction policy: discrete choices (selects, pips, toggles, item lists)
 * commit one entry each. Text/numeric typing coalesces per FIELD: while the
 * same single coalescible path keeps changing within COALESCE_WINDOW_MS of the
 * previous commit, the present entry is replaced instead of pushed, so a typed
 * "1234" is one undo step. A different field, a multi-field change, or a pause
 * longer than the window ends the transaction. There is deliberately no global
 * debounce — unrelated actions are never merged.
 */

export const HISTORY_CAP = 50;
export const COALESCE_WINDOW_MS = 1200;

export type HistoryEntry<S> = {
  state: S;
  /** Human-readable description of the change that PRODUCED this state (null for the initial state). */
  label: string | null;
};

export type HistoryState<S> = {
  past: HistoryEntry<S>[];
  present: HistoryEntry<S>;
  future: HistoryEntry<S>[];
  /** Active coalescing transaction (a changed-field path), or null. */
  txnKey: string | null;
  /** Timestamp of the last commit that started or extended the transaction. */
  txnAt: number;
};

export function createHistory<S>(initial: S): HistoryState<S> {
  return {
    past: [],
    present: { state: initial, label: null },
    future: [],
    txnKey: null,
    txnAt: 0,
  };
}

export function canUndo<S>(h: HistoryState<S>): boolean {
  return h.past.length > 0;
}

export function canRedo<S>(h: HistoryState<S>): boolean {
  return h.future.length > 0;
}

export type CommitOptions = {
  label: string;
  /** Non-null marks this commit as coalescible under the given key. */
  txnKey: string | null;
  /** Commit timestamp (injected for determinism in tests). */
  at: number;
  cap?: number;
  coalesceWindowMs?: number;
};

/**
 * Commit the next canonical input state.
 *
 * No-op states (deep-equal to the present) never create an entry. A commit
 * that continues the active same-field transaction replaces the present
 * entry; every other commit pushes the present into the past and clears the
 * redo branch (conventional branching semantics).
 */
export function commit<S>(h: HistoryState<S>, next: S, opts: CommitOptions): HistoryState<S> {
  if (deepEqual(next, h.present.state)) return h;
  const cap = opts.cap ?? HISTORY_CAP;
  const windowMs = opts.coalesceWindowMs ?? COALESCE_WINDOW_MS;
  const coalesce =
    opts.txnKey !== null &&
    opts.txnKey === h.txnKey &&
    opts.at - h.txnAt <= windowMs &&
    opts.at >= h.txnAt;
  if (coalesce) {
    return {
      ...h,
      present: { state: next, label: opts.label },
      future: [],
      txnAt: opts.at,
    };
  }
  const past = [...h.past, h.present];
  // Bound memory: drop the oldest past entries beyond the cap. The present
  // and future stacks are never touched by trimming.
  while (past.length > cap) past.shift();
  return {
    past,
    present: { state: next, label: opts.label },
    future: [],
    txnKey: opts.txnKey,
    txnAt: opts.at,
  };
}

/** Step back one entry. Returns the input unchanged when there is no past. */
export function undo<S>(h: HistoryState<S>): HistoryState<S> {
  if (!canUndo(h)) return h;
  const past = h.past.slice(0, -1);
  const present = h.past[h.past.length - 1];
  return {
    past,
    present,
    future: [h.present, ...h.future],
    // An undo always ends any active typing transaction.
    txnKey: null,
    txnAt: 0,
  };
}

/** Step forward one entry. Returns the input unchanged when there is no future. */
export function redo<S>(h: HistoryState<S>): HistoryState<S> {
  if (!canRedo(h)) return h;
  const [present, ...future] = h.future;
  return {
    past: [...h.past, h.present],
    present,
    future,
    txnKey: null,
    txnAt: 0,
  };
}

/* ───────────────────────── deterministic equality ───────────────────────── */

/**
 * Structural deep equality for plain JSON-ish data (the snapshot shape is
 * objects, arrays, strings, numbers, booleans, null). Object key ORDER is
 * irrelevant; array order is significant (item slots, rune lists). Keys whose
 * value is `undefined` are treated as absent, so `{ ad: undefined }` equals
 * `{}` — optional SimulateRequest fields reconstruct both ways.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bKeys = Object.keys(bo).filter((k) => bo[k] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in bo)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

/* ─────────────────────────── change description ─────────────────────────── */

/**
 * Dot-paths at which two snapshots differ. Descends into plain objects up to
 * `maxDepth` levels; arrays and deeper structures are compared as leaves.
 * Depth 3 is enough to name `config.stats.LEVEL` distinctly.
 */
export function changedPaths(a: unknown, b: unknown, maxDepth = 3): string[] {
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, path: string, depth: number) => {
    if (deepEqual(x, y)) return;
    const plainObjects =
      x !== null &&
      y !== null &&
      typeof x === "object" &&
      typeof y === "object" &&
      !Array.isArray(x) &&
      !Array.isArray(y);
    if (!plainObjects || depth >= maxDepth) {
      out.push(path);
      return;
    }
    const xo = x as Record<string, unknown>;
    const yo = y as Record<string, unknown>;
    const keys = new Set([...Object.keys(xo), ...Object.keys(yo)]);
    for (const k of keys) {
      walk(xo[k], yo[k], path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(a, b, "", 0);
  return out;
}

/**
 * The composite user-authored Combat Lab input snapshot. The config and
 * target-setup shapes stay generic so this module does not import page-local
 * types; the page instantiates it with SimulateRequest / TargetSetupState.
 */
export type CombatLabInputSnapshot<C = unknown, T = unknown> = {
  config: C;
  abilityRanks: { Q: number; W: number; E: number; R: number };
  rankMode: "sandbox" | "real_match";
  targetSetup: T;
  summonerPicks: string[];
  hijackTarget: string;
};

/**
 * Fields whose edits arrive keystroke-by-keystroke (number/text inputs) and
 * therefore coalesce into one transaction while the SAME field keeps changing.
 * Everything else (selects, item lists, pips, toggles) is a discrete step.
 */
const COALESCIBLE_PATHS = new Set([
  "config.ad",
  "config.attack_speed",
  "config.sequence",
  "config.stats.LEVEL",
  "targetSetup.targetLevel",
  "targetSetup.dummyHP",
  "targetSetup.dummyArmor",
  "targetSetup.dummyMR",
  "targetSetup.dummyShield",
  "targetSetup.dummyDR",
]);

/** Longest-prefix-match labels, checked in order. Kept user-facing: these
 *  strings surface in "Undid …" / "Redid …" feedback. */
const PATH_LABELS: Array<[prefix: string, label: string]> = [
  ["config.champion", "champion change"],
  ["config.items", "item change"],
  ["config.runes", "rune change"],
  ["config.stats.LEVEL", "level change"],
  ["config.stats", "stat override change"],
  ["config.crit_mode", "crit mode change"],
  ["config.target_profile", "target profile change"],
  ["config.ad", "AD override change"],
  ["config.attack_speed", "attack speed change"],
  ["config.sequence", "combo change"],
  ["config.ranks", "ability rank change"],
  ["config", "attacker setup change"],
  ["abilityRanks", "ability rank change"],
  ["rankMode", "rank mode change"],
  ["targetSetup.targetChampionName", "defender champion change"],
  ["targetSetup.targetItemNames", "defender item change"],
  ["targetSetup.targetRuneNames", "defender rune change"],
  ["targetSetup.targetLevel", "defender level change"],
  ["targetSetup.targetMode", "defender mode change"],
  ["targetSetup.dummy", "target dummy change"],
  ["targetSetup", "defender setup change"],
  ["summonerPicks", "summoner change"],
  ["hijackTarget", "hijack target change"],
];

export type ChangeDescription = {
  label: string;
  txnKey: string | null;
  paths: string[];
};

function labelForPath(path: string): string {
  for (const [prefix, label] of PATH_LABELS) {
    if (path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(prefix)) {
      return label;
    }
  }
  return "setup change";
}

/**
 * Classify one observed snapshot transition: which field(s) changed, the
 * user-facing label for feedback, and whether the change may coalesce.
 * Multi-field changes (presets, restores) never coalesce.
 */
export function describeCombatLabChange<C, T>(
  prev: CombatLabInputSnapshot<C, T>,
  next: CombatLabInputSnapshot<C, T>
): ChangeDescription {
  const paths = changedPaths(prev, next);
  if (paths.length === 0) {
    return { label: "", txnKey: null, paths };
  }
  if (paths.length === 1) {
    const path = paths[0];
    return {
      label: labelForPath(path),
      txnKey: COALESCIBLE_PATHS.has(path) ? path : null,
      paths,
    };
  }
  const labels = new Set(paths.map(labelForPath));
  return {
    label: labels.size === 1 ? [...labels][0] : "setup change",
    txnKey: null,
    paths,
  };
}
