/** UX-4 — which authority serves the BO5: the UX-3 contract double or the live E2 series. Copy only. */
import { createContext } from "react";

export const SeriesAuthorityContext = createContext<"fixture" | "live">("fixture");
