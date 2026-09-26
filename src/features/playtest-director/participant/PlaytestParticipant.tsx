/**
 * PLAY1 — the participant wrapper. What it renders is a pure function of the
 * code-owned manifest and the authoritative director row (`participantView`);
 * the only local facts are ones the participant itself produced (an observed
 * Daily return point, a submitted answer), and each of those is re-derived
 * from its own authority after a refresh.
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DailyRunTransport } from "@/lib/daily-challenge/run/client";
import type { StageMatchProps } from "@/pages/quiz-daily-challenge/run/DailyRunPage";
import { participantView, resolveManifest, type FeedbackScene, type PlaytestManifest } from "../manifest";
import { useDirectorState } from "../useDirectorState";
import {
  reportProgress, submitFeedback, type DirectorStateSource, type EnrollmentStatus, type JoinedCohort,
} from "../api";
import { trackPlaytest, type PlaytestContext } from "../analytics";
import type { DailyProjection } from "../dailyObserver";
import { DailyGameplayGate } from "./DailyGameplayGate";

export interface ParticipantDeps {
  source?: DirectorStateSource;
  report?: typeof reportProgress;
  submit?: typeof submitFeedback;
  dailyTransport?: DailyRunTransport;
  StageMatch?: ComponentType<StageMatchProps>;
  viewerUserId?: string;
}

export function PlaytestParticipant({ joined, deps = {} }: { joined: JoinedCohort; deps?: ParticipantDeps }) {
  const manifest = resolveManifest(joined.manifestId, joined.manifestVersion);
  if (!manifest) {
    return (
      <Frame>
        <p data-testid="playtest-unknown-manifest" className="text-sm text-muted-foreground">
          This playtest uses a version this app doesn't know yet. Refresh to update.
        </p>
      </Frame>
    );
  }
  return <ParticipantExperience joined={joined} manifest={manifest} deps={deps} />;
}

function ParticipantExperience({ joined, manifest, deps }: {
  joined: JoinedCohort; manifest: PlaytestManifest; deps: ParticipantDeps;
}) {
  const { state } = useDirectorState(joined.cohortId, deps.source);
  const report = deps.report ?? reportProgress;
  const submit = deps.submit ?? submitFeedback;
  const ctx: PlaytestContext = {
    cohortId: joined.cohortId, enrollmentId: joined.enrollmentId,
    manifestId: manifest.id, manifestVersion: manifest.version,
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set(joined.answeredPromptKeys));

  // Best-effort host projection. Never blocks, never throws into the UI.
  const project = (status: EnrollmentStatus, sceneId: string, daily: DailyProjection | null = null) => {
    report(joined.enrollmentId, status, sceneId, daily).catch(() => { /* projection only */ });
  };
  const projectRef = useRef(project);
  projectRef.current = project;

  const view = state ? participantView(manifest, state) : null;
  const sceneId = state?.sceneId ?? null;
  const kind = view?.kind ?? null;

  // One scene_viewed per scene entered; lifecycle events per scene kind.
  useEffect(() => {
    if (!sceneId || !kind) return;
    trackPlaytest("playtest_scene_viewed", ctxRef.current, { sceneId });
    if (kind === "gameplay") {
      trackPlaytest("playtest_gameplay_released", ctxRef.current, { sceneId });
      projectRef.current("in_gameplay", sceneId);
    } else if (kind === "completion") {
      trackPlaytest("playtest_completed", ctxRef.current, { sceneId });
      projectRef.current("completed", sceneId);
    }
  }, [sceneId, kind]);

  const lastDailyKey = useRef<string | null>(null);

  if (!state || !view) {
    return (
      <Frame>
        <div data-testid="playtest-loading" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Joining the session…
        </div>
      </Frame>
    );
  }

  let body: JSX.Element;
  switch (view.kind) {
    case "unknown_scene":
      body = <p className="text-sm text-muted-foreground">Waiting for the host…</p>;
      break;
    case "presentation":
      body = (
        <div className="space-y-4">
          <h1 className="ranked-title text-2xl font-bold">{view.scene.title}</h1>
          <ol data-testid="playtest-builds" className="space-y-2">
            {view.revealed.map((b) => (
              <li key={b.id} data-testid={`playtest-build-${b.id}`} className="ranked-panel p-3 text-sm">{b.text}</li>
            ))}
          </ol>
        </div>
      );
      break;
    case "gameplay":
      return (
        <div data-testid="playtest-participant" data-scene-id={state.sceneId}
          data-build-step={state.buildStep} data-revision={state.revision}>
          <DailyGameplayGate
            key={view.scene.id}
            scene={view.scene}
            transport={deps.dailyTransport}
            StageMatch={deps.StageMatch}
            viewerUserId={deps.viewerUserId}
            onSnapshot={(p) => {
              const key = `${p.runId}|${p.runStatus}|${p.focusStageIndex}|${p.focusStageStatus}`;
              if (key === lastDailyKey.current) return;
              lastDailyKey.current = key;
              project("in_gameplay", view.scene.id, p);
            }}
            onReturned={(p) => {
              trackPlaytest("playtest_stage_checkpoint_reached", ctx, { sceneId: view.scene.id });
              project("checkpoint_reached", view.scene.id, p);
            }}
          />
        </div>
      );
    case "feedback":
      body = (
        <FeedbackPrompt
          scene={view.scene}
          answered={answered.has(view.scene.prompt.key)}
          onSubmit={async (value) => {
            await submit(joined.enrollmentId, view.scene.prompt.key, view.scene.id, { choice: value });
            setAnswered((prev) => new Set(prev).add(view.scene.prompt.key));
            trackPlaytest("playtest_feedback_submitted", ctx, { sceneId: view.scene.id });
          }}
        />
      );
      break;
    case "completion":
      body = (
        <div className="space-y-2">
          <h1 className="ranked-title text-2xl font-bold">{view.scene.title}</h1>
          <p className="text-sm text-muted-foreground">{view.scene.body}</p>
        </div>
      );
      break;
  }

  return (
    <Frame>
      <div data-testid="playtest-participant" data-scene-id={state.sceneId}
        data-build-step={state.buildStep} data-revision={state.revision}>
        {body}
      </div>
    </Frame>
  );
}

function FeedbackPrompt({ scene, answered, onSubmit }: {
  scene: FeedbackScene; answered: boolean; onSubmit: (value: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (answered) {
    return <p data-testid="playtest-feedback-thanks" className="text-sm text-muted-foreground">Thanks — answer recorded.</p>;
  }
  return (
    <div data-testid="playtest-feedback" className="space-y-3">
      <h2 className="text-lg font-semibold">{scene.prompt.question}</h2>
      <div className="flex flex-wrap gap-2">
        {scene.prompt.options.map((o) => (
          <Button key={o.value} variant="outline" disabled={busy} data-testid={`playtest-feedback-${o.value}`}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try { await onSubmit(o.value); } catch { setError("Couldn't save that — try again."); }
              finally { setBusy(false); }
            }}>
            {o.label}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
      {children}
    </main>
  );
}
