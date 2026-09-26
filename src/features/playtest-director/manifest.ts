/**
 * PLAY1 — the Playtest MANIFEST contract, and the one placeholder manifest.
 *
 * A manifest is code-owned and versioned. A cohort stores only its identity
 * (`manifest_id`, `manifest_version`); it never stores a copy, and there is no
 * DB-authored editor. Everything a participant does is derived from exactly
 * two inputs:
 *
 *     manifest  +  authoritative director state (scene_id, build_step, revision)
 *
 * Presentation RETURN POINTS live here, not in components: a gameplay scene
 * names the Daily milestone that hands control back to the presentation
 * (`returnWhen`). A future manifest picks a different milestone — a later
 * stage, or the whole Daily — without any change to Daily or to the wrapper.
 * "Pause after every stage" is therefore never architecture; it would just be
 * a manifest with several gameplay scenes.
 */

export interface PresentationScene {
  kind: "presentation";
  id: string;
  title: string;
  /** Host-revealed, in order. build_step N shows the first N. */
  builds: readonly { id: string; text: string }[];
}

/** The Daily milestone that returns control to the presentation. */
export type GameplayReturnCondition =
  /** A configured stage (0-based, canonical stage_index) is completed or skipped. */
  | { type: "stage_terminal"; stageIndex: number }
  /** The whole Daily run is completed. */
  | { type: "daily_terminal" };

export interface GameplayScene {
  kind: "gameplay";
  id: string;
  title: string;
  /** PLAY1 has exactly one gameplay surface: the canonical Daily Challenge. */
  surface: "daily_challenge";
  returnWhen: GameplayReturnCondition;
  /** Shown once control has returned, until the host advances. */
  heldMessage: string;
}

export interface FeedbackScene {
  kind: "feedback";
  id: string;
  prompt: {
    key: string;
    question: string;
    options: readonly { value: string; label: string }[];
  };
}

export interface CompletionScene {
  kind: "completion";
  id: string;
  title: string;
  body: string;
}

export type PlaytestScene = PresentationScene | GameplayScene | FeedbackScene | CompletionScene;

export interface PlaytestManifest {
  id: string;
  version: number;
  scenes: readonly PlaytestScene[];
}

/** The authoritative director position a participant renders. */
export interface DirectorPosition {
  sceneId: string;
  buildStep: number;
}

export const PLAY1_MANIFEST: PlaytestManifest = {
  id: "play1_placeholder",
  version: 1,
  scenes: [
    {
      kind: "presentation",
      id: "welcome",
      title: "Welcome to the Mogzy playtest",
      builds: [
        { id: "what", text: "Today you'll play the real Daily Challenge, live, together." },
        { id: "how", text: "The host moves the session forward — your screen follows along." },
        { id: "why", text: "When a stage ends we'll pause and ask what you thought." },
      ],
    },
    {
      kind: "gameplay",
      id: "daily_standard",
      title: "Play today's first stage",
      surface: "daily_challenge",
      returnWhen: { type: "stage_terminal", stageIndex: 0 },
      heldMessage: "Stage complete. Hang tight — the host will pick things up from here.",
    },
    {
      kind: "feedback",
      id: "standard_feedback",
      prompt: {
        key: "standard_stage_feel",
        question: "How did that first stage feel?",
        options: [
          { value: "too_easy", label: "Too easy" },
          { value: "just_right", label: "Just right" },
          { value: "too_hard", label: "Too hard" },
        ],
      },
    },
    {
      kind: "completion",
      id: "play1_complete",
      title: "That's the session",
      body: "Thanks for playtesting. The host will wrap up from here.",
    },
  ],
};

const MANIFESTS: readonly PlaytestManifest[] = [PLAY1_MANIFEST];

export function resolveManifest(id: string, version: number): PlaytestManifest | null {
  return MANIFESTS.find((m) => m.id === id && m.version === version) ?? null;
}

export function findScene(manifest: PlaytestManifest, sceneId: string): PlaytestScene | null {
  return manifest.scenes.find((s) => s.id === sceneId) ?? null;
}

export function sceneIndex(manifest: PlaytestManifest, sceneId: string): number {
  return manifest.scenes.findIndex((s) => s.id === sceneId);
}

/**
 * The host's single "Reveal / Advance" step: reveal the next build of a
 * presentation scene, otherwise move to the next scene at build 0. Null at the
 * end of the manifest. The DATABASE decides whether it applies (revision CAS).
 */
export function nextPosition(manifest: PlaytestManifest, at: DirectorPosition): DirectorPosition | null {
  const index = sceneIndex(manifest, at.sceneId);
  if (index < 0) return manifest.scenes.length ? { sceneId: manifest.scenes[0].id, buildStep: 0 } : null;
  const scene = manifest.scenes[index];
  if (scene.kind === "presentation" && at.buildStep < scene.builds.length) {
    return { sceneId: scene.id, buildStep: at.buildStep + 1 };
  }
  const next = manifest.scenes[index + 1];
  return next ? { sceneId: next.id, buildStep: 0 } : null;
}

/** What the participant should see, derived from manifest + state only. */
export type ParticipantView =
  | { kind: "unknown_scene"; sceneId: string }
  | { kind: "presentation"; scene: PresentationScene; revealed: PresentationScene["builds"] }
  | { kind: "gameplay"; scene: GameplayScene }
  | { kind: "feedback"; scene: FeedbackScene }
  | { kind: "completion"; scene: CompletionScene };

export function participantView(manifest: PlaytestManifest, at: DirectorPosition): ParticipantView {
  const scene = findScene(manifest, at.sceneId);
  if (!scene) return { kind: "unknown_scene", sceneId: at.sceneId };
  switch (scene.kind) {
    case "presentation":
      return { kind: "presentation", scene, revealed: scene.builds.slice(0, Math.max(0, at.buildStep)) };
    case "gameplay":
      return { kind: "gameplay", scene };
    case "feedback":
      return { kind: "feedback", scene };
    case "completion":
      return { kind: "completion", scene };
  }
}
