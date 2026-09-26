/**
 * PLAY1 — `/playtest/:slug`. The slug IS the invitation capability; the
 * database decides whether it enrolls this account (`playtest_join`), and a
 * repeat load simply resumes the same enrollment.
 *
 * Mounted behind `ProtectedRoute`. A guest (anonymous) session is not a Mogzy
 * account, so it is asked to sign in first — the RPC refuses it regardless.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { authHref } from "@/lib/auth/auth-destination";
import { joinCohort, PlaytestApiError, type JoinedCohort } from "@/features/playtest-director/api";
import { trackPlaytest } from "@/features/playtest-director/analytics";
import { PlaytestParticipant, type ParticipantDeps } from "@/features/playtest-director/participant/PlaytestParticipant";

type Load =
  | { kind: "joining" }
  | { kind: "joined"; joined: JoinedCohort }
  | { kind: "error"; code: string };

export default function PlaytestParticipantPage({
  join = joinCohort,
  deps,
}: { join?: typeof joinCohort; deps?: ParticipantDeps } = {}) {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const [load, setLoad] = useState<Load>({ kind: "joining" });
  const tracked = useRef(false);
  const permanent = !!user && user.is_anonymous !== true;

  useEffect(() => {
    if (!permanent) return;
    let live = true;
    setLoad({ kind: "joining" });
    join(slug).then(
      (joined) => {
        if (!live) return;
        setLoad({ kind: "joined", joined });
        if (!tracked.current) {
          tracked.current = true;
          trackPlaytest("playtest_joined", {
            cohortId: joined.cohortId, enrollmentId: joined.enrollmentId,
            manifestId: joined.manifestId, manifestVersion: joined.manifestVersion,
          }, { resumed: !joined.created });
        }
      },
      (e) => { if (live) setLoad({ kind: "error", code: e instanceof PlaytestApiError ? e.code : "playtest_request_failed" }); },
    );
    return () => { live = false; };
  }, [slug, permanent, join]);

  if (!permanent) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Message testId="playtest-sign-in">
        <p className="text-sm text-muted-foreground">Sign in to your Mogzy account to join this playtest.</p>
        <Button asChild><Link to={authHref(from)}>Sign in</Link></Button>
      </Message>
    );
  }

  if (load.kind === "joining") {
    return (
      <Message testId="playtest-joining">
        <Loader2 className="mx-auto h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </Message>
    );
  }

  if (load.kind === "error") {
    return (
      <Message testId="playtest-join-error">
        <p className="text-sm text-muted-foreground">
          {load.code === "playtest_invitation_invalid"
            ? "This playtest invitation isn't valid, or the session is closed."
            : "Couldn't join the playtest. Refresh to try again."}
        </p>
      </Message>
    );
  }

  return <PlaytestParticipant joined={load.joined} deps={deps} />;
}

function Message({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <main data-testid={testId} className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      {children}
    </main>
  );
}
