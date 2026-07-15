// ---------------------------------------------------------------------------
// Staff-only PLAYABLE ranked duel, wired to the live backend lifecycle.
//
// Two staff testers open this page independently, join the same backend match
// as different players, and play it out. The backend is authoritative for the
// question, correctness, damage, HP, XP, levels, charges, the shared deadline,
// progression gates, and the winner.
//
// This is a controlled two-person staff demonstration tool — not the public
// ranked experience. It is not linked from any navigation.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { DuelArena } from "./DuelArena";
import { ParticipantJoinPanel } from "./ParticipantJoinPanel";
import { StaffMatchCreator } from "./StaffMatchCreator";
import { DEFAULT_STAFF_DUEL_API_BASE } from "./rankedDuelClient";
import { StaffDuelCredentials, useStaffDuelSession } from "./useStaffDuelSession";

export function RankedDuelStaffPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_STAFF_DUEL_API_BASE);
  const [credentials, setCredentials] = useState<StaffDuelCredentials | null>(null);
  const { state, submit, chooseLevelTwo } = useStaffDuelSession(credentials);

  return (
    <div data-testid="staff-duel-page" className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Live staff duel — talks to the backend ranked-duel lifecycle. Staff matches are held in
        the backend&apos;s memory: restarting the backend destroys them.
      </p>

      {!credentials && <StaffMatchCreator baseUrl={baseUrl} onBaseUrlChange={setBaseUrl} />}

      <ParticipantJoinPanel
        baseUrl={baseUrl}
        onBaseUrlChange={setBaseUrl}
        credentials={credentials}
        onJoin={setCredentials}
        onLeave={() => setCredentials(null)}
      />

      {credentials && (
        <DuelArena
          credentials={credentials}
          state={state}
          onSubmit={submit}
          onChooseLevelTwo={chooseLevelTwo}
        />
      )}
    </div>
  );
}

export default RankedDuelStaffPage;
