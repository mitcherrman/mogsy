import { useEffect, useState } from "react";
import { getRankedAvailability, type RankedAvailabilityView } from "@/lib/ranked-public/client";

const CLOSED: RankedAvailabilityView = {
  open: false,
  state: "closed",
  reason: "unavailable",
  nextOpenAt: null,
  closesAt: null,
  serverTime: null,
};

/** Server-authoritative launch availability. Loading and failures fail closed. */
export function useRankedAvailability(): RankedAvailabilityView {
  const [availability, setAvailability] = useState<RankedAvailabilityView>(CLOSED);

  useEffect(() => {
    const controller = new AbortController();
    getRankedAvailability(controller.signal)
      .then(setAvailability)
      .catch(() => setAvailability(CLOSED));
    return () => controller.abort();
  }, []);

  return availability;
}
