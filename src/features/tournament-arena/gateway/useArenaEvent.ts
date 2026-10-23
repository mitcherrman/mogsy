import { useEffect, useMemo, useState } from "react";

import type { ArenaEvent } from "../contracts";
import type { ArenaGateway } from "./types";

/**
 * The live projection of one event from a gateway. With the HTTP gateway
 * this is where `since_revision` polling (5 s live / 15 s idle / paused while
 * hidden) attaches; the fixture gateway pushes revisions synchronously.
 */
export function useArenaEvent(gateway: ArenaGateway, eventId: string | null): ArenaEvent | null {
  const [ev, setEv] = useState<ArenaEvent | null>(() => (eventId ? gateway.getEvent(eventId) : null));
  useEffect(() => {
    if (!eventId) {
      setEv(null);
      return;
    }
    setEv(gateway.getEvent(eventId));
    return gateway.subscribe(eventId, setEv);
  }, [gateway, eventId]);
  return useMemo(() => ev, [ev]);
}
