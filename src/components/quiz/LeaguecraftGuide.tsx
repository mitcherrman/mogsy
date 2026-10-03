import { useEffect, useMemo, useRef, useState } from "react";

import {
  MogzyGuide,
  useMogzyGuide,
  type GuideLayout,
  type GuideStorage,
} from "@/components/mogzy-guide";
import {
  LEAGUECRAFT_GUIDE_PLACEMENT,
  LEAGUECRAFT_GUIDE_SURFACE,
  ROLE_FIRST_USE_ID,
  buildLeaguecraftGuideMessages,
} from "@/components/quiz/leaguecraft-guide";

/** Long enough for the bubble's own fade-out to finish before the mascot leaves. */
const LINGER_MS = 500;

/**
 * MG-D — Mogzy on the Leaguecraft lobby.
 *
 * He REFLECTS the lobby; he decides nothing. Every input below is state the
 * page already owns and he only reads it:
 *
 *   hasRole      a role is already on the stage (saved, or restored after auth)
 *   rolePicks    how many times the reader moved the stage this visit
 *   playOpen     the match-entry record is open
 *   playDisabled PLAY is held still by the host (a role write in flight)
 *
 * He holds no queue, availability or account state, never navigates and never
 * writes. The role is persisted exactly when it was before this existed — at
 * the record's Ranked entry — and not a moment earlier.
 *
 * PRESENCE IS MESSAGE-GATED. He is on the page only while he has something to
 * say, and is gone for good once the reader has acted: a returning player sees
 * a lobby with no extra mascot in it. Once PLAY opens the record he leaves, and
 * he is never mounted in the quiz runner at all — gameplay is the focus.
 *
 * Mounted inside the centre scroll's content box, which is `position: relative`
 * and already the lobby's own authored coordinate space (see
 * `LEAGUECRAFT_GUIDE_PLACEMENT`).
 */
export default function LeaguecraftGuide({
  hasRole,
  rolePicks,
  playOpen,
  playDisabled = false,
  storage,
  layout,
}: {
  hasRole: boolean;
  rolePicks: number;
  playOpen: boolean;
  playDisabled?: boolean;
  /** Tests only: inject persistence. */
  storage?: GuideStorage;
  /** Tests only: force a placement layout. */
  layout?: GuideLayout;
}) {
  // Decided ONCE, at mount, and then held. The host mounts this only after the
  // account's role has settled, so `hasRole` is already the truth here. The
  // first-use entry has to stay in the candidate list for the whole visit so
  // the substrate can record its dismissal when the reader picks a role, even
  // though `hasRole` flips true at that very moment.
  const [offerRoleGuidance] = useState(() => !hasRole && !playOpen);
  const rolePicked = rolePicks > 0;

  const messages = useMemo(
    () =>
      buildLeaguecraftGuideMessages({
        offerRoleGuidance,
        rolePicked,
        playEnabled: !playDisabled,
      }),
    [offerRoleGuidance, rolePicked, playDisabled],
  );

  const controller = useMogzyGuide({
    surface: LEAGUECRAFT_GUIDE_SURFACE,
    messages,
    enabled: !playOpen,
    storage,
  });

  // Acting on the prompt answers it: choosing a role, or going straight to
  // PLAY, is the "seen" the first-use line was waiting for.
  const answered = useRef(false);
  const { dismiss } = controller;
  useEffect(() => {
    if (answered.current || !offerRoleGuidance) return;
    if (!rolePicked && !playOpen) return;
    answered.current = true;
    dismiss(ROLE_FIRST_USE_ID);
  }, [offerRoleGuidance, rolePicked, playOpen, dismiss]);

  const active = controller.message !== null;
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (active) {
      setLingering(true);
      return;
    }
    const t = setTimeout(() => setLingering(false), LINGER_MS);
    return () => clearTimeout(t);
  }, [active]);

  if (!active && !lingering) return null;

  return (
    <MogzyGuide
      surface={LEAGUECRAFT_GUIDE_SURFACE}
      message={controller.message}
      placement={LEAGUECRAFT_GUIDE_PLACEMENT}
      layout={layout}
      // Drawn at 40-64 CSS px: the 192px plates cover a 3x display.
      scale="compact"
      onDismiss={controller.dismiss}
      className="z-20 animate-in fade-in duration-300 motion-reduce:animate-none"
    />
  );
}
